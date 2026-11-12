import * as path from 'path';
import { types } from 'vortex-api';
import { fileExistsSync } from '../common/files';
import { MELON_LOADER } from './constants';

/**
 * Checks whether MelonLoader is installed in the game folder.
 *
 * @param discovery - The game discovery result from Vortex, if the game has been discovered.
 * @returns True if MelonLoader is installed; otherwise false.
 */
export function isMelonLoaderInstalled(discovery?: types.IDiscoveryResult): boolean {
    const gamePath = discovery?.path;
    return gamePath !== undefined && MELON_LOADER.detectionFiles.some(file => fileExistsSync(path.join(gamePath, file)));
}
