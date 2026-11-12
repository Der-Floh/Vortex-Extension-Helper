import * as path from 'path';
import { types } from 'vortex-api';
import { contentFiles } from '../archive/inspection';
import { findPackageRoot, hasExtension } from '../archive/loaderFiles';
import { GAME } from '../common/constants';
import { copyInstruction } from '../installers/instructions';
import { MELON_LOADER } from './constants';

/**
 * Test function for MelonLoader mods: archives with a `.dll` file that aren't
 * MelonLoader itself.
 *
 * @param files - List of files contained in the archive.
 * @param gameId - ID of the game the archive is being installed for.
 * @returns A promise resolving to the support state and required files.
 */
export const testSupportedMelonLoaderMods: types.TestSupported = async (files, gameId) => ({
    supported: gameId === GAME.id
        && findPackageRoot(files, MELON_LOADER.packageFiles) === undefined
        && contentFiles(files).some(file => hasExtension(file, MELON_LOADER.modFile)),
    requiredFiles: [],
});

/**
 * Installer implementation for MelonLoader mods.
 *
 * @param files - Files contained in the archive.
 * @returns A promise resolving to installer instructions.
 */
export const installMelonLoaderMods: types.InstallFunc = async (files) => ({
    instructions: contentFiles(files).flatMap(file => {
        const destination = destinationOf(file);
        return destination === undefined ? [] : [copyInstruction(file, path.join(MELON_LOADER.exeDir, destination))];
    }),
});

/**
 * Decides where a file goes, relative to the folder MelonLoader is in: a file
 * inside one of its folders stays in that folder, another `.dll` goes to
 * `Mods`, another `.cfg` to `UserData`, and everything else is skipped.
 *
 * @param file - Path of the file inside the archive.
 * @returns The destination, or undefined to skip the file.
 */
function destinationOf(file: string): string | undefined {
    const segments = file.split(/[\\/]/);
    const contentDirIndex = segments.slice(0, -1).findIndex(segment => contentDirNamed(segment) !== undefined);
    if (contentDirIndex !== -1) {
        return path.join(contentDirNamed(segments[contentDirIndex])!, ...segments.slice(contentDirIndex + 1));
    }
    if (hasExtension(file, MELON_LOADER.modFile)) {
        return path.join(MELON_LOADER.modDir, path.basename(file));
    }
    return hasExtension(file, MELON_LOADER.userDataFile) ? path.join(MELON_LOADER.userDataDir, path.basename(file)) : undefined;
}

/**
 * Finds the MelonLoader folder a path segment names, ignoring case.
 *
 * @param segment - One segment of a path.
 * @returns The folder's real name, or undefined if it isn't one of MelonLoader's folders.
 */
function contentDirNamed(segment: string): string | undefined {
    return MELON_LOADER.contentDirs.find(dir => dir.toLowerCase() === segment.toLowerCase());
}
