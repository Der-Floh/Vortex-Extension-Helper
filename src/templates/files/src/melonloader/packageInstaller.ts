import * as path from 'path';
import { types } from 'vortex-api';
import { contentFiles } from '../archive/inspection';
import { GAME } from '../common/constants';
import { copyInstruction } from '../installers/instructions';
import { findPackageRoot } from '../loaderPackages/packages';
import { MELON_LOADER } from './constants';

/**
 * Test function for MelonLoader's own release.
 *
 * @param files - List of files contained in the archive.
 * @param gameId - ID of the game the archive is being installed for.
 * @returns A promise resolving to the support state and required files.
 */
export const testSupportedMelonLoaderPackage: types.TestSupported = async (files, gameId) => ({
    supported: gameId === GAME.id && findPackageRoot(files, MELON_LOADER.packageFiles) !== undefined,
    requiredFiles: [],
});

/**
 * Installer implementation for MelonLoader's own release: installs it as it
 * is next to the game's executable, without the folder it may be packed in.
 *
 * @param files - Files contained in the archive.
 * @returns A promise resolving to installer instructions.
 */
export const installMelonLoaderPackage: types.InstallFunc = async (files) => {
    const root = findPackageRoot(files, MELON_LOADER.packageFiles) ?? '';
    return {
        instructions: contentFiles(files)
            .filter(file => file.startsWith(root))
            .map(file => copyInstruction(file, path.join(MELON_LOADER.exeDir, file.slice(root.length)))),
    };
};
