import * as vscode from 'vscode';
import { COMMAND_INSTALL_DEPENDENCIES } from '../constants';
import type { FolderValidator } from '../types/project';
import { errorMessage } from '../utils/errors';
import { Logger } from '../utils/logger';
import { showError, showInfo, withNotificationProgress } from '../utils/notifications';
import { ensureToolsAvailable, installDependencies } from './npmTasks';

const RETRY = 'Retry';

/** Checks the tools, installs the project's dependencies and reports the outcome */
export async function installProjectDependencies(folder: vscode.WorkspaceFolder, validator: FolderValidator): Promise<boolean> {
    try {
        await withNotificationProgress(`Installing the dependencies of ${folder.name}…`, async () => {
            await ensureToolsAvailable(folder);
            await installDependencies(folder);
        });
        showInfo(`Installed the dependencies of ${folder.name}.`);
        return true;
    } catch (e) {
        Logger.error(`Failed to install the dependencies of ${folder.uri.fsPath}: ${errorMessage(e)}`);
        showError(`Failed to install the dependencies of ${folder.name}. ${errorMessage(e)}`, RETRY)
            .then(choice => choice === RETRY && vscode.commands.executeCommand(COMMAND_INSTALL_DEPENDENCIES));
        return false;
    } finally {
        await validator.validateFolder(folder);
    }
}
