import * as vscode from 'vscode';
import { PACK_ENTRY, VORTEX_PROBE_INTERVAL_MS, VORTEX_QUIT_TIMEOUT_MS } from '../constants';
import { runBuild, saveForBuild } from '../project/npmTasks';
import type { VortexProject } from '../types/project';
import { fileExists } from '../utils/fileSystemUtils';
import { Logger } from '../utils/logger';
import { vortexAttachConfiguration } from './attachConfiguration';
import { ForeignPortError, HTTP_CDP, type CdpProbe, vortexWindowState, waitForPageTarget } from './cdpProbe';
import { deployPack, isDeployedCurrent, readPackId } from './packDeployment';
import type { VortexInstall } from './vortexInstall';
import { debugArguments, SYSTEM_LAUNCHER, type VortexLauncher } from './vortexLauncher';

export type DebugOutcome =
    | { readonly kind: 'attached'; readonly packId: string; readonly reused: boolean }
    | { readonly kind: 'cancelled' }
    | { readonly kind: 'declined' }
    /** Vortex deleted the deployed extension while starting, so attaching would debug nothing */
    | { readonly kind: 'removed'; readonly packId: string }
    | { readonly kind: 'failed'; readonly reason: string };

export type PortInUseChoice = 'attach' | 'restart' | 'cancel';
export type VortexRunningChoice = 'close' | 'retry' | 'cancel';

/** Every question the flow asks, so a test can answer them without a dialog */
export interface DebugFlowUi {
    confirmPortInUse(stale: boolean): Promise<PortInUseChoice>;
    confirmVortexRunning(): Promise<VortexRunningChoice>;
    confirmForceClose(): Promise<boolean>;
}

export interface DebugFlowDeps {
    readonly launcher?: VortexLauncher;
    readonly cdp?: CdpProbe;
    readonly build?: (folder: vscode.WorkspaceFolder, token?: vscode.CancellationToken) => Promise<void>;
    readonly startDebugging?: (folder: vscode.WorkspaceFolder, configuration: vscode.DebugConfiguration) => Thenable<boolean>;
    readonly quitTimeoutMs?: number;
}

export interface DebugFlowOptions {
    readonly project: VortexProject;
    readonly install: VortexInstall;
    readonly port: number;
    readonly ui: DebugFlowUi;
    readonly report: (message: string) => void;
    readonly token: vscode.CancellationToken;
}

export type AttachFlowOptions = Pick<DebugFlowOptions, 'project' | 'port' | 'report' | 'token'>;

export interface DeployOptions {
    readonly project: VortexProject;
    readonly pluginsFolder: vscode.Uri;
    readonly report: (message: string) => void;
    readonly token: vscode.CancellationToken;
    readonly build?: DebugFlowDeps['build'];
}

export type Stopped = Exclude<DebugOutcome, { readonly kind: 'attached' }>;

type Flow = DebugFlowOptions & Required<DebugFlowDeps>;
type LaunchPlan = 'launch' | 'attach' | 'declined';

const ANOTHER_BROWSER = 'another browser';

const startVsCodeDebugging: Required<DebugFlowDeps>['startDebugging'] = (folder, configuration) => vscode.debug.startDebugging(folder, configuration);

const wait = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Builds, deploys, starts Vortex and attaches.
 *
 * A release Vortex only opens the debugging port when it is started with the switch, and its
 * single instance lock makes a second launch quit instead of opening a window — so an already
 * running Vortex has to be closed, or attached to as it is.
 */
export async function runDebugFlow(options: DebugFlowOptions, deps: DebugFlowDeps = {}): Promise<DebugOutcome> {
    const flow: Flow = {
        ...options,
        launcher: deps.launcher ?? SYSTEM_LAUNCHER,
        cdp: deps.cdp ?? HTTP_CDP,
        build: deps.build ?? runBuild,
        startDebugging: deps.startDebugging ?? startVsCodeDebugging,
        quitTimeoutMs: deps.quitTimeoutMs ?? VORTEX_QUIT_TIMEOUT_MS,
    };

    flow.report('Checking Vortex...');
    const plan = await planForRunningVortex(flow);
    if (plan === 'declined') {
        return { kind: 'declined' };
    }
    if (flow.token.isCancellationRequested) {
        return { kind: 'cancelled' };
    }
    if (plan === 'attach') {
        return attach(flow, await readPackId(flow.project.folder.uri), true);
    }

    const packId = await buildAndDeploy({ ...flow, pluginsFolder: flow.install.pluginsFolder });
    if (typeof packId !== 'string') {
        return packId;
    }
    return await launchAndWait(flow, packId) ?? attach(flow, packId, false);
}

/**
 * Attaches to the Vortex that is running, and does nothing else.
 *
 * Whatever offered this may be out of date, so Vortex is asked again: attaching during the splash
 * screen can hang it, and a port that has closed must not turn into a build and a launch.
 */
