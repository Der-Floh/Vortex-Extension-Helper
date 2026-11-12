import { types } from 'vortex-api';
import { MELON_LOADER_INSTALLERS } from './constants';
import { installMelonLoaderMods, testSupportedMelonLoaderMods } from './modsInstaller';
import { installMelonLoaderPackage, testSupportedMelonLoaderPackage } from './packageInstaller';

/**
 * Registers the installers for MelonLoader and its mods.
 *
 * @param context - Vortex extension context supplied by the host.
 */
export function registerMelonLoader(context: types.IExtensionContext): void {
    context.registerInstaller(MELON_LOADER_INSTALLERS.package.id, MELON_LOADER_INSTALLERS.package.priority, testSupportedMelonLoaderPackage, installMelonLoaderPackage);
    context.registerInstaller(MELON_LOADER_INSTALLERS.mods.id, MELON_LOADER_INSTALLERS.mods.priority, testSupportedMelonLoaderMods, installMelonLoaderMods);
}
