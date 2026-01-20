import * as vscode from 'vscode';
import sanitize from "sanitize-filename";
import { RequiredFiles, IRequiredFile } from '../constants/requiredFile';
import { runInstallDeps } from '../utils/shellUtils';
import { EXTENSION_ID, EXTENSION_NAME, log } from '../extension';
import { getRequiredFiles, getWorkspaceRootUri, VortexWorkspaceType } from '../workspace/vortexWorkspaceUtils';

type PendingScaffoldState = {
    targetUri: string;
    workspaceType: VortexWorkspaceType;
    packageOptions: Record<string, string>;
};

export async function newGameSupportExtension(context: vscode.ExtensionContext) {
    // 1. Ask for the new extension game name
    const gameTitle = await vscode.window.showInputBox({
        prompt: 'Game title (as it should appear in Vortex)',
        placeHolder: 'Bloodstained: Ritual of the Night',
        ignoreFocusOut: true,
    });

    if (!gameTitle || gameTitle.length === 0) {
        log.error(`${EXTENSION_NAME}: Game title is required for new game support extension`);
        vscode.window.showErrorMessage('Game title is required.');
        return;
    }
    log.debug(`${EXTENSION_NAME}: Creating new game support extension for "${gameTitle}"`);

    const sanitizedTitle = sanitize(`${gameTitle.toLowerCase()}`).replace(/[^a-z0-9]+/g, '-').trimChars('-');
    if (!sanitizedTitle || sanitizedTitle.length === 0) {
        log.error(`${EXTENSION_NAME}: Could not generate a valid folder name from the game title "${gameTitle}"`);
        vscode.window.showErrorMessage('Could not generate a valid folder name from the game title.');
        return;
    }

    // 2. Ask whether to use typescript or javascript
    const languageChoice = await vscode.window.showQuickPick(
        ['JavaScript', 'TypeScript'],
        {
            placeHolder: 'Select the programming language for the new extension',
            ignoreFocusOut: true,
        }
    );

    if (!languageChoice) {
        log.error(`${EXTENSION_NAME}: Programming language selection is required for new game support extension`);
        vscode.window.showErrorMessage('Programming language selection is required.');
        return;
    }
    log.debug(`${EXTENSION_NAME}: Selected programming language: ${languageChoice}`);

    const workspaceType =
        languageChoice === 'JavaScript'
            ? VortexWorkspaceType.JavaScript
            : VortexWorkspaceType.TypeScript;

    // 3. Let the user select a base folder where the new extension folder will be created
    //    - Local: ask user for folder
    //    - Remote: create inside current workspace root (remote filesystem)
    let baseUri: vscode.Uri;

    if (vscode.env.remoteName) {
        // Remote context: avoid local folder picker because user likely wants remote FS.
        try {
            baseUri = await getWorkspaceRootUri();
        } catch (err) {
            vscode.window.showErrorMessage(
                'Open a remote workspace folder first (or connect to a remote) to create the extension in the remote filesystem.'
            );
            return;
        }
    } else {
        const baseFolderSelection = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            openLabel: 'Select Location',
        });

        if (!baseFolderSelection || baseFolderSelection.length === 0) {
            return; // user cancelled
        }

        baseUri = baseFolderSelection[0];
    }

    log.debug(`${EXTENSION_NAME}: Creating new extension folder "${sanitizedTitle}" in "${baseUri.fsPath}"`);

    const targetRootUri = vscode.Uri.joinPath(baseUri, sanitizedTitle);
    await vscode.workspace.fs.createDirectory(targetRootUri);

    log.debug(`${EXTENSION_NAME}: Created new extension folder at "${targetRootUri.fsPath}"`);

    // 4. Remember the target folder in global state for post-open scaffolding
    log.debug(`${EXTENSION_NAME}: Storing pending scaffold state in global state`);
    const pending: PendingScaffoldState = {
        targetUri: targetRootUri.toString(),
        workspaceType: workspaceType,
        packageOptions: {
            [`${RequiredFiles.INFO_JSON_NAME}.name`]: `Game: ${gameTitle}`,
            [`${RequiredFiles.INFO_JSON_NAME}.description`]: `Support for ${gameTitle}`,
            [`${RequiredFiles.PACKAGE_JSON_NAME}.name`]: sanitizedTitle,
        }
    };
    await context.globalState.update(`${EXTENSION_ID}.pendingScaffold`, pending);

    // 5. Open the folder in the current window
    await vscode.commands.executeCommand('vscode.openFolder', targetRootUri, false);
}