export async function runAttachFlow(options: AttachFlowOptions, deps: Pick<DebugFlowDeps, 'cdp' | 'startDebugging'> = {}): Promise<DebugOutcome> {
    const { project, port } = options;
    const targets = await (deps.cdp ?? HTTP_CDP).targets(port);
    if (targets.status === 'foreign') {
        throw new ForeignPortError(port, targets.detail);
    }
    if (targets.status === 'closed') {
        return { kind: 'failed', reason: `Nothing is listening on port ${port} any more, so Vortex has probably closed.` };
    }
    const state = vortexWindowState(targets.value);
    if (state === 'other') {
        throw new ForeignPortError(port, ANOTHER_BROWSER);
    }
    if (state === 'starting') {
        return { kind: 'failed', reason: 'Vortex is still starting. Try again once its window is up.' };
    }
    return attach({ ...options, startDebugging: deps.startDebugging ?? startVsCodeDebugging }, await readPackId(project.folder.uri), true);
}

async function planForRunningVortex(flow: Flow): Promise<LaunchPlan> {
    const running = await flow.cdp.version(flow.port);
    if (running.status === 'foreign') {
        throw new ForeignPortError(flow.port, running.detail);
    }
    return running.status === 'ok' ? planForOpenPort(flow) : planForClosedPort(flow);
}

async function planForOpenPort(flow: Flow): Promise<LaunchPlan> {
    const { project, install, ui } = flow;
    const deployedId = await readPackId(project.folder.uri).catch(() => undefined);
    const stale = deployedId === undefined
        || !await isDeployedCurrent(project.folder.uri, install.pluginsFolder, deployedId);
    const choice = await ui.confirmPortInUse(stale);
    if (choice === 'cancel') {
        return 'declined';
    }
    if (choice === 'attach') {
        return 'attach';
    }
    return await closeVortex(flow) ? 'launch' : 'declined';
}

async function planForClosedPort(flow: Flow): Promise<LaunchPlan> {
    if (await flow.launcher.isVortexRunning() !== true) {
        return 'launch';
    }
    const choice = await flow.ui.confirmVortexRunning();
    if (choice === 'cancel' || (choice === 'close' && !await closeVortex(flow))) {
        return 'declined';
    }
    return 'launch';
}

async function closeVortex({ launcher, ui, quitTimeoutMs }: Flow): Promise<boolean> {
    await launcher.requestClose(false);
    const deadline = Date.now() + quitTimeoutMs;
    while (Date.now() < deadline) {
        if (await launcher.isVortexRunning() !== true) {
            return true;
        }
        await wait(VORTEX_PROBE_INTERVAL_MS);
    }
    if (!await ui.confirmForceClose()) {
        return false;
    }
    await launcher.requestClose(true);
    await wait(VORTEX_PROBE_INTERVAL_MS);
    return await launcher.isVortexRunning() !== true;
}

/** @returns The id of the deployed extension, or why it stopped */
export async function buildAndDeploy({ project, pluginsFolder, report, token, build = runBuild }: DeployOptions): Promise<string | Stopped> {
    await saveForBuild(project.folder);
    report(`Building ${project.folder.name}...`);
    await build(project.folder, token);
    if (token.isCancellationRequested) {
        return { kind: 'cancelled' };
    }

    const packId = await readPackId(project.folder.uri);
    report(`Deploying ${packId}...`);
    const files = await deployPack(project.folder.uri, pluginsFolder, packId, token);
    Logger.info(`Deployed ${files} files of ${packId} to ${pluginsFolder.fsPath}`);
    return token.isCancellationRequested ? { kind: 'cancelled' } : packId;
}

/** @returns Why the flow stopped, or undefined once Vortex's window can be attached to */
async function launchAndWait({ install, port, launcher, cdp, report, token }: Flow, packId: string): Promise<Stopped | undefined> {
    report('Starting Vortex...');
    const launched = launcher.launch(install.exe, debugArguments(port));
    Logger.info(`Started ${install.exe} on port ${port} as pid ${launched.pid ?? 'unknown'}`);
    report('Waiting for Vortex\'s window...');
    const outcome = await Promise.race([
        waitForPageTarget(cdp, port, { token, onProgress: phase => report(phase === 'browser' ? 'Waiting for Vortex\'s window...' : 'Waiting for Vortex to start...') })
            .then(() => ({ ready: true as const })),
        launched.exited.then(code => ({ ready: false as const, code })),
    ]).finally(() => launched.release());
    if (!outcome.ready) {
        // an Electron second instance fails the single instance lock and quits within seconds
        return {
            kind: 'failed',
            reason: outcome.code === 0
                ? 'Vortex quit right after starting, which happens when another Vortex already holds its single instance lock. Close every Vortex window and try again.'
                : `Vortex exited with code ${outcome.code ?? 'unknown'} before its window appeared.`,
        };
    }

    // Vortex deletes extension folders while it starts, for a removal that is still pending or
    // for an id a bundled extension claims, so what was just deployed may be gone again
    return await fileExists(vscode.Uri.joinPath(install.pluginsFolder, packId, PACK_ENTRY)) ? undefined : { kind: 'removed', packId };
}

async function attach({ project, port, report, startDebugging, token }: AttachFlowOptions & Pick<Flow, 'startDebugging'>, packId: string, reused: boolean): Promise<DebugOutcome> {
    if (token.isCancellationRequested) {
        return { kind: 'cancelled' };
    }
    report('Attaching...');
    const configuration = vortexAttachConfiguration({ packId, folder: project.folder.uri, port });
    Logger.info(`Attaching with ${JSON.stringify(configuration)}`);
    const started = await startDebugging(project.folder, configuration);
    return started
        ? { kind: 'attached', packId, reused }
        : { kind: 'failed', reason: 'VS Code refused to start the debug session. The log holds the configuration that was used.' };
}
