import { types } from 'vortex-api';
import { BEPINEX, BEPINEX_INSTALLERS } from './constants';
import { installBepInExMods, testSupportedBepInExMods } from './modsInstaller';
import { dismissVortexBepInExNotice, registerWithVortexBepInEx } from './vortexSupport';

/**
 * Registers the installer for BepInEx plugins and the game with Vortex's
 * BepInEx support.
 *
 * @param context - Vortex extension context supplied by the host.
 */
export function registerBepInEx(context: types.IExtensionContext): void {
    context.registerInstaller(BEPINEX_INSTALLERS.mods.id, BEPINEX_INSTALLERS.mods.priority, testSupportedBepInExMods, installBepInExMods);

    context.once(() => {
        registerWithVortexBepInEx(context.api, BEPINEX.isMono);
        if (!BEPINEX.isMono) {
            dismissVortexBepInExNotice(context.api);
        }
    });
}