export async function checkPendingScaffold(context: vscode.ExtensionContext) {
    log.debug(`${EXTENSION_NAME}: Checking for pending scaffold in global state`);

    const pending = context.globalState.get<PendingScaffoldState>(`${EXTENSION_ID}.pendingScaffold`);
    if (!pending) {
        log.debug(`${EXTENSION_NAME}: No pending scaffold found`);
        return false;
    }

    try {
        const currentRoot = await getWorkspaceRootUri();
        log.debug(`${EXTENSION_NAME}: Found pending scaffold for target "${pending.targetUri}"`);

        if (currentRoot.toString() !== pending.targetUri) {
            log.debug(`${EXTENSION_NAME}: Current workspace root "${currentRoot.fsPath}" does not match pending scaffold target`);
            return false;
        }

        const targetUri = vscode.Uri.parse(pending.targetUri);

        // Clear state before doing work (avoids loops if something throws)
        await context.globalState.update(`${EXTENSION_ID}.pendingScaffold`, undefined);

        log.debug(`${EXTENSION_NAME}: Starting scaffold of game extension in "${targetUri.fsPath}"`);
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
                    log.error(`${EXTENSION_NAME}: Failed to create game extension files: ${String(err)}`);
                    vscode.window.showErrorMessage(`Failed to create game extension files: ${String(err)}`);
                    return;
                }

                progress.report({ message: 'Installing dependencies...' });
                try {
                    await runInstallDeps(targetUri);
                } catch (err) {
                    log.error(`${EXTENSION_NAME}: Failed to install dependencies: ${String(err)}`);
                    vscode.window.showErrorMessage(`Failed to install dependencies: ${String(err)}`);
                    return;
                }
            }
        );

        log.debug(`${EXTENSION_NAME}: Game extension setup completed`);
        vscode.window.showInformationMessage('Vortex game extension setup completed.');
        return true;
    } catch (err) {
        log.error(`${EXTENSION_NAME}: Error during pending scaffold check: ${String(err)}`);
        log.debug(`${EXTENSION_NAME}: Clearing pending scaffold state due to error`);
        await context.globalState.update(`${EXTENSION_ID}.pendingScaffold`, undefined);
        return false;
    }
}

export async function scaffoldGameExtension(requiredFiles: IRequiredFile[], rootUri: vscode.Uri, packageOptions?: Record<string, string>) {
    log.debug(`${EXTENSION_NAME}: Scaffolding game extension files in "${rootUri.fsPath}"`);
    for (const requiredFile of requiredFiles) {
        log.debug(`${EXTENSION_NAME}: Scaffolding file "${requiredFile.fileName}"`);
        if (requiredFile.scaffoldContent) {
            if (packageOptions) {
                requiredFile.scaffoldContent = applyRequiredFileCustomizations(requiredFile, requiredFile.scaffoldContent, packageOptions);
            }

            const fileUri = vscode.Uri.joinPath(rootUri, requiredFile.fileName);
            await writeFileIfMissing(fileUri, requiredFile.scaffoldContent);
        }
    }
}

function applyRequiredFileCustomizations(requiredFile: IRequiredFile, content: string, options: Record<string, string>) {
    log.debug(`${EXTENSION_NAME}: Customizing ${requiredFile.fileName}`);
    try {
        const packageJsonObj = JSON.parse(content);
        for (const key of Object.keys(packageJsonObj)) {
            try {
                if (`${requiredFile.fileName}.${key}` in options) {
                    const newValue = options[`${requiredFile.fileName}.${key}`];
                    log.debug(`${EXTENSION_NAME}: Customizing "${key} = ${newValue}"`);
                    packageJsonObj[key] = newValue;
                }
            } catch (err) {
                log.error(`${EXTENSION_NAME}: Failed to customize key "${key}" in ${requiredFile.fileName}: ${String(err)}`);
            }
        }
        content = JSON.stringify(packageJsonObj, null, 2);
    } catch (err) {
        log.error(`${EXTENSION_NAME}: Failed to customize package.json: ${String(err)}`);
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
