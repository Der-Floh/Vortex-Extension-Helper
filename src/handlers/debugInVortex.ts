import * as vscode from 'vscode';
import { readProjectSnapshot } from '../checks/projectSnapshot';
import { buildBlockers, validateProject } from '../checks/validation';
import type { VortexDiagnostics } from '../checks/vortexDiagnostics';
import { COMMAND_DEBUG_IN_VORTEX, COMMAND_RUN_WORKSPACE_CHECKS, DEBUG_PORT_DEFAULT, JS_DEBUG_EXTENSION_ID, MANIFEST, PACKAGE_JSON_PATH, SETTING_VORTEX_EXECUTABLE, SETTING_VORTEX_PLUGINS_FOLDER } from '../constants';
import { topLevelBreakpointHint } from '../debug/attachConfiguration';
import { runDebugFlow, type DebugFlowUi } from '../debug/debugFlow';
import { PluginsFolderMissingError, resolveVortexInstall, VortexNotFoundError } from '../debug/vortexInstall';
import { MissingScriptError } from '../project/npmTasks';
import { pickVortexProject } from '../project/projectPicker';
import type { VortexWorkspaceTracker } from '../project/vortexWorkspaceTracker';
import type { VortexProject } from '../types/project';
import { commandLabel } from '../utils/commandLabel';
import { getConfiguration } from '../utils/configuration';
import { errorMessage } from '../utils/errors';
import { Logger } from '../utils/logger';
import { requireTrust } from '../utils/trust';

const ATTACH_ONLY = 'Attach Only';
const REBUILD_AND_RESTART = 'Rebuild and Restart Vortex';
const CLOSE_VORTEX = 'Close Vortex';
const FORCE_CLOSE = 'Force Close';
const RETRY = 'Retry';
const TRY_AGAIN = 'Try Again';
const CONTINUE = 'Continue';
const OPEN_PACKAGE_JSON = 'Open package.json';
const OPEN_SETTINGS = 'Open Settings';
const OPEN_LOG = 'Open Log';
const BROWSE = 'Browse...';

/**
 * Builds the extension, deploys it to Vortex, starts Vortex with its DevTools port open and attaches to the renderer.
 *
 * Game extension code runs in Vortex's renderer, which loads the built bundle from the plugins
 * folder, so debugging means getting a current build there and attaching over the DevTools protocol.
 */
export async function handleDebugInVortex(tracker: VortexWorkspaceTracker, diagnostics: VortexDiagnostics): Promise<void> {
    const project = await pickVortexProject(tracker);
    if (!project || !requireTrust()) {
        return;
    }
    if (vscode.extensions.getExtension(JS_DEBUG_EXTENSION_ID) === undefined) {
        vscode.window.showErrorMessage(`${MANIFEST.displayName}: The built-in JavaScript Debugger is disabled, and it is what attaches to Vortex's renderer.`, 'Manage Extensions')
            .then(choice => choice && vscode.commands.executeCommand('workbench.extensions.action.showEnabledExtensions'));
        return;
    }
    if (!await reportBlockers(project, diagnostics)) {
        return;
    }

    const configuration = getConfiguration();
    const port = configuration.debugPort ?? DEBUG_PORT_DEFAULT;
    const install = await resolveInstall();
    if (!install) {
        return;
    }
    if (!await confirmTopLevelBreakpoints(project)) {
        return;
    }

    try {
        const outcome = await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: `${MANIFEST.displayName}: Debugging ${project.folder.name}`, cancellable: true },
            (progress, token) => runDebugFlow({
                project,
                install,
                port,
                ui: WINDOW_UI,
                report: message => progress.report({ message }),
                token,
            })
        );
        reportOutcome(outcome);
    } catch (e) {
        if (e instanceof vscode.CancellationError) {
            return;
        }
        Logger.error(`Failed to debug ${project.folder.uri.fsPath}: ${errorMessage(e)}`);
        const message = e instanceof MissingScriptError
            ? `${errorMessage(e)} A generated project builds with "rollup -c rollup.config.mjs && node .vscode/build/populate-pack.mjs".`
            : errorMessage(e);
        vscode.window.showErrorMessage(`${MANIFEST.displayName}: ${message}`, OPEN_LOG)
            .then(choice => choice === OPEN_LOG && Logger.show());
    } finally {
        await diagnostics.validateFolder(project.folder);
    }
}

const WINDOW_UI: DebugFlowUi = {
    async confirmPortInUse(stale) {
        const detail = stale
            ? 'The build Vortex has loaded differs from the one that was just built, so breakpoints may bind to the wrong lines. Restarting Vortex loads the current build.'
            : 'Vortex already has the current build loaded.';
        const choice = await vscode.window.showInformationMessage(
            `${MANIFEST.displayName}: Vortex is already running with its debugging port open.`,
            { modal: true, detail },
            ATTACH_ONLY,
            REBUILD_AND_RESTART
        );
        if (choice === ATTACH_ONLY) {
            return 'attach';
        }
        return choice === REBUILD_AND_RESTART ? 'restart' : 'cancel';
    },
    async confirmVortexRunning() {
        const choice = await vscode.window.showWarningMessage(
            `${MANIFEST.displayName}: Vortex is running without its debugging port.`,
            {
                modal: true,
                detail: 'A release Vortex only opens the port when it is started with it, and a second instance quits instead of opening a window. Vortex has to be closed first.',
            },
            CLOSE_VORTEX,
            RETRY
        );
        if (choice === CLOSE_VORTEX) {
            return 'close';
        }
        return choice === RETRY ? 'retry' : 'cancel';
    },
    async confirmForceClose() {
        const choice = await vscode.window.showWarningMessage(
            `${MANIFEST.displayName}: Vortex didn't close.`,
            {
                modal: true,
                detail: 'Forcing it can lose whatever Vortex hasn\'t written to its state database yet. It may also be minimized to the tray rather than closed.',
            },
            FORCE_CLOSE
        );
        return choice === FORCE_CLOSE;
    },
};

