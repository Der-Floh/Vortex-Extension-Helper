import * as path from 'path';
import { BEPINEX } from '../bepinex/constants';
import { MELON_LOADER } from '../melonloader/constants';
import { MARKERS } from './constants';

/** A mod loader an archive can be installed for. */
export type Loader = 'melonloader' | 'bepinex';

/** Which mod loaders are installed, on disk or as Vortex mods. */
export interface LoaderPresence {
    melonLoader: boolean;
    bepInEx: boolean;
}

/**
 * Decides which mod loader an archive is meant for. A marker file wins over a
 * path that mentions a loader, which wins over the loaders that are installed.
 * MelonLoader is the default.
 *
 * @param files - Files contained in the archive.
 * @param loaders - The installed mod loaders.
 * @returns The loader to install the archive for.
 */
export function chooseLoader(files: string[], loaders: LoaderPresence): Loader {
    const markedBepInEx = hasMarker(files, MARKERS.bepInEx);
    if (markedBepInEx !== hasMarker(files, MARKERS.melonLoader)) {
        return markedBepInEx ? 'bepinex' : 'melonloader';
    }
    const mentionsBepInEx = mentions(files, BEPINEX.name);
    if (mentionsBepInEx !== mentions(files, MELON_LOADER.name)) {
        return mentionsBepInEx ? 'bepinex' : 'melonloader';
    }
    return loaders.bepInEx && !loaders.melonLoader ? 'bepinex' : 'melonloader';
}

/**
 * Checks whether an archive has a marker file, ignoring case.
 *
 * @param files - Files contained in the archive.
 * @param marker - Lower-case name of the marker file.
 * @returns True if the archive has the file.
 */
function hasMarker(files: string[], marker: string): boolean {
    return files.some(file => path.basename(file).toLowerCase() === marker);
}

/**
 * Checks whether any path contains a loader's name, ignoring case.
 *
 * @param files - Files contained in the archive.
 * @param name - The loader's name.
 * @returns True if a path contains the name.
 */
function mentions(files: string[], name: string): boolean {
    const lowerCaseName = name.toLowerCase();
    return files.some(file => file.toLowerCase().includes(lowerCaseName));
}
