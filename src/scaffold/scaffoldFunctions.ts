import * as vscode from 'vscode';
import { IRequiredFile } from '../constants/requiredFile';
import { runInstallDeps } from '../utils/shellUtils';
import { getRequiredFiles, getWorkspaceRootUri, VortexWorkspaceType } from '../workspace/vortexWorkspaceUtils';
import { Logger } from '../utils/logger';
import { GLOBAL_STATE } from '../constants/strings';

export type PendingScaffoldState = {
    targetUri: string;
    workspaceType: VortexWorkspaceType;
    packageOptions: Record<string, string>;
};

export async function checkPendingScaffold(context: vscode.ExtensionContext) {
    Logger.debug(`Checking for pending scaffold in global state`);

    const pending = context.globalState.get<PendingScaffoldState>(GLOBAL_STATE.PENDING_SCAFFOLD);
    if (!pending) {
        Logger.debug(`No pending scaffold found`);
        return false;
    }

    try {
        const currentRoot = await getWorkspaceRootUri();
        Logger.debug(`Found pending scaffold for target "${pending.targetUri}"`);

        if (currentRoot.toString() !== pending.targetUri) {
            Logger.debug(`Current workspace root "${currentRoot.fsPath}" does not match pending scaffold target`);
            return false;
        }

        const targetUri = vscode.Uri.parse(pending.targetUri);

        // Clear state before doing work (avoids loops if something throws)
        await context.globalState.update(GLOBAL_STATE.PENDING_SCAFFOLD, undefined);

        Logger.debug(`Starting scaffold of game extension in "${targetUri.fsPath}"`);
        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'Setting up game extension',
                cancellable: false
            },
            async (progress) => {
                progress.report({ message: 'Creating game extension files...' });

                const requiredFiles = getRequiredFiles(pending.workspaceType);
                try {
                    await scaffoldGameExtension(requiredFiles, targetUri, pending.packageOptions);
                } catch (err) {
                    Logger.error(`Failed to create game extension files: ${String(err)}`);
                    vscode.window.showErrorMessage(`Failed to create game extension files: ${String(err)}`);
                    return;
                }

                progress.report({ message: 'Installing dependencies...' });
                try {
                    await runInstallDeps(targetUri);
                } catch (err) {
                    Logger.error(`Failed to install dependencies: ${String(err)}`);
                    vscode.window.showErrorMessage(`Failed to install dependencies: ${String(err)}`);
                    return;
                }
            }
        );

        Logger.debug(`Game extension setup completed`);
        vscode.window.showInformationMessage('Vortex game extension setup completed.');
        return true;
    } catch (err) {
        Logger.error(`Error during pending scaffold check: ${String(err)}`);
        Logger.debug(`Clearing pending scaffold state due to error`);
        await context.globalState.update(GLOBAL_STATE.PENDING_SCAFFOLD, undefined);
        return false;
    }
}

export async function scaffoldGameExtension(requiredFiles: IRequiredFile[], rootUri: vscode.Uri, packageOptions?: Record<string, string>) {
    Logger.debug(`Scaffolding game extension files in "${rootUri.fsPath}"`);
    for (const requiredFile of requiredFiles) {
        Logger.debug(`Scaffolding file "${requiredFile.fileName}"`);
        if (requiredFile.scaffoldContent) {
            if (packageOptions) {
                requiredFile.scaffoldContent = applyRequiredFileCustomizations(requiredFile, requiredFile.scaffoldContent, packageOptions);
            }

            const fileUri = vscode.Uri.joinPath(rootUri, requiredFile.directory ?? '', requiredFile.fileName);
            await writeFileIfMissing(fileUri, requiredFile.scaffoldContent);
        }
    }
}

function applyRequiredFileCustomizations(requiredFile: IRequiredFile, content: string, options: Record<string, string>) {
    Logger.debug(`Customizing ${requiredFile.fileName}`);
    try {
        const packageJsonObj = JSON.parse(content);
        for (const key of Object.keys(packageJsonObj)) {
            try {
                if (`${requiredFile.fileName}.${key}` in options) {
                    const newValue = options[`${requiredFile.fileName}.${key}`];
                    Logger.debug(`Customizing "${key} = ${newValue}"`);
                    packageJsonObj[key] = newValue;
                }
            } catch (err) {
                Logger.error(`Failed to customize key "${key}" in ${requiredFile.fileName}: ${String(err)}`);
            }
        }
        content = JSON.stringify(packageJsonObj, null, 2);
    } catch (err) {
        Logger.error(`Failed to customize package.json: ${String(err)}`);
    }
    return content;
}

async function writeFileIfMissing(uri: vscode.Uri, content: string) {
    if (await fileExists(uri)) {
        return;
    }

    const isImage = /\.(jpg|jpeg|png)$/i.test(uri.path);

    if (isImage) {
        const base64 = content.replace(/^data:image\/\w+;base64,/, '');
        await vscode.workspace.fs.writeFile(uri, Buffer.from(base64, 'base64'));
    } else {
        await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));
    }
}

async function fileExists(uri: vscode.Uri): Promise<boolean> {
    try {
        await vscode.workspace.fs.stat(uri);
        return true;
    } catch {
        return false;
    }
}
