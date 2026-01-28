import * as vscode from 'vscode';
import sanitize from "sanitize-filename";
import { RequiredFiles } from '../constants/requiredFile';
import { ensureNodeAndGitAvailable } from '../utils/shellUtils';
import { getWorkspaceRootUri, VortexWorkspaceType } from '../workspace/vortexWorkspaceUtils';
import { PendingScaffoldState } from './scaffoldFunctions';
import { Logger } from '../utils/logger';
import { CONFIGS, GLOBAL_STATE } from '../constants/strings';
import { pickGame } from '../nexus-api/gameQuickPick';
import { getNexusGames } from '../nexus-api/nexusData';
import { IGameListEntry } from '@nexusmods/nexus-api';
import { trimChars } from '../utils/trim';

type GameName = [gameTitle: string | undefined, gameDomainName: string | undefined];

export async function newGameSupportExtension(context: vscode.ExtensionContext) {
    const cts = new vscode.CancellationTokenSource();
    let baseUri: vscode.Uri | undefined;

    try {
        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'Running workspace checks',
                cancellable: true
            },
            async (progress, progressToken) => {
                // Forward the progress token to our own CTS
                const progressCancelSub = progressToken.onCancellationRequested(() => {
                    cts.cancel();
                });

                try {
                    const ensureNodeAndGitTask = ensureNodeAndGitAvailable(undefined, cts.token);
                    const gettingGamesTask = getNexusGames(cts.token);

                    // 1. Let the user select a base folder where the new extension folder will be created
                    progress.report({ message: 'Selecting base folder...' });
                    baseUri = await getNewGameExtensionFolder();
                    if (!baseUri) {
                        cts.cancel();
                        return;
                    }

                    // 2. Ask whether to use typescript or javascript
                    progress.report({ message: 'Selecting workspace type...' });
                    const workspaceType = await getNewGameExtensionWorkspaceType();

                    // 3. Ensure Node.js and Git are available and Games are fetched
                    progress.report({ message: 'Ensuring Node.js and Git are available...' });
                    await ensureNodeAndGitTask;

                    progress.report({ message: 'Fetching games from Nexus Mods...' });
                    const games = await gettingGamesTask;

                    // 4. Ask for the new extension game name
                    progress.report({ message: 'Selecting game title...' });
                    const [gameTitle, gameDomainName] = await getNewGameExtensionName(games);

                    Logger.debug(`Creating new extension folder "${gameDomainName}" in "${baseUri.fsPath}"`);
                    progress.report({ message: 'Creating extension folder...' });
                    const targetRootUri = vscode.Uri.joinPath(baseUri, gameDomainName);
                    await vscode.workspace.fs.createDirectory(targetRootUri);

                    Logger.debug(`Created new extension folder at "${targetRootUri.fsPath}"`);

                    // 5. Remember the target folder in global state for post-open scaffolding
                    Logger.debug('Storing pending scaffold state in global state');
                    progress.report({ message: 'Storing scaffold state...' });
                    const pending: PendingScaffoldState = {
                        targetUri: targetRootUri.toString(),
                        workspaceType: workspaceType,
                        packageOptions: {
                            [`${RequiredFiles.INFO_JSON_NAME}.name`]: `Game: ${gameTitle}`,
                            [`${RequiredFiles.INFO_JSON_NAME}.description`]: `Support for ${gameTitle}`,
                            [`${RequiredFiles.PACKAGE_JSON_NAME}.name`]: gameDomainName,
                        }
                    };
                    await context.globalState.update(GLOBAL_STATE.PENDING_SCAFFOLD, pending);

                    // 6. Open the folder in the current window
                    Logger.debug('Opening new extension folder in workspace');
                    progress.report({ message: 'Opening new extension folder...' });
                    await vscode.commands.executeCommand('vscode.openFolder', targetRootUri, false);
                } finally {
                    progressCancelSub.dispose();
                }
            });
    } catch (err) {
        if (err instanceof vscode.CancellationError) {
            // User cancelled via progress UI or our CTS – no error popup needed
            Logger.debug('New game support extension creation cancelled by user');
            if (baseUri) {
                try {
                    Logger.debug(`Cleaning up created folder at "${baseUri.fsPath}"`);
                    await vscode.workspace.fs.delete(baseUri, { recursive: true, useTrash: false });
                } catch { }
            }
            return;
        }

        Logger.error(`Error during new game extension creation: ${String(err)}`);
        vscode.window.showErrorMessage(String(err));
    } finally {
        cts.dispose();
    }
}

