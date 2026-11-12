import { log, types } from 'vortex-api';
import { GAME } from '../common/constants';
import { BEPINEX, BEPINEX_NOTIFICATIONS } from './constants';

/**
 * Registers the game with Vortex's BepInEx support, which then provides the
 * BepInEx mod types and installs BepInEx itself as a mod.
 *
 * @param api - Vortex extension API.
 * @param autoDownload - Whether Vortex downloads BepInEx by itself.
 */
export function registerWithVortexBepInEx(api: types.IExtensionApi, autoDownload: boolean): void {
    if (api.ext?.bepinexAddGame === undefined) {
        return;
    }
    try {
        api.ext.bepinexAddGame({
            gameId: GAME.id,
            autoDownloadBepInEx: autoDownload,
            // Without its own download, Vortex's update check would compare an installed
            // BepInEx with its bundled BepInEx 5 and disable the installed one.
            forceGithubDownload: !autoDownload,
            architecture: BEPINEX.architecture,
            unityBuild: BEPINEX.unityBuild,
            ...(BEPINEX.installDir === undefined ? {} : { installRelPath: BEPINEX.installDir }),
        });
    } catch (err) {
        log('error', `Registering with Vortex's BepInEx support failed: ${err}`);
    }
}

/**
 * Dismisses the notice Vortex's BepInEx support shows on every activation.
 * Unless Vortex downloads BepInEx itself, its advice points to a build that
 * doesn't fit; this extension's own notification explains what's needed.
 *
 * @param api - Vortex extension API.
 */
export function dismissVortexBepInExNotice(api: types.IExtensionApi): void {
    api.onStateChange?.(['session', 'notifications', 'notifications'], (_previous, current: types.INotification[]) => {
        if (current?.some(notification => notification.id === BEPINEX_NOTIFICATIONS.vortexNotice)) {
            api.dismissNotification?.(BEPINEX_NOTIFICATIONS.vortexNotice);
        }
    });
}
