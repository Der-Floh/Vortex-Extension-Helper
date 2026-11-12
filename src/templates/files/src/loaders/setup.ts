import * as path from 'path';
import { types } from 'vortex-api';
import { BEPINEX } from '../bepinex/constants';
import { isBepInExInstalled } from '../bepinex/detection';
import { GAME } from '../common/constants';
import { apiMakeCheckAndDismissFunction, apiMakeOpenUrlFunction, ensureWritableDirOrWarn } from '../common/notifications';
import { resolveGamePath } from '../detection/discovery';
import { MELON_LOADER } from '../melonloader/constants';
import { isMelonLoaderInstalled } from '../melonloader/detection';
import { LOADER_NOTIFICATIONS } from './constants';

/**
 * Warns unless exactly one mod loader is installed, and makes sure MelonLoader's
 * mods folder exists and is writable if that is the one.
 *
 * @param discovery - The game discovery result from Vortex.
 * @param api - Vortex extension API.
 * @returns A promise that resolves once the check is complete.
 */
export async function prepareLoaders(discovery: types.IDiscoveryResult, api: types.IExtensionApi): Promise<void> {
    const melonLoader = isMelonLoaderInstalled(discovery);
    const bepInEx = isBepInExInstalled(discovery);
    if (!melonLoader && !bepInEx) {
        notifyNoLoader(api, discovery);
        return;
    }
    api.dismissNotification?.(LOADER_NOTIFICATIONS.noLoader);
    if (melonLoader && bepInEx) {
        notifyBothLoaders(api);
        return;
    }
    api.dismissNotification?.(LOADER_NOTIFICATIONS.bothLoaders);
    if (melonLoader) {
        await ensureWritableDirOrWarn(api, resolveGamePath(discovery, path.join(MELON_LOADER.exeDir, MELON_LOADER.modDir)));
    }
}

/**
 * Warns that no mod loader is installed, with links to both and a way to
 * check again after installing one.
 *
 * @param api - Vortex extension API.
 * @param discovery - The game discovery result from Vortex.
 */
function notifyNoLoader(api: types.IExtensionApi, discovery: types.IDiscoveryResult): void {
    api.sendNotification?.({
        id: LOADER_NOTIFICATIONS.noLoader,
        type: 'warning',
        title: 'No mod loader installed',
        message: `${GAME.name} mods need ${MELON_LOADER.name} or ${BEPINEX.name}. For ${BEPINEX.name}, download the newest "${BEPINEX.downloadName}" build.`,
        actions: [
            apiMakeOpenUrlFunction(`Get ${MELON_LOADER.name}`, MELON_LOADER.downloadPage),
            apiMakeOpenUrlFunction(`Get ${BEPINEX.name}`, BEPINEX.downloadPage),
            apiMakeCheckAndDismissFunction('Check again', LOADER_NOTIFICATIONS.noLoader, api, () => isMelonLoaderInstalled(discovery) || isBepInExInstalled(discovery)),
        ],
    });
}

/**
 * Warns that both mod loaders are installed, which can conflict.
 *
 * @param api - Vortex extension API.
 */
function notifyBothLoaders(api: types.IExtensionApi): void {
    api.sendNotification?.({
        id: LOADER_NOTIFICATIONS.bothLoaders,
        type: 'warning',
        title: `${MELON_LOADER.name} and ${BEPINEX.name} installed`,
        message: `${MELON_LOADER.name} and ${BEPINEX.name} are both installed. Please choose one mod loader to avoid conflicts.`,
    });
}
