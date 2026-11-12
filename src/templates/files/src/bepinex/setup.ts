import { types } from 'vortex-api';
import { GAME } from '../common/constants';
import { apiMakeCheckAndDismissFunction, apiMakeOpenUrlFunction } from '../common/notifications';
import { BEPINEX, BEPINEX_NOTIFICATIONS } from './constants';
import { isBepInExInstalled } from './detection';

/**
 * Warns if BepInEx is missing and Vortex can't download it by itself, which
 * it can only do for the Mono build.
 *
 * @param discovery - The game discovery result from Vortex.
 * @param api - Vortex extension API.
 * @returns A promise that resolves once the check is complete.
 */
export async function prepareBepInEx(discovery: types.IDiscoveryResult, api: types.IExtensionApi): Promise<void> {
    if (BEPINEX.isMono || isBepInExInstalled(discovery)) {
        api.dismissNotification?.(BEPINEX_NOTIFICATIONS.missing);
        return;
    }
    notifyBepInExMissing(api, discovery);
}

/**
 * Warns that BepInEx is missing, with a link to it and a way to check again
 * after installing it.
 *
 * @param api - Vortex extension API.
 * @param discovery - The game discovery result from Vortex.
 */
function notifyBepInExMissing(api: types.IExtensionApi, discovery: types.IDiscoveryResult): void {
    api.sendNotification?.({
        id: BEPINEX_NOTIFICATIONS.missing,
        type: 'warning',
        title: `${BEPINEX.name} not installed`,
        message: `${GAME.name} mods need ${BEPINEX.name}. Download the newest "${BEPINEX.downloadName}" build and drop it on the Mods page.`,
        actions: [
            apiMakeOpenUrlFunction(`Get ${BEPINEX.name}`, BEPINEX.downloadPage),
            apiMakeCheckAndDismissFunction('Check again', BEPINEX_NOTIFICATIONS.missing, api, () => isBepInExInstalled(discovery)),
        ],
    });
}
