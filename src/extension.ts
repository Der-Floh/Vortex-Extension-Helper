import * as vscode from 'vscode';
import {
    COMMAND_ADD_VORTEX_LIBRARY,
    COMMAND_CREATE_MISSING_FILES,
    COMMAND_INSTALL_DEPENDENCIES,
    COMMAND_NEW_GAME_EXTENSION,
    COMMAND_OPEN_DOCUMENTATION,
    COMMAND_RUN_WORKSPACE_CHECKS,
    MANIFEST,
} from './constants';
import { handleAddVortexLibrary } from './handlers/addVortexLibrary';
import { handleCreateMissingFiles } from './handlers/createMissingFiles';
import { handleInstallDependencies } from './handlers/installDependencies';
import { handleNewGameExtension } from './handlers/newGameExtension';
import { handleOpenDocumentation } from './handlers/openDocumentation';
import { handleRunWorkspaceChecks } from './handlers/runWorkspaceChecks';
import { errorMessage } from './utils/errors';
import { Logger } from './utils/logger';
import { resumePendingInstall } from './utils/pendingInstall';
import { COMPLETION_SELECTOR, VortexCompletionProvider } from './utils/vortexCompletionProvider';
import { VortexDiagnostics } from './utils/vortexDiagnostics';
import { VortexWorkspaceTracker } from './utils/vortexWorkspaceTracker';

export function activate(context: vscode.ExtensionContext) {
    Logger.initialize(context);

    const tracker = new VortexWorkspaceTracker();
    const diagnostics = new VortexDiagnostics(tracker);

    context.subscriptions.push(
        tracker,
        diagnostics,
        vscode.languages.registerCompletionItemProvider(COMPLETION_SELECTOR, new VortexCompletionProvider(tracker)),
        vscode.commands.registerCommand(COMMAND_NEW_GAME_EXTENSION, () => handleNewGameExtension(context.globalState)),
        vscode.commands.registerCommand(COMMAND_INSTALL_DEPENDENCIES, () => handleInstallDependencies(tracker, diagnostics)),
        vscode.commands.registerCommand(COMMAND_CREATE_MISSING_FILES, () => handleCreateMissingFiles(tracker, diagnostics)),
        vscode.commands.registerCommand(COMMAND_RUN_WORKSPACE_CHECKS, () => handleRunWorkspaceChecks(tracker, diagnostics)),
        vscode.commands.registerCommand(COMMAND_OPEN_DOCUMENTATION, handleOpenDocumentation),
        vscode.commands.registerCommand(COMMAND_ADD_VORTEX_LIBRARY, () => handleAddVortexLibrary(tracker, diagnostics))
    );

    tracker.initialize()
        .then(() => resumePendingInstall(context.globalState, diagnostics))
        .catch(e => Logger.error(`Failed to detect the Vortex game extensions: ${errorMessage(e)}`));

    Logger.info(`Successfully activated "${MANIFEST.displayName}" extension.`);
}

export function deactivate() { }
