import { types } from 'vortex-api';
import { GAME } from '../common/constants';
import { fatalErrorInstruction } from '../installers/instructions';
import { findModRoots, findModZips, isLoaderArchive } from './archive';
import { GML, REINSTALL_ACTION } from './constants';

/**
 * Test function for archives that are Godot Mod Loader itself, which would
 * otherwise end up in the mods folder through Vortex's fallback installer.
 *
 * @param files - List of files contained in the archive.
 * @param gameId - ID of the game the archive is being installed for.
 * @returns A promise resolving to the support state and required files.
 */
export const testSupportedLoaderArchive: types.TestSupported = async (files, gameId) => ({
    supported: gameId === GAME.id
        && isLoaderArchive(files)
        && findModRoots(files).length === 0
        && findModZips(files).length === 0,
    requiredFiles: [],
});

/**
 * Installer implementation for Godot Mod Loader archives: cancels the
 * installation and points the user to the extension's own install.
 *
 * @returns A promise resolving to a fatal error instruction.
 */
export const installLoaderArchive: types.InstallFunc = async () => ({
    instructions: [
        fatalErrorInstruction(`This archive is ${GML.name} itself, which isn't installed as a mod. `
            + `This extension installs it for you: use "Install" on the "${GML.name} not installed" notification, `
            + `or "${REINSTALL_ACTION.title}" on the Mods page.`),
    ],
});
