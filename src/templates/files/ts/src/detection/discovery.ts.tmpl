import * as path from 'path';
import { selectors, types, util } from 'vortex-api';
import { GAME } from '../common/constants';

/**
 * Locates the {{gameName}} installation directory.
 *
 * Uses Vortex's `GameStoreHelper` to find the game by its Steam app ID.
 *
 * @returns A promise that resolves to the game installation path.
 */
export async function findGame(): Promise<string> {
    const game = await util.GameStoreHelper.findByAppId(GAME.steamAppId, 'steam');
    return game.gamePath;
}

/**
 * Reads the current {{gameName}} discovery result from the Vortex state.
 *
 * @param api - Vortex extension API.
 * @returns The discovery result, or undefined if the game hasn't been discovered.
 */
export function getDiscovery(api: types.IExtensionApi): types.IDiscoveryResult | undefined {
    return selectors.discoveryByGame(api.getState(), GAME.id);
}

/**
 * Resolves a path relative to the discovered game folder.
 *
 * @param discovery - The game discovery result from Vortex.
 * @param relativePath - Path relative to the game folder.
 * @returns The absolute path.
 */
export function resolveGamePath(discovery: types.IDiscoveryResult, relativePath: string): string {
    return path.join(discovery.path!, relativePath);
}
