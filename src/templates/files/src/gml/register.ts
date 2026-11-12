import { selectors, types, util } from 'vortex-api';
import { GAME } from '../common/constants';
import { GML_INSTALLERS, REINSTALL_ACTION, START_HOOK } from './constants';
import { onDeploymentChanged } from './deployment';
import { prepareGameLaunch } from './gameLaunch';
import { reinstallGml } from './install';
import { installLoaderArchive, testSupportedLoaderArchive } from './loaderArchiveInstaller';
import { installModZips, testSupportedModZips } from './modZipsInstaller';
import { installUnpackedMods, testSupportedUnpackedMods } from './unpackedModsInstaller';

/**
 * Registers the installers for Godot Mod Loader mods, a start hook that runs
 * the loader's setup when Vortex starts the game, a Mods page action to
 * reinstall the loader, and handlers that clear the loader's caches after
 * deployments.
 *
 * @param context - Vortex extension context supplied by the host.
 */
export function registerGodotModLoader(context: types.IExtensionContext): void {
    context.registerInstaller(GML_INSTALLERS.loaderArchive.id, GML_INSTALLERS.loaderArchive.priority, testSupportedLoaderArchive, installLoaderArchive);
    context.registerInstaller(GML_INSTALLERS.modZips.id, GML_INSTALLERS.modZips.priority, testSupportedModZips, installModZips);
    context.registerInstaller(GML_INSTALLERS.unpackedMods.id, GML_INSTALLERS.unpackedMods.priority, testSupportedUnpackedMods, installUnpackedMods);

    context.registerStartHook(START_HOOK.priority, START_HOOK.id,
        util.toBlue((call: types.IRunParameters) => prepareGameLaunch(context.api, call)));

    context.registerAction(REINSTALL_ACTION.group, REINSTALL_ACTION.position, REINSTALL_ACTION.icon, {}, REINSTALL_ACTION.title,
        () => reinstallGml(context.api),
        () => selectors.activeGameId(context.api.getState()) === GAME.id);

    context.once(() => {
        context.api.onAsync('did-deploy', (profileId: string) => onDeploymentChanged(context.api, profileId));
        context.api.onAsync('did-purge', (profileId: string) => onDeploymentChanged(context.api, profileId));
    });
}
