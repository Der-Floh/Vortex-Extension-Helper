import * as vscode from 'vscode';
import { VORTEX_PROBE_INTERVAL_MS, VORTEX_QUIT_TIMEOUT_MS } from '../constants';
import { runBuild } from '../project/npmTasks';
import type { VortexProject } from '../types/project';
import { fileExists, saveDirtyDocuments } from '../utils/fileSystemUtils';
import { Logger } from '../utils/logger';
import { vortexAttachConfiguration } from './attachConfiguration';
import { HTTP_CDP, type CdpProbe, waitForPageTarget } from './cdpProbe';
import { deployPack, isDeployedCurrent, PACK_ENTRY, readPackId } from './packDeployment';
import type { VortexInstall } from './vortexInstall';
import { debugArguments, requestVortexClose, SYSTEM_LAUNCHER, type VortexLauncher } from './vortexLauncher';

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
}

export interface DebugFlowOptions {
    readonly project: VortexProject;
    readonly install: VortexInstall;
    readonly port: number;
    readonly ui: DebugFlowUi;
    readonly report: (message: string) => void;
    readonly token: vscode.CancellationToken;
}

const wait = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Builds, deploys, starts Vortex and attaches.
 *
 * A release Vortex only opens the debugging port when it is started with the switch, and its
 * single instance lock makes a second launch quit instead of opening a window — so an already
 * running Vortex has to be closed, or attached to as it is.
 */
export async function runDebugFlow(options: DebugFlowOptions, deps: DebugFlowDeps = {}): Promise<DebugOutcome> {
    const { project, install, port, ui, report, token } = options;
    const launcher = deps.launcher ?? SYSTEM_LAUNCHER;
    const cdp = deps.cdp ?? HTTP_CDP;
    const build = deps.build ?? runBuild;
    const startDebugging = deps.startDebugging ?? ((folder, configuration) => vscode.debug.startDebugging(folder, configuration));

    const cancelled = (): boolean => token.isCancellationRequested;

    report('Checking Vortex...');
    const running = await cdp.version(port);
    let attachOnly = false;

    if (running.status === 'ok') {
        const deployedId = await readPackId(project.folder.uri).catch(() => undefined);
        const stale = deployedId === undefined
            || !await isDeployedCurrent(project.folder.uri, install.pluginsFolder, deployedId);
        const choice = await ui.confirmPortInUse(stale);
        if (choice === 'cancel') {
            return { kind: 'declined' };
        }
        if (choice === 'attach') {
            attachOnly = true;
        } else {
            const closed = await closeVortex(launcher, ui);
            if (!closed) {
                return { kind: 'declined' };
            }
        }
    } else if (running.status === 'closed') {
        const isRunning = await launcher.isVortexRunning();
        if (isRunning === true) {
            const choice = await ui.confirmVortexRunning();
            if (choice === 'cancel') {
                return { kind: 'declined' };
            }
            if (choice === 'close' && !await closeVortex(launcher, ui)) {
                return { kind: 'declined' };
            }
        }
    }

    if (cancelled()) {
        return { kind: 'cancelled' };
    }

    let packId: string;
    if (attachOnly) {
        packId = await readPackId(project.folder.uri);
    } else {
        if (!await saveDirtyDocuments(project.folder.uri)) {
            return { kind: 'failed', reason: 'Some of the project\'s files couldn\'t be saved, so the build would not match the editor.' };
        }
        report(`Building ${project.folder.name}...`);
        await build(project.folder, token);
        if (cancelled()) {
            return { kind: 'cancelled' };
        }

        packId = await readPackId(project.folder.uri);
        report(`Deploying ${packId}...`);
        const files = await deployPack(project.folder.uri, install.pluginsFolder, packId, token);
        Logger.info(`Deployed ${files} files of ${packId} to ${install.pluginsFolder.fsPath}`);
        if (cancelled()) {
            return { kind: 'cancelled' };
        }

        report('Starting Vortex...');
        const launched = launcher.launch(install.exe, debugArguments(port));
        Logger.info(`Started ${install.exe} on port ${port} as pid ${launched.pid ?? 'unknown'}`);
        report('Waiting for Vortex\'s window...');
        const outcome = await Promise.race([
            waitForPageTarget(cdp, port, { token, onProgress: phase => report(phase === 'browser' ? 'Waiting for Vortex\'s window...' : 'Waiting for Vortex to start...') })
                .then(() => ({ ready: true as const })),
            launched.exited.then(code => ({ ready: false as const, code })),
        ]);
        launched.release();
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
        if (!await fileExists(vscode.Uri.joinPath(install.pluginsFolder, packId, PACK_ENTRY))) {
            return { kind: 'removed', packId };
        }
    }

    if (cancelled()) {
        return { kind: 'cancelled' };
    }

    report('Attaching...');
    const configuration = vortexAttachConfiguration({ packId, folder: project.folder.uri, port });
    Logger.info(`Attaching with ${JSON.stringify(configuration)}`);
    const started = await startDebugging(project.folder, configuration);
    return started
        ? { kind: 'attached', packId, reused: attachOnly }
        : { kind: 'failed', reason: 'VS Code refused to start the debug session. The log holds the configuration that was used.' };
}

async function closeVortex(launcher: VortexLauncher, ui: DebugFlowUi): Promise<boolean> {
    await requestVortexClose(false);
    const deadline = Date.now() + VORTEX_QUIT_TIMEOUT_MS;
    while (Date.now() < deadline) {
        if (await launcher.isVortexRunning() !== true) {
            return true;
        }
        await wait(VORTEX_PROBE_INTERVAL_MS);
    }
    if (!await ui.confirmForceClose()) {
        return false;
    }
    await requestVortexClose(true);
    await wait(VORTEX_PROBE_INTERVAL_MS);
    return await launcher.isVortexRunning() !== true;
}
