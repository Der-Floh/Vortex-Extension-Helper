import { types, util } from 'vortex-api';
// slot:index-imports
import { GAME, INSTALLERS } from './common/constants';
import { findGame } from './detection/discovery';
import { installMods, testSupportedMods } from './installers/mods';
// endslot
import { prepareForModding } from './setup/prepareForModding';

/**
 * Vortex extension entry point for {{gameName}}.
 *
 * {{entryDescription}}
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
        queryModPath: () => GAME.modsPath,
        logo: GAME.logo,
        executable: () => GAME.exePath,
        requiredFiles: GAME.requiredFilePaths,
        setup: util.toBlue((discovery: types.IDiscoveryResult) => prepareForModding(discovery, context.api)),
        environment: { SteamAPPId: GAME.steamAppId },
        details: { steamAppId: GAME.steamAppId },
        // slot:game-fields
        // endslot
    });

    // slot:index-registrations
    context.registerInstaller(INSTALLERS.mods.id, INSTALLERS.mods.priority, testSupportedMods, installMods);
    // endslot

    return true;
}

export default main;
