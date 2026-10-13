import * as path from 'path';
import { types } from 'vortex-api';
import { findModFiles } from '../archive/inspection';
import { GAME } from '../common/constants';
import { copyInstruction } from './instructions';

/**
 * Test function for archives that contain {{gameName}} mod files.
 *
 * @param files - List of files contained in the archive.
 * @param gameId - ID of the game the archive is being installed for.
 * @returns A promise resolving to the support state and required files.
 */
export const testSupportedMods: types.TestSupported = async (files, gameId) => ({
    supported: gameId === GAME.id && findModFiles(files).length > 0,
    requiredFiles: [],
});

/**
 * Installer implementation for {{gameName}} mods: copies each mod file into
 * the mods folder, without the folders it was packed in.
 *
 * @param files - Files contained in the archive.
 * @returns A promise resolving to installer instructions.
 */
export const installMods: types.InstallFunc = async (files) => ({
    instructions: findModFiles(files).map(file => copyInstruction(file, path.basename(file))),
});
