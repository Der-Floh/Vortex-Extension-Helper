import * as vscode from 'vscode';
import { MANIFEST, PLACEHOLDER_EXECUTABLE, PLACEHOLDER_STEAM_APP_ID } from '../constants';
import type { ProjectLanguage } from '../types/project';
import { errorMessage } from './errors';
import { pickNexusGame, type GameIdentity } from './gameQuickPick';
import {
    normalizeExecutable,
    packageNameFor,
    suggestExecutable,
    suggestGameId,
    toShortName,
    validateExecutable,
    validateGameId,
    validateShortName,
    validateSteamAppId,
} from './naming';
import type { NexusGame } from './nexusGames';
import { getTargetState, TargetNotEmptyError } from './projectWriter';

interface LanguageQuickPickItem extends vscode.QuickPickItem {
    readonly language: ProjectLanguage;
}

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

export async function pickLanguage(): Promise<ProjectLanguage | undefined> {
    const items: LanguageQuickPickItem[] = [
        { label: 'TypeScript', description: 'Type checked, recommended', language: 'typescript' },
        { label: 'JavaScript', description: 'Types only through JSDoc', language: 'javascript' },
    ];
    const picked = await vscode.window.showQuickPick(items, { title: 'Select the language', ignoreFocusOut: true });
    return picked?.language;
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

/** @returns The executable relative to the game folder, an empty string for the placeholder, or undefined if cancelled */
export async function askExecutable(gameName: string): Promise<string | undefined> {
    const value = await vscode.window.showInputBox({
        title: 'Game executable',
        prompt: `The executable, relative to the game folder. Leave it empty to write the placeholder ${PLACEHOLDER_EXECUTABLE}.`,
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
        prompt: 'Written to package.json and shown in Vortex. Set vortexHelper.author to skip this question.',
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
    return gameId ? { gameId, gameName } : undefined;
}

async function validateTarget(baseFolder: vscode.Uri, shortName: string): Promise<string | undefined> {
    const target = vscode.Uri.joinPath(baseFolder, packageNameFor(shortName));
    return await getTargetState(target) === 'occupied' ? new TargetNotEmptyError(target).message : undefined;
}
