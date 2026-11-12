import * as vscode from 'vscode';
import { VortexDiagnostics } from './checks/vortexDiagnostics';
import {
    COMMAND_ADD_VORTEX_LIBRARY,
    COMMAND_ATTACH_TO_VORTEX,
    COMMAND_BUILD,
    COMMAND_CREATE_MISSING_FILES,
    COMMAND_DEBUG_IN_VORTEX,
    COMMAND_DEPLOY_TO_VORTEX,
    COMMAND_INSERT_SNIPPET,
    COMMAND_INSTALL_DEPENDENCIES,
    COMMAND_NEW_GAME_EXTENSION,
    COMMAND_OPEN_DOCUMENTATION,
    COMMAND_OPEN_PLUGINS_FOLDER,
    COMMAND_OPEN_VORTEX_LOG,
    COMMAND_PACKAGE_ZIP,
    COMMAND_REFRESH_SIDEBAR,
    COMMAND_REMOVE_VORTEX_LIBRARY,
    COMMAND_RUN_WORKSPACE_CHECKS,
    MANIFEST,
} from './constants';
import { watchVortexDebugSessions } from './debug/debugSessionWatcher';
import { handleAddVortexLibrary } from './handlers/addVortexLibrary';
import { handleAttachToVortex } from './handlers/attachToVortex';
import { handleBuild } from './handlers/build';
import { handleCreateMissingFiles } from './handlers/createMissingFiles';
import { handleDebugInVortex } from './handlers/debugInVortex';
import { handleDeployToVortex } from './handlers/deployToVortex';
import { handleInsertSnippet } from './handlers/insertSnippet';
import { handleInstallDependencies } from './handlers/installDependencies';
import { handleNewGameExtension } from './handlers/newGameExtension';
import { handleOpenDocumentation } from './handlers/openDocumentation';
import { handleOpenPluginsFolder } from './handlers/openPluginsFolder';
import { handleOpenVortexLog } from './handlers/openVortexLog';
import { handlePackageZip } from './handlers/packageZip';
import { handleRemoveVortexLibrary } from './handlers/removeVortexLibrary';
import { handleRunWorkspaceChecks } from './handlers/runWorkspaceChecks';
import { ProjectActivity } from './project/projectActivity';
import { VortexWorkspaceTracker } from './project/vortexWorkspaceTracker';
import { createSidebarView, SidebarProvider } from './sidebar/sidebarProvider';
import { COMPLETION_SELECTOR, VortexCompletionProvider } from './snippets/vortexCompletionProvider';
import type { LibraryTarget, ProjectTarget } from './types/project';
import type { SnippetTarget } from './types/snippet';
import { errorMessage } from './utils/errors';
import { Logger } from './utils/logger';
import { resumePendingInstall } from './wizard/pendingInstall';

export function activate(context: vscode.ExtensionContext) {
    Logger.initialize(context);

    const tracker = new VortexWorkspaceTracker();
    const diagnostics = new VortexDiagnostics(tracker);
    const activity = new ProjectActivity();
    const sidebar = new SidebarProvider(tracker, activity);

    context.subscriptions.push(
        tracker,
        diagnostics,
        activity,
        sidebar,
        createSidebarView(sidebar),
        watchVortexDebugSessions(),
        vscode.languages.registerCompletionItemProvider(COMPLETION_SELECTOR, new VortexCompletionProvider(tracker)),
        vscode.commands.registerCommand(COMMAND_NEW_GAME_EXTENSION, () => handleNewGameExtension(context.globalState)),
        vscode.commands.registerCommand(COMMAND_INSTALL_DEPENDENCIES, (target?: ProjectTarget) => handleInstallDependencies(tracker, diagnostics, activity, target)),
        vscode.commands.registerCommand(COMMAND_CREATE_MISSING_FILES, () => handleCreateMissingFiles(tracker, diagnostics)),
        vscode.commands.registerCommand(COMMAND_RUN_WORKSPACE_CHECKS, () => handleRunWorkspaceChecks(tracker, diagnostics)),
        vscode.commands.registerCommand(COMMAND_OPEN_DOCUMENTATION, handleOpenDocumentation),
        vscode.commands.registerCommand(COMMAND_ADD_VORTEX_LIBRARY, (target?: LibraryTarget) => handleAddVortexLibrary(tracker, diagnostics, activity, target)),
        vscode.commands.registerCommand(COMMAND_DEBUG_IN_VORTEX, (target?: ProjectTarget) => handleDebugInVortex(tracker, diagnostics, activity, target)),
        vscode.commands.registerCommand(COMMAND_BUILD, (target?: ProjectTarget) => handleBuild(tracker, diagnostics, activity, target)),
        vscode.commands.registerCommand(COMMAND_PACKAGE_ZIP, (target?: ProjectTarget) => handlePackageZip(tracker, diagnostics, activity, target)),
        vscode.commands.registerCommand(COMMAND_DEPLOY_TO_VORTEX, (target?: ProjectTarget) => handleDeployToVortex(tracker, diagnostics, activity, target)),
        vscode.commands.registerCommand(COMMAND_ATTACH_TO_VORTEX, (target?: ProjectTarget) => handleAttachToVortex(tracker, target)),
        vscode.commands.registerCommand(COMMAND_REMOVE_VORTEX_LIBRARY, (target?: LibraryTarget) => handleRemoveVortexLibrary(tracker, diagnostics, activity, target)),
        vscode.commands.registerCommand(COMMAND_INSERT_SNIPPET, (target?: SnippetTarget) => handleInsertSnippet(tracker, target)),
        vscode.commands.registerCommand(COMMAND_OPEN_PLUGINS_FOLDER, (target?: ProjectTarget) => handleOpenPluginsFolder(tracker, target)),
        vscode.commands.registerCommand(COMMAND_OPEN_VORTEX_LOG, handleOpenVortexLog),
        vscode.commands.registerCommand(COMMAND_REFRESH_SIDEBAR, () => sidebar.refresh())
    );

    tracker.initialize()
        .then(() => resumePendingInstall(context.globalState, diagnostics, activity))
        .catch(e => Logger.error(`Failed to detect the Vortex game extensions: ${errorMessage(e)}`));

    Logger.info(`Successfully activated "${MANIFEST.displayName}" extension.`);
}

export function deactivate() { }
