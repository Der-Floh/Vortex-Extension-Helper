import * as vscode from 'vscode';
import { MANIFEST, PLACEHOLDER_EXECUTABLE, PLACEHOLDER_STEAM_APP_ID, SETTING_AUTHOR } from '../constants';
import { packageNameFor } from '../templates/packageJson';
import { getTargetState, TargetNotEmptyError } from '../templates/projectWriter';
import { errorMessage } from '../utils/errors';
import { pickNexusGame, type GameIdentity } from './gameQuickPick';
import {
    normalizeExecutable,
    suggestExecutable,
    suggestGameId,
    toShortName,
    validateExecutable,
    validateGameId,
    validateNexusGameId,
    validateShortName,
    validateSteamAppId,
} from './naming';
import type { NexusGame } from './nexusGames';

/** Every prompt returns undefined when the user cancels it */
export async function pickBaseFolder(): Promise<vscode.Uri | undefined> {
    const picked = await vscode.window.showOpenDialog({
        title: 'Select the folder to create the game support extension in',
        openLabel: 'Select Folder',
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
    });
    return picked?.[0];
}

/**
 * Asks for the game, from the Nexus Mods list when one is loading, otherwise by name and domain.
 * A list that fails to load falls back to manual entry.
 */
export async function pickGameIdentity(games: Promise<NexusGame[] | Error> | undefined): Promise<GameIdentity | undefined> {
    if (!games) {
        return askGameManually();
    }
    const loaded = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Window, title: 'Loading the Nexus Mods game list…' },
        () => games
    );
    if (loaded instanceof Error) {
        vscode.window.showWarningMessage(`${MANIFEST.displayName}: ${errorMessage(loaded)} Enter the game by hand instead.`);
        return askGameManually();
    }
    const picked = await pickNexusGame(loaded);
    return picked === 'manual' ? askGameManually() : picked;
}

export async function askShortName(gameId: string, baseFolder: vscode.Uri): Promise<string | undefined> {
    return vscode.window.showInputBox({
        title: 'Short name',
        prompt: 'Names the extension: the folder and package become <short name>-support',
        value: toShortName(gameId),
        ignoreFocusOut: true,
        validateInput: async value => validateShortName(value) ?? await validateTarget(baseFolder, value),
    });
}

/** @returns The app id, an empty string for the placeholder, or undefined if cancelled */
export async function askSteamAppId(): Promise<string | undefined> {
    const value = await vscode.window.showInputBox({
        title: 'Steam app id',
        prompt: `The number in the game's Steam store URL. Leave it empty to write the placeholder ${PLACEHOLDER_STEAM_APP_ID}.`,
        placeHolder: PLACEHOLDER_STEAM_APP_ID,
        ignoreFocusOut: true,
        validateInput: validateSteamAppId,
    });
    return value?.trim();
}

/** @returns The executable's path relative to the game folder, an empty string for the placeholder, or undefined if cancelled */
export async function askExecutable(gameName: string): Promise<string | undefined> {
    const value = await vscode.window.showInputBox({
        title: 'Game executable path',
        prompt: `The executable's path, relative to the folder the store installs the game in. Include any subfolder, for example Game/Game.exe. Leave it empty to write the placeholder ${PLACEHOLDER_EXECUTABLE}.`,
        value: suggestExecutable(gameName),
        placeHolder: PLACEHOLDER_EXECUTABLE,
        ignoreFocusOut: true,
        validateInput: validateExecutable,
    });
    return value === undefined ? undefined : normalizeExecutable(value);
}

export async function askAuthor(): Promise<string | undefined> {
    const value = await vscode.window.showInputBox({
        title: 'Author',
        prompt: `Written to package.json and shown in Vortex. Set ${SETTING_AUTHOR} to skip this question.`,
        ignoreFocusOut: true,
        validateInput: input => input.trim() ? undefined : 'Enter the author.',
    });
    return value?.trim();
}

async function askGameManually(): Promise<GameIdentity | undefined> {
    const gameName = (await vscode.window.showInputBox({
        title: 'Game name',
        prompt: 'The name of the game as Vortex shows it',
        ignoreFocusOut: true,
        validateInput: input => input.trim() ? undefined : 'Enter the game\'s name.',
    }))?.trim();
    if (!gameName) {
        return undefined;
    }
    const gameId = (await vscode.window.showInputBox({
        title: 'Nexus Mods domain',
        prompt: 'The part of the game\'s Nexus Mods URL after nexusmods.com/. Vortex uses it as the game id.',
        value: suggestGameId(gameName),
        ignoreFocusOut: true,
        validateInput: validateGameId,
    }))?.trim();
    if (!gameId) {
        return undefined;
    }
    const nexusGameId = await askNexusGameId();
    return nexusGameId === undefined ? undefined : { gameId, gameName, nexusGameId: nexusGameId || undefined };
}

/** @returns The id, 0 when it is left empty, or undefined if the user cancels */
async function askNexusGameId(): Promise<number | undefined> {
    const value = await vscode.window.showInputBox({
        title: 'Nexus Mods game id',
        prompt: 'The game\'s numerical id, which info.json needs. Leave it empty if the game is not on Nexus Mods yet; the checks then remind you to add it.',
        ignoreFocusOut: true,
        validateInput: validateNexusGameId,
    });
    return value === undefined ? undefined : Number(value.trim() || 0);
}

async function validateTarget(baseFolder: vscode.Uri, shortName: string): Promise<string | undefined> {
    const target = vscode.Uri.joinPath(baseFolder, packageNameFor(shortName));
    return await getTargetState(target) === 'occupied' ? new TargetNotEmptyError(target).message : undefined;
}
