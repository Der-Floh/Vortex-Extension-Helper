import * as vscode from 'vscode';
import { COMMAND_INSTALL_DEPENDENCIES } from '../constants';
import type { FolderValidator } from '../types/project';
import { errorMessage } from '../utils/errors';
import { findOpenDocument } from '../utils/fileSystemUtils';
import { Logger } from '../utils/logger';
import { showError, showInfo, showWarning, withNotificationProgress } from '../utils/notifications';
import { ensureToolsAvailable, installDependencies } from './npmTasks';
import { ACTIVITY_DEPENDENCIES, type ProjectActivity } from './projectActivity';

const RETRY = 'Retry';
const SAVE_AND_CONTINUE = 'Save and Continue';

/** npm rewrites package.json, so unsaved changes in an open editor must be saved first */
export async function saveOpenPackageJson(uri: vscode.Uri): Promise<boolean> {
    const document = findOpenDocument(uri);
    if (!document?.isDirty) {
        return true;
    }
    const choice = await showWarning('package.json has unsaved changes. npm rewrites it, so save it first.', { modal: true }, SAVE_AND_CONTINUE);
    return choice === SAVE_AND_CONTINUE && await document.save();
}

/** Checks the tools, installs the project's dependencies and reports the outcome */
export async function installProjectDependencies(folder: vscode.WorkspaceFolder, validator: FolderValidator, activity: ProjectActivity): Promise<boolean> {
    return await activity.run(folder, ACTIVITY_DEPENDENCIES, () => installAndReport(folder, validator)) ?? false;
}

async function installAndReport(folder: vscode.WorkspaceFolder, validator: FolderValidator): Promise<boolean> {
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
