import * as path from 'path';
import { types } from 'vortex-api';
import { contentFiles } from '../archive/inspection';
import { GAME } from '../common/constants';
import { copyInstruction } from '../installers/instructions';
import { findPackageRoot, hasExtension } from '../loaderPackages/packages';
import { BEPINEX } from './constants';

/**
 * Test function for BepInEx plugins: archives with a `.dll` file that aren't
 * BepInEx itself. Vortex's BepInEx support has already looked at the archive
 * and takes BepInEx itself and archives with a top-level `plugins` folder.
 *
 * @param files - List of files contained in the archive.
 * @param gameId - ID of the game the archive is being installed for.
 * @returns A promise resolving to the support state and required files.
 */
export const testSupportedBepInExMods: types.TestSupported = async (files, gameId) => ({
    supported: gameId === GAME.id
        && findPackageRoot(files, BEPINEX.packageFiles) === undefined
        && contentFiles(files).some(file => hasExtension(file, BEPINEX.modFile)),
    requiredFiles: [],
});

/**
 * Installer implementation for BepInEx plugins. Vortex deploys them to
 * `GAME.modsPath`, which is BepInEx's plugins folder.
 *
 * @param files - Files contained in the archive.
 * @returns A promise resolving to installer instructions.
 */
export const installBepInExMods: types.InstallFunc = async (files) => {
    const content = contentFiles(files);
    const insidePlugins = content.filter(file => pluginsFolderIndex(file) !== -1);
    return {
        instructions: insidePlugins.length > 0
            ? insidePlugins.map(file => copyInstruction(file, pathInsidePlugins(file)))
            : content.filter(file => hasExtension(file, BEPINEX.modFile)).map(file => copyInstruction(file, path.basename(file))),
    };
};

/**
 * Finds the `plugins` folder in a path.
 *
 * @param file - Path of the file inside the archive.
 * @returns The folder's index among the path's segments, or -1 if the file isn't inside one.
 */
function pluginsFolderIndex(file: string): number {
    return file.split(/[\\/]/).slice(0, -1).findIndex(segment => segment.toLowerCase() === BEPINEX.pluginsDir);
}

/**
 * Builds a file's path below the `plugins` folder, so a plugin keeps its
 * subfolders and the assets in them.
 *
 * @param file - Path of a file inside a `plugins` folder.
 * @returns The path relative to that folder.
 */
function pathInsidePlugins(file: string): string {
    return path.join(...file.split(/[\\/]/).slice(pluginsFolderIndex(file) + 1));
}