async function getNewGameExtensionFolder() {
    let baseUri: vscode.Uri;

    //    - Local: ask user for folder
    //    - Remote: create inside current workspace root (remote filesystem)
    if (vscode.env.remoteName) {
        // Remote context: avoid local folder picker because user likely wants remote FS.
        baseUri = await getWorkspaceRootUri();
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
    return baseUri;
}

async function getNewGameExtensionWorkspaceType() {
    const languageChoice = await vscode.window.showQuickPick(
        ['JavaScript', 'TypeScript'],
        {
            placeHolder: 'Select the programming language for the new extension',
            ignoreFocusOut: true,
        }
    );

    if (!languageChoice) {
        Logger.error('Programming language selection is required for new game support extension');
        throw new Error('Programming language selection is required.');
    }
    Logger.debug(`Selected programming language: ${languageChoice}`);

    return languageChoice === 'JavaScript'
        ? VortexWorkspaceType.JavaScript
        : VortexWorkspaceType.TypeScript;
}

async function getNewGameExtensionName(games?: IGameListEntry[]) {
    const [gameTitle, gameDomainName] = await getGameTitle(games);
    if (!gameTitle || gameTitle.length === 0 || !gameDomainName || gameDomainName.length === 0) {
        Logger.error('Game title is required for new game support extension');
        throw new Error('Game title is required.');
    }
    Logger.debug(`Creating new game support extension for "${gameTitle}"`);

    return [gameTitle, gameDomainName];
}

async function getGameTitle(games?: IGameListEntry[]): Promise<GameName> {
    // await askForNexusApi();
    const useNexusApi = vscode.workspace.getConfiguration().get<boolean>(CONFIGS.CONFIG_USE_NEXUS_API);
    if (useNexusApi) {
        return getGameWithNexusApi(games);
    } else {
        return getGameManually();
    }
}

/*
async function askForNexusApi() {
    const config = vscode.workspace.getConfiguration();
    const inspect = config.inspect<boolean>(CONFIGS.CONFIG_USE_NEXUS_API);

    const hasExplicitValue =
        inspect?.globalValue !== undefined ||
        inspect?.workspaceValue !== undefined ||
        inspect?.workspaceFolderValue !== undefined;

    if (!hasExplicitValue) {
        const choice = await vscode.window.showQuickPick(
            ['Yes', 'No', 'Don\'t ask again'],
            {
                placeHolder: 'Do you want to Login to Nexus Mods to show a list of available games?',
                ignoreFocusOut: true,
            }
        );

        switch (choice) {
            case 'Yes':
                await config.update(CONFIGS.CONFIG_USE_NEXUS_API, true, vscode.ConfigurationTarget.Global);
                break;
            case 'Don\'t ask again':
                await config.update(CONFIGS.CONFIG_USE_NEXUS_API, false, vscode.ConfigurationTarget.Global);
                break;
        }
    }
}*/

async function getGameWithNexusApi(games?: IGameListEntry[]): Promise<GameName> {
    if (!games) {
        Logger.debug('Fetching games from Nexus Mods API');
        games = await getNexusGames();
    }

    if (games.length === 0) {
        Logger.error('No games retrieved from Nexus Mods API');
        vscode.window.showErrorMessage('Could not retrieve games from Nexus Mods API.');
        return getGameManually();
    }

    const game = await pickGame(games);
    const gameTitle = game?.name;
    if (!gameTitle || gameTitle.length === 0) {
        Logger.error('Game title is required for new game support extension');
        throw new Error('Game title is required.');
    }

    return [gameTitle, game.domain_name];
}

async function getGameManually(): Promise<GameName> {
    const gameTitle = await vscode.window.showInputBox({
        prompt: 'Game title (as it should appear in Vortex)',
        placeHolder: 'Bloodstained: Ritual of the Night',
        ignoreFocusOut: true,
    });

    if (!gameTitle || gameTitle.length === 0) {
        Logger.error('Game title is required for new game support extension');
        throw new Error('Game title is required.');
    }

    const sanitizedTitle = trimChars(sanitize(`${gameTitle.toLowerCase()}`).replace(/[^a-z0-9]+/g, '-'), '-');
    if (!sanitizedTitle || sanitizedTitle.length === 0) {
        Logger.error(`Could not generate a valid folder name from the game title "${gameTitle}"`);
        throw new Error(`Could not generate a valid folder name from the game title "${gameTitle}"`);
    }

    return [gameTitle, sanitizedTitle];
}
