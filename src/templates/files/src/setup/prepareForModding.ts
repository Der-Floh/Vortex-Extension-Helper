import { types } from 'vortex-api';
// slot:setup-imports
import { GAME } from '../common/constants';
import { ensureWritableDirOrWarn } from '../common/notifications';
import { resolveGamePath } from '../detection/discovery';
// endslot

/**
 * Prepares the game installation for modding. Vortex calls this every time
 * the game mode is activated.
 *
 * {{setupDescription}}
 *
 * @param discovery - The game discovery result from Vortex.
 * @param api - Vortex extension API.
 * @returns A promise that resolves once preparation is complete.
 */
export async function prepareForModding(discovery: types.IDiscoveryResult, api: types.IExtensionApi): Promise<void> {
    await ensureWritableDirOrWarn(api, resolveGamePath(discovery, GAME.modsPath));
    // slot:setup-steps
    // endslot
}
