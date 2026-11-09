import * as vscode from 'vscode';
import { readProjectSnapshot } from '../checks/projectSnapshot';
import { buildBlockers, validateProject } from '../checks/validation';
import { COMMAND_DEBUG_IN_VORTEX, COMMAND_RUN_WORKSPACE_CHECKS, JS_DEBUG_EXTENSION_ID, PACKAGE_JSON_PATH, SETTING_VORTEX_EXECUTABLE, SETTING_VORTEX_PLUGINS_FOLDER } from '../constants';
import { MissingScriptError } from '../project/npmTasks';
import type { Activity, ProjectActivity } from '../project/projectActivity';
import type { FolderValidator, VortexProject } from '../types/project';
import { commandLabel } from '../utils/commandLabel';
import { getConfiguration } from '../utils/configuration';
import { errorMessage } from '../utils/errors';
import { Logger } from '../utils/logger';
import { showError, showInfo, showWarning } from '../utils/notifications';
import { topLevelBreakpointHint } from './attachConfiguration';
import type { DebugFlowUi, DebugOutcome } from './debugFlow';
import { PluginsFolderMissingError, resolvePluginsFolder, resolveVortexInstall, VortexNotFoundError, type VortexInstall } from './vortexInstall';

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

export interface ProjectActionContext {
    readonly project: VortexProject;
    readonly validator: FolderValidator;
    readonly activity: ProjectActivity;
}

/** Runs an action alone on its project, reports what stopped it and checks the project again afterwards */
export async function runProjectAction({ project, validator, activity }: ProjectActionContext, kind: Activity, action: string, task: () => Promise<void>): Promise<void> {
    await activity.run(project.folder, kind, async () => {
        try {
            await task();
        } catch (e) {
            reportFailure(project, e, action);
        } finally {
            await validator.validateFolder(project.folder);
        }
    });
}

export const WINDOW_UI: DebugFlowUi = {
    async confirmPortInUse(stale) {
        const detail = stale
            ? 'The build Vortex has loaded differs from the one that was just built, so breakpoints may bind to the wrong lines. Restarting Vortex loads the current build.'
            : 'The deployed extension matches the current build. Vortex only loads it when it starts, so if it was deployed while Vortex was running, restart Vortex.';
        const choice = await showInfo(
            'Vortex is already running with its debugging port open.',
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
        const choice = await showWarning(
            'Vortex is running without its debugging port.',
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
        const choice = await showWarning(
            'Vortex didn\'t close.',
            {
                modal: true,
                detail: 'Forcing it can lose whatever Vortex hasn\'t written to its state database yet. It may also be minimized to the tray rather than closed.',
            },
            FORCE_CLOSE
        );
        return choice === FORCE_CLOSE;
    },
};

/** @returns False when the debugger that attaches to Vortex is disabled */
export function requireJsDebug(): boolean {
    if (vscode.extensions.getExtension(JS_DEBUG_EXTENSION_ID) !== undefined) {
        return true;
    }
    showError('The built-in JavaScript Debugger is disabled, and it is what attaches to Vortex\'s renderer.', 'Manage Extensions')
        .then(choice => choice && vscode.commands.executeCommand('workbench.extensions.action.showEnabledExtensions'));
    return false;
}

/** @returns False when the project can't be built, which populate-pack.mjs would only report from inside the build */
export async function reportBlockers(project: VortexProject, validator: FolderValidator): Promise<boolean> {
    const blockers = buildBlockers(validateProject(await readProjectSnapshot(project)));
    if (blockers.length === 0) {
        return true;
    }
    await validator.validateFolder(project.folder);
    const choice = await showWarning(
        `${project.folder.name} can't be built yet.`,
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

/** @returns Where Vortex is, or undefined once the author has been told why it can't be found */
export async function resolveInstall(): Promise<VortexInstall | undefined> {
    try {
        return await resolveVortexInstall(getConfiguration());
    } catch (e) {
        Logger.error(errorMessage(e));
        if (e instanceof VortexNotFoundError) {
            Logger.info(`Looked for Vortex in:\n${e.candidates.join('\n')}`);
            const remote = vscode.env.remoteName === undefined
                ? ''
                : ' This window is connected to a remote, so Vortex has to be installed where the extension host runs.';
            const choice = await showError(`${errorMessage(e)}${remote}`, BROWSE, OPEN_LOG);
            if (choice === BROWSE) {
                await browseForVortex();
            } else if (choice === OPEN_LOG) {
                Logger.show();
            }
            return undefined;
        }
        await reportNoPluginsFolder(e);
        return undefined;
    }
}

/** @returns The folder to deploy to, or undefined once the author has been told why there is none */
export async function resolveDeployTarget(): Promise<vscode.Uri | undefined> {
    try {
        return await resolvePluginsFolder(getConfiguration());
    } catch (e) {
        Logger.error(errorMessage(e));
        await reportNoPluginsFolder(e);
        return undefined;
    }
}

/** @returns False when the author cancels after being told their breakpoint can't hit */
export async function confirmTopLevelBreakpoints(project: VortexProject): Promise<boolean> {
    const hint = topLevelBreakpointHint(project.folder.uri, vscode.debug.breakpoints);
    if (hint === undefined) {
        return true;
    }
    const choice = await showWarning('That breakpoint won\'t hit.', { modal: true, detail: hint }, CONTINUE);
    return choice === CONTINUE;
}

export function reportOutcome(outcome: DebugOutcome): void {
    if (outcome.kind === 'removed') {
        showWarning(
            `Vortex deleted ${outcome.packId} while it started, so there was nothing to debug.`,
            {
                modal: true,
                detail: 'Vortex finishes a removal from its Extensions page at its next start, and it also drops an extension whose id a bundled one already claims. The removal is done now, so running this again deploys it for good; pick "Rebuild and Restart Vortex" when it asks about the running Vortex.',
            },
            TRY_AGAIN
        ).then(choice => choice === TRY_AGAIN && vscode.commands.executeCommand(COMMAND_DEBUG_IN_VORTEX));
    } else if (outcome.kind === 'attached') {
        const prefix = outcome.reused ? `Attached to the running Vortex (${outcome.packId}).` : `Attached to Vortex (${outcome.packId}).`;
        showInfo(`${prefix} Breakpoints in callbacks hit; the module top level and main() already ran while Vortex started.`);
    } else if (outcome.kind === 'failed') {
        showError(outcome.reason, OPEN_LOG)
            .then(choice => choice === OPEN_LOG && Logger.show());
    }
}

/** Reports what stopped an action on the project, unless the author cancelled it */
export function reportFailure(project: VortexProject, e: unknown, action = 'debug'): void {
    if (e instanceof vscode.CancellationError) {
        return;
    }
    Logger.error(`Failed to ${action} ${project.folder.uri.fsPath}: ${errorMessage(e)}`);
    const message = e instanceof MissingScriptError
        ? `${errorMessage(e)} A generated project builds with "rollup -c rollup.config.mjs && node .vscode/build/populate-pack.mjs".`
        : errorMessage(e);
    showError(message, OPEN_LOG)
        .then(choice => choice === OPEN_LOG && Logger.show());
}

async function reportNoPluginsFolder(e: unknown): Promise<void> {
    const buttons = e instanceof PluginsFolderMissingError ? [OPEN_SETTINGS] : [];
    const choice = await showError(errorMessage(e), ...buttons);
    if (choice === OPEN_SETTINGS) {
        await vscode.commands.executeCommand('workbench.action.openSettings', SETTING_VORTEX_PLUGINS_FOLDER);
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
        showInfo(`Vortex set to ${picked[0].fsPath}. Run the command again.`);
    }
}