/** @returns False when the project can't be built, which populate-pack.mjs would only report from inside the build */
async function reportBlockers(project: VortexProject, diagnostics: VortexDiagnostics): Promise<boolean> {
    const blockers = buildBlockers(validateProject(await readProjectSnapshot(project)));
    if (blockers.length === 0) {
        return true;
    }
    await diagnostics.validateFolder(project.folder);
    const choice = await vscode.window.showWarningMessage(
        `${MANIFEST.displayName}: ${project.folder.name} can't be built yet.`,
        { modal: true, detail: blockers.map(finding => `• ${finding.message}`).join('\n') },
        OPEN_PACKAGE_JSON,
        commandLabel(COMMAND_RUN_WORKSPACE_CHECKS)
    );
    if (choice === OPEN_PACKAGE_JSON) {
        await vscode.window.showTextDocument(vscode.Uri.joinPath(project.folder.uri, PACKAGE_JSON_PATH));
    } else if (choice === commandLabel(COMMAND_RUN_WORKSPACE_CHECKS)) {
        await vscode.commands.executeCommand(COMMAND_RUN_WORKSPACE_CHECKS);
    }
    return false;
}

async function resolveInstall() {
    try {
        return await resolveVortexInstall(getConfiguration());
    } catch (e) {
        Logger.error(errorMessage(e));
        if (e instanceof VortexNotFoundError) {
            Logger.info(`Looked for Vortex in:\n${e.candidates.join('\n')}`);
            const remote = vscode.env.remoteName === undefined
                ? ''
                : ' This window is connected to a remote, so Vortex has to be installed where the extension host runs.';
            const choice = await vscode.window.showErrorMessage(`${MANIFEST.displayName}: ${errorMessage(e)}${remote}`, BROWSE, OPEN_LOG);
            if (choice === BROWSE) {
                await browseForVortex();
            } else if (choice === OPEN_LOG) {
                Logger.show();
            }
            return undefined;
        }
        const buttons = e instanceof PluginsFolderMissingError ? [OPEN_SETTINGS] : [];
        const choice = await vscode.window.showErrorMessage(`${MANIFEST.displayName}: ${errorMessage(e)}`, ...buttons);
        if (choice === OPEN_SETTINGS) {
            await vscode.commands.executeCommand('workbench.action.openSettings', SETTING_VORTEX_PLUGINS_FOLDER);
        }
        return undefined;
    }
}

async function browseForVortex(): Promise<void> {
    const picked = await vscode.window.showOpenDialog({
        title: 'Select Vortex',
        openLabel: 'Select',
        canSelectMany: false,
        filters: process.platform === 'win32' ? { Vortex: ['exe'] } : undefined,
    });
    if (picked?.[0]) {
        await vscode.workspace.getConfiguration().update(SETTING_VORTEX_EXECUTABLE, picked[0].fsPath, vscode.ConfigurationTarget.Global);
        vscode.window.showInformationMessage(`${MANIFEST.displayName}: Vortex set to ${picked[0].fsPath}. Run the command again.`);
    }
}

/** @returns False when the author cancels after being told their breakpoint can't hit */
async function confirmTopLevelBreakpoints(project: VortexProject): Promise<boolean> {
    const hint = topLevelBreakpointHint(project.folder.uri, vscode.debug.breakpoints);
    if (hint === undefined) {
        return true;
    }
    const choice = await vscode.window.showWarningMessage(`${MANIFEST.displayName}: That breakpoint won't hit.`, { modal: true, detail: hint }, CONTINUE);
    return choice === CONTINUE;
}

function reportOutcome(outcome: Awaited<ReturnType<typeof runDebugFlow>>): void {
    if (outcome.kind === 'removed') {
        vscode.window.showWarningMessage(
            `${MANIFEST.displayName}: Vortex deleted ${outcome.packId} while it started, so there was nothing to debug.`,
            {
                modal: true,
                detail: 'Vortex finishes a removal from its Extensions page at its next start, and it also drops an extension whose id a bundled one already claims. The removal is done now, so running this again deploys it for good; pick "Rebuild and Restart Vortex" when it asks about the running Vortex.',
            },
            TRY_AGAIN
        ).then(choice => choice === TRY_AGAIN && vscode.commands.executeCommand(COMMAND_DEBUG_IN_VORTEX));
    } else if (outcome.kind === 'attached') {
        const prefix = outcome.reused ? `Attached to the running Vortex (${outcome.packId}).` : `Attached to Vortex (${outcome.packId}).`;
        vscode.window.showInformationMessage(`${MANIFEST.displayName}: ${prefix} Breakpoints in callbacks hit; the module top level and main() already ran while Vortex started.`);
    } else if (outcome.kind === 'failed') {
        vscode.window.showErrorMessage(`${MANIFEST.displayName}: ${outcome.reason}`, OPEN_LOG)
            .then(choice => choice === OPEN_LOG && Logger.show());
    }
}
