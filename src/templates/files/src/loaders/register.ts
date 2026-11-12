import { types, util } from 'vortex-api';
import { BEPINEX_INSTALLERS } from '../bepinex/constants';
import { installBepInExMods, testSupportedBepInExMods } from '../bepinex/modsInstaller';
import { dismissVortexBepInExNotice, registerWithVortexBepInEx } from '../bepinex/vortexSupport';
import { GAME } from '../common/constants';
import { getDiscovery } from '../detection/discovery';
import { MELON_LOADER_INSTALLERS } from '../melonloader/constants';
import { installMelonLoaderMods, testSupportedMelonLoaderMods } from '../melonloader/modsInstaller';
import { installMelonLoaderPackage, testSupportedMelonLoaderPackage } from '../melonloader/packageInstaller';
import { GAME_ROOT_MOD_TYPE, MELON_LOADER_PACKAGE_ATTRIBUTE } from './constants';
import { detectLoaders } from './detection';
import { chooseLoader, Loader } from './routing';

const GAME_ROOT_INSTRUCTION: types.IInstruction = { type: 'setmodtype', value: GAME_ROOT_MOD_TYPE.id };
const PACKAGE_INSTRUCTION: types.IInstruction = { type: 'attribute', key: MELON_LOADER_PACKAGE_ATTRIBUTE, value: true };

/**
 * Registers MelonLoader's and BepInEx's installers so each mod goes to the
 * right loader, the game root mod type MelonLoader's files need, and the game
 * with Vortex's BepInEx support. Vortex doesn't download BepInEx here, or it
 * would install it next to MelonLoader.
 *
 * @param context - Vortex extension context supplied by the host.
 */
export function registerLoaders(context: types.IExtensionContext): void {
    context.registerModType(GAME_ROOT_MOD_TYPE.id, GAME_ROOT_MOD_TYPE.priority,
        gameId => gameId === GAME.id,
        () => getDiscovery(context.api)?.path as string,
        util.toBlue(async () => false),
        { mergeMods: true, name: GAME_ROOT_MOD_TYPE.name });

    context.registerInstaller(MELON_LOADER_INSTALLERS.package.id, MELON_LOADER_INSTALLERS.package.priority,
        testSupportedMelonLoaderPackage,
        withInstructions(installMelonLoaderPackage, [GAME_ROOT_INSTRUCTION, PACKAGE_INSTRUCTION]));
    context.registerInstaller(BEPINEX_INSTALLERS.mods.id, BEPINEX_INSTALLERS.mods.priority,
        routedTo('bepinex', testSupportedBepInExMods, context),
        installBepInExMods);
    context.registerInstaller(MELON_LOADER_INSTALLERS.mods.id, MELON_LOADER_INSTALLERS.mods.priority,
        routedTo('melonloader', testSupportedMelonLoaderMods, context),
        withInstructions(installMelonLoaderMods, [GAME_ROOT_INSTRUCTION]));

    context.once(() => {
        registerWithVortexBepInEx(context.api, false);
        dismissVortexBepInExNotice(context.api);
    });
}

/**
 * Limits an installer to the archives that are meant for its loader.
 *
 * @param loader - The installer's loader.
 * @param test - The installer's test function.
 * @param context - Vortex extension context, used to detect the installed loaders.
 * @returns The limited test function.
 */
function routedTo(loader: Loader, test: types.TestSupported, context: types.IExtensionContext): types.TestSupported {
    return async (files, gameId, ...rest) => {
        const result = await test(files, gameId, ...rest);
        return result.supported && chooseLoader(files, detectLoaders(context.api)) === loader
            ? result
            : { supported: false, requiredFiles: [] };
    };
}

/**
 * Adds instructions to everything an installer produces.
 *
 * @param install - The installer.
 * @param instructions - The instructions to add.
 * @returns The extended installer.
 */
function withInstructions(install: types.InstallFunc, instructions: types.IInstruction[]): types.InstallFunc {
    return async (...args) => {
        const result = await install(...args);
        return { ...result, instructions: [...result.instructions, ...instructions] };
    };
}
