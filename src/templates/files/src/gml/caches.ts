import { fs, types } from 'vortex-api';
import { GAME } from '../common/constants';
import { modifiedTimeAsync } from '../common/files';
import { resolveGamePath } from '../detection/discovery';
import { GML } from './constants';

/**
 * Deletes Godot Mod Loader's hook pack (`mod-hooks.zip`) and its cache of
 * decompiled game scripts, so it rebuilds both from the current game and mods
 * on the next start.
 *
 * @param discovery - The game discovery result from Vortex.
 */
export async function removeGmlCaches(discovery: types.IDiscoveryResult): Promise<void> {
    await fs.removeAsync(resolveGamePath(discovery, GML.hookPack));
    await fs.removeAsync(resolveGamePath(discovery, GML.decompDir));
}

/**
 * Deletes the caches if they may hold scripts of an older game version: when
 * the hook pack is missing or older than the game's files, which the store
 * replaces on every update.
 *
 * @param discovery - The game discovery result from Vortex.
 */
export async function removeStaleGmlCaches(discovery: types.IDiscoveryResult): Promise<void> {
    if (await isHookPackCurrent(discovery)) {
        return;
    }
    await removeGmlCaches(discovery);
}

/**
 * Checks whether the hook pack was built after the game was last updated. A
 * game that embeds its pck in the exe has no separate pck to compare with.
 *
 * @param discovery - The game discovery result from Vortex.
 * @returns True if the hook pack exists and is at least as new as the game.
 */
async function isHookPackCurrent(discovery: types.IDiscoveryResult): Promise<boolean> {
    const hookPackTime = await modifiedTimeAsync(resolveGamePath(discovery, GML.hookPack));
    const gameTime = await modifiedTimeAsync(resolveGamePath(discovery, GML.pck))
        ?? await modifiedTimeAsync(resolveGamePath(discovery, GAME.exePath));
    return hookPackTime !== undefined && gameTime !== undefined && hookPackTime >= gameTime;
}
