import * as vscode from 'vscode';
import sanitize from "sanitize-filename";
import { RequiredFiles } from '../constants/requiredFile';
import { ensureNodeAndGitAvailable } from '../utils/shellUtils';
import { getWorkspaceRootUri, VortexWorkspaceType } from '../workspace/vortexWorkspaceUtils';
import { PendingScaffoldState } from './scaffoldFunctions';
import { Logger } from '../utils/logger';
import { CONFIGS, GLOBAL_STATE } from '../constants/strings';
import { getNexusClient } from '../nexus-api/nexusClient';
import { pickGame } from '../nexus-api/gameQuickPick';
import { IGameListEntry } from '@nexusmods/nexus-api';

type GameName = [gameTitle: string | undefined, gameDomainName: string | undefined];

export async function newGameSupportExtension(context: vscode.ExtensionContext) {
    await ensureNodeAndGitAvailable();

    // 1. Ask for the new extension game name
    const [gameTitle, gameDomainName] = await getGameTitle();
    if (!gameTitle || gameTitle.length === 0 || !gameDomainName || gameDomainName.length === 0) {
        Logger.error(`Game title is required for new game support extension`);
        vscode.window.showErrorMessage('Game title is required.');
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
        Logger.error(`Programming language selection is required for new game support extension`);
        vscode.window.showErrorMessage('Programming language selection is required.');
        return;
    }
    Logger.debug(`Selected programming language: ${languageChoice}`);

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
        } catch {
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

    Logger.debug(`Creating new extension folder "${gameDomainName}" in "${baseUri.fsPath}"`);

    const targetRootUri = vscode.Uri.joinPath(baseUri, gameDomainName);
    await vscode.workspace.fs.createDirectory(targetRootUri);

    Logger.debug(`Created new extension folder at "${targetRootUri.fsPath}"`);

    // 4. Remember the target folder in global state for post-open scaffolding
    Logger.debug(`Storing pending scaffold state in global state`);
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

    // 5. Open the folder in the current window
    await vscode.commands.executeCommand('vscode.openFolder', targetRootUri, false);
}

async function getGameTitle(): Promise<GameName> {
    await askForNexusApi();
    const useNexusApi = vscode.workspace.getConfiguration().get<boolean>(CONFIGS.CONFIG_USE_NEXUS_API);
    if (useNexusApi === undefined || useNexusApi === true) {
        return getGameManually();
    } else {
        return getGameWithNexusApi();
    }
}

async function askForNexusApi() {
    const useNexusApi = vscode.workspace.getConfiguration().get<boolean>(CONFIGS.CONFIG_USE_NEXUS_API);
    if (useNexusApi === undefined) {
        const choice = await vscode.window.showQuickPick(
            ['Yes', 'No', 'Don\'t ask again'],
            {
                placeHolder: 'Do you want to Login to Nexus Mods to show a list of available games?',
                ignoreFocusOut: true,
            }
        );

        switch (choice) {
            case 'Yes':
                await vscode.workspace.getConfiguration().update(CONFIGS.CONFIG_USE_NEXUS_API, true, vscode.ConfigurationTarget.Global);
                break;
            case 'Don\'t ask again':
                await vscode.workspace.getConfiguration().update(CONFIGS.CONFIG_USE_NEXUS_API, false, vscode.ConfigurationTarget.Global);
                break;
        }
    }
}

async function getGameWithNexusApi(): Promise<GameName> {
    let games: IGameListEntry[] = [];
    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: 'Running workspace checks',
            cancellable: false
        },
        async (progress) => {
            progress.report({ message: `Signing in to Nexus Mods...` });
            const nexus = await getNexusClient(true);

            progress.report({ message: `Fetching game list...` });
            games = await nexus.getGames();
        });

    if (games.length === 0) {
        Logger.error(`No games retrieved from Nexus Mods API`);
        vscode.window.showErrorMessage('Could not retrieve games from Nexus Mods API.');
        return getGameManually();
    }

    const game = await pickGame(games);
    const gameTitle = game?.name;
    if (!gameTitle || gameTitle.length === 0) {
        Logger.error(`Game title is required for new game support extension`);
        return [undefined, undefined];
    }
    Logger.debug(`Creating new game support extension for "${gameTitle}"`);
    return [gameTitle, game.domain_name];
}

async function getGameManually(): Promise<GameName> {
    const gameTitle = await vscode.window.showInputBox({
        prompt: 'Game title (as it should appear in Vortex)',
        placeHolder: 'Bloodstained: Ritual of the Night',
        ignoreFocusOut: true,
    });

    if (!gameTitle || gameTitle.length === 0) {
        Logger.error(`Game title is required for new game support extension`);
        return [undefined, undefined];
    }

    const sanitizedTitle = sanitize(`${gameTitle.toLowerCase()}`).replace(/[^a-z0-9]+/g, '-').trimChars('-');
    if (!sanitizedTitle || sanitizedTitle.length === 0) {
        Logger.error(`Could not generate a valid folder name from the game title "${gameTitle}"`);
        return [undefined, undefined];
    }

    Logger.debug(`Creating new game support extension for "${gameTitle}"`);
    return [gameTitle, sanitizedTitle];
}
