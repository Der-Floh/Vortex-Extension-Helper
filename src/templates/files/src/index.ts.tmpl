import { types, util } from 'vortex-api';
import { GAME, INSTALLERS } from './common/constants';
import { findGame } from './detection/discovery';
import { installMods, testSupportedMods } from './installers/mods';
import { prepareForModding } from './setup/prepareForModding';

/**
 * Vortex extension entry point for {{gameName}}.
 *
 * Registers the game and the installer for its mods.
 *
 * Vortex also calls this with a stub context while it installs or updates the
 * extension, so `context.api` may only be used inside callbacks and `once`.
 *
 * @param context - Vortex extension context supplied by the host.
 * @returns True if the extension initialized successfully.
 */
function main(context: types.IExtensionContext): boolean {
    context.registerGame({
        id: GAME.id,
        name: GAME.name,
        mergeMods: true,
        queryPath: util.toBlue(findGame),
        supportedTools: [],
        queryModPath: () => GAME.modsDir,
        logo: GAME.logo,
        executable: () => GAME.exe,
        requiredFiles: GAME.requiredFiles,
        setup: util.toBlue((discovery: types.IDiscoveryResult) => prepareForModding(discovery, context.api)),
        environment: { SteamAPPId: GAME.steamAppId },
        details: { steamAppId: GAME.steamAppId },
    });

    context.registerInstaller(INSTALLERS.mods.id, INSTALLERS.mods.priority, testSupportedMods, installMods);

    return true;
}

export default main;
