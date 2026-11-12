import { types } from 'vortex-api';
import { isBepInExInstalled } from '../bepinex/detection';
import { GAME } from '../common/constants';
import { getDiscovery } from '../detection/discovery';
import { isMelonLoaderInstalled } from '../melonloader/detection';
import { BEPINEX_INJECTOR_MOD_TYPE, MELON_LOADER_PACKAGE_ATTRIBUTE } from './constants';
import type { LoaderPresence } from './routing';

/**
 * Detects the installed mod loaders for routing archives. Besides the game
 * folder, it counts loaders installed through Vortex that may not be deployed
 * yet.
 *
 * @param api - Vortex extension API.
 * @returns Which mod loaders are installed.
 */
export function detectLoaders(api: types.IExtensionApi): LoaderPresence {
    const discovery = getDiscovery(api);
    const mods: types.IMod[] = Object.values(api.getState().persistent.mods?.[GAME.id] ?? {});
    return {
        melonLoader: isMelonLoaderInstalled(discovery) || mods.some(mod => mod.attributes?.[MELON_LOADER_PACKAGE_ATTRIBUTE] === true),
        bepInEx: isBepInExInstalled(discovery) || mods.some(mod => mod.type === BEPINEX_INJECTOR_MOD_TYPE),
    };
}
