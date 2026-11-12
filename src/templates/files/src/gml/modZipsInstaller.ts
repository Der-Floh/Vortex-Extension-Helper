import * as path from 'path';
import { types } from 'vortex-api';
import { GAME } from '../common/constants';
import { copyInstruction } from '../installers/instructions';
import { findModZips } from './archive';
import { MOD_LAYOUT } from './constants';

/**
 * Test function for archives that contain Godot Mod Loader mod zips, such as a
 * mod zip packed into another archive or a collection of mod zips.
 *
 * It runs before the unpacked-mods installer, so archives that ship mod zips
 * next to their sources install the zips.
 *
 * @param files - List of files contained in the archive.
 * @param gameId - ID of the game the archive is being installed for.
 * @returns A promise resolving to the support state and required files.
 */
export const testSupportedModZips: types.TestSupported = async (files, gameId) => ({
    supported: gameId === GAME.id && findModZips(files).length > 0,
    requiredFiles: [],
});

/**
 * Installer implementation for archives with mod zips: copies each zip
 * unchanged into the mods folder. Godot Mod Loader only loads `.zip` in lower
 * case, so the extension is normalized.
 *
 * @param files - Files contained in the archive.
 * @returns A promise resolving to installer instructions.
 */
export const installModZips: types.InstallFunc = async (files) => {
    const instructions = new Map<string, types.IInstruction>();
    for (const file of findModZips(files)) {
        const destination = modZipName(file);
        if (!instructions.has(destination.toLowerCase())) {
            instructions.set(destination.toLowerCase(), copyInstruction(file, destination));
        }
    }
    return { instructions: [...instructions.values()] };
};

/**
 * Builds the file name a mod zip is deployed under.
 *
 * @param file - Path of the zip inside the archive.
 * @returns The zip's file name with a lower-case `.zip` extension.
 */
function modZipName(file: string): string {
    return path.basename(file, path.extname(file)) + MOD_LAYOUT.zipExtension;
}
