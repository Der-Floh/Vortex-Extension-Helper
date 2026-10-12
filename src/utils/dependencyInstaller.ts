import * as vscode from 'vscode';
import { COMMAND_INSTALL_DEPENDENCIES, MANIFEST } from '../constants';
import { errorMessage } from './errors';
import { Logger } from './logger';
import { ensureToolsAvailable, installDependencies } from './npmTasks';
import type { VortexDiagnostics } from './vortexDiagnostics';

const RETRY = 'Retry';

/** Checks the tools, installs the project's dependencies and reports the outcome */
export async function installProjectDependencies(folder: vscode.WorkspaceFolder, diagnostics: VortexDiagnostics): Promise<boolean> {
    try {
        await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: `${MANIFEST.displayName}: Installing the dependencies of ${folder.name}…` },
            async () => {
                await ensureToolsAvailable(folder);
                await installDependencies(folder);
            }
        );
        vscode.window.showInformationMessage(`${MANIFEST.displayName}: Installed the dependencies of ${folder.name}.`);
        return true;
    } catch (e) {
        Logger.error(`Failed to install the dependencies of ${folder.uri.fsPath}: ${errorMessage(e)}`);
        vscode.window.showErrorMessage(`${MANIFEST.displayName}: Failed to install the dependencies of ${folder.name}. ${errorMessage(e)}`, RETRY)
            .then(choice => choice === RETRY && vscode.commands.executeCommand(COMMAND_INSTALL_DEPENDENCIES));
        return false;
    } finally {
        await diagnostics.validateFolder(folder);
    }
}
