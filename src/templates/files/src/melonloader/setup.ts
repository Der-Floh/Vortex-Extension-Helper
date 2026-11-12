import * as path from 'path';
import { types } from 'vortex-api';
import { GAME } from '../common/constants';
import { apiMakeCheckAndDismissFunction, apiMakeOpenUrlFunction, ensureWritableDirOrWarn } from '../common/notifications';
import { resolveGamePath } from '../detection/discovery';
import { MELON_LOADER, MELON_LOADER_NOTIFICATIONS } from './constants';
import { isMelonLoaderInstalled } from './detection';

/**
 * Warns if MelonLoader is missing; otherwise makes sure its mods folder exists
 * and is writable.
 *
 * @param discovery - The game discovery result from Vortex.
 * @param api - Vortex extension API.
 * @returns A promise that resolves once the check is complete.
 */
export async function prepareMelonLoader(discovery: types.IDiscoveryResult, api: types.IExtensionApi): Promise<void> {
    if (!isMelonLoaderInstalled(discovery)) {
        notifyMelonLoaderMissing(api, discovery);
        return;
    }
    api.dismissNotification?.(MELON_LOADER_NOTIFICATIONS.missing);
    await ensureWritableDirOrWarn(api, resolveGamePath(discovery, path.join(MELON_LOADER.exeDir, MELON_LOADER.modDir)));
}

/**
 * Warns that MelonLoader is missing, with a link to it and a way to check
 * again after installing it.
 *
 * @param api - Vortex extension API.
 * @param discovery - The game discovery result from Vortex.
 */
function notifyMelonLoaderMissing(api: types.IExtensionApi, discovery: types.IDiscoveryResult): void {
    api.sendNotification?.({
        id: MELON_LOADER_NOTIFICATIONS.missing,
        type: 'warning',
        title: `${MELON_LOADER.name} not installed`,
        message: `${GAME.name} mods need ${MELON_LOADER.name}.`,
        actions: [
            apiMakeOpenUrlFunction(`Get ${MELON_LOADER.name}`, MELON_LOADER.downloadPage),
            apiMakeCheckAndDismissFunction('Check again', MELON_LOADER_NOTIFICATIONS.missing, api, () => isMelonLoaderInstalled(discovery)),
        ],
    });
}
