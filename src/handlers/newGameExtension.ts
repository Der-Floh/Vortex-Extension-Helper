import * as vscode from 'vscode';
import { MANIFEST } from '../constants';
import { renderProject } from '../templates/registry';
import type { ProjectValues } from '../types/project';
import { getConfiguration, type HelperConfiguration } from '../utils/configuration';
import { errorMessage } from '../utils/errors';
import { Logger } from '../utils/logger';
import { packageNameFor } from '../utils/naming';
import { askAuthor, askExecutable, askShortName, askSteamAppId, pickBaseFolder, pickGameIdentity } from '../utils/newGamePrompts';
import { fetchNexusGames, type NexusGame } from '../utils/nexusGames';
import { savePendingInstall } from '../utils/pendingInstall';
import { writeNewProject } from '../utils/projectWriter';

/** Asks for everything first, then writes the project and opens it; its dependencies are installed after the reload */
export async function handleNewGameExtension(state: vscode.Memento): Promise<void> {
    const configuration = getConfiguration();
    const cancellation = new vscode.CancellationTokenSource();
    // Started before the first prompt to save time; the catch keeps a cancelled wizard from leaving an unhandled rejection
    const games: Promise<NexusGame[] | Error> | undefined = configuration.useNexusApi
        ? fetchNexusGames(cancellation.token).catch((e: unknown) => e instanceof Error ? e : new Error(String(e)))
        : undefined;

    try {
        const values = await askProjectValues(games, configuration);
        if (!values) {
            return;
        }
        await createProject(values.baseFolder, values.project, state);
    } finally {
        cancellation.cancel();
        cancellation.dispose();
    }
}

async function askProjectValues(games: Promise<NexusGame[] | Error> | undefined, configuration: HelperConfiguration): Promise<{ baseFolder: vscode.Uri; project: ProjectValues } | undefined> {
    const baseFolder = await pickBaseFolder();
    if (!baseFolder) {
        return undefined;
    }
    const game = await pickGameIdentity(games);
    if (!game) {
        return undefined;
    }
    const shortName = await askShortName(game.gameId, baseFolder);
    if (!shortName) {
        return undefined;
    }
    const steamAppId = configuration.askSteamAppId ? await askSteamAppId() : '';
    if (steamAppId === undefined) {
        return undefined;
    }
    const executable = configuration.askExecutable ? await askExecutable(game.gameName) : '';
    if (executable === undefined) {
        return undefined;
    }
    const author = configuration.author?.trim() || await askAuthor();
    if (!author) {
        return undefined;
    }
    return { baseFolder, project: { shortName, ...game, author, steamAppId, executable } };
}

async function createProject(baseFolder: vscode.Uri, values: ProjectValues, state: vscode.Memento): Promise<void> {
    const target = vscode.Uri.joinPath(baseFolder, packageNameFor(values.shortName));
    try {
        await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: `${MANIFEST.displayName}: Creating ${packageNameFor(values.shortName)}…` },
            () => writeNewProject(target, renderProject(values))
        );
    } catch (e) {
        Logger.error(`Failed to create ${target.fsPath}: ${errorMessage(e)}`);
        vscode.window.showErrorMessage(`${MANIFEST.displayName}: Failed to create the extension. ${errorMessage(e)}`);
        return;
    }

    Logger.info(`Created ${target.fsPath} for ${values.gameName}.`);
    await savePendingInstall(state, target);
    vscode.window.showInformationMessage(`${MANIFEST.displayName}: Created ${target.fsPath}. Its dependencies are installed once it is open.`);
    await vscode.commands.executeCommand('vscode.openFolder', target, false);
}
