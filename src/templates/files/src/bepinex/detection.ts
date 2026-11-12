import * as path from 'path';
import { types } from 'vortex-api';
import { fileExistsSync } from '../common/files';
import { BEPINEX } from './constants';

/**
 * Checks whether the game's build of BepInEx is installed in the game folder.
 *
 * @param discovery - The game discovery result from Vortex, if the game has been discovered.
 * @returns True if BepInEx is installed; otherwise false.
 */
export function isBepInExInstalled(discovery?: types.IDiscoveryResult): boolean {
    const gamePath = discovery?.path;
    return gamePath !== undefined && BEPINEX.detectionFiles.some(file => fileExistsSync(path.join(gamePath, file)));
}
