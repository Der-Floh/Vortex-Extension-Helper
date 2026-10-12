import type { SnippetMap } from '../types/snippet';

export const SNIPPETS_TS: SnippetMap = {
    tcommonImports: {
        description: 'Imports most game extension modules need',
        body: `import * as path from 'path';
import { fs, log, selectors, types, util } from 'vortex-api';`,
    },
    tgameConstants: {
        description: 'GAME, INSTALLERS and NOTIFICATION_IDS constants',
        body: `export const GAME = {
    id: '\${1:nexusdomain}',
    name: '\${2:Game Name}',
    logo: 'gameart.jpg',
    steamAppId: '\${3:000000}',
    exe: '\${4:Game.exe}',
    modsDir: '\${5:mods}',
    requiredFiles: [
        '\${4:Game.exe}',
    ],
};

export const INSTALLERS = {
    \${6:mods}: { id: '\${1:nexusdomain}-\${6:mods}', priority: \${7:25} },
};

export const NOTIFICATION_IDS = {
    directoryNotWritable: '\${1:nexusdomain}-writable-warning',
};`,
    },
    tregisterGame: {
        description: 'Registers the game with Vortex',
        body: `context.registerGame({
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
});`,
    },
    tqueryArgs: {
        description: 'Lets Vortex find the game in a store by itself, as an alternative to queryPath',
        body: 'queryArgs: { steam: [{ id: GAME.steamAppId }] },',
    },
    tfindGameSteam: {
        description: 'Finds the game in the Steam library',
        body: `/**
 * Locates the game's installation directory through its Steam app ID.
 *
 * @returns A promise that resolves to the game installation path.
 */
export async function findGame(): Promise<string> {
    const game = await util.GameStoreHelper.findByAppId(GAME.steamAppId, 'steam');
    return game.gamePath;
}`,
    },
    tprepareForModding: {
        description: 'Makes sure the mods folder exists and is writable',
        body: `/**
 * Prepares the game installation for modding. Vortex calls this every time
 * the game mode is activated.
 *
 * @param discovery - The game discovery result from Vortex.
 * @param api - Vortex extension API.
 * @returns A promise that resolves once preparation is complete.
 */
export async function prepareForModding(discovery: types.IDiscoveryResult, api: types.IExtensionApi): Promise<void> {
    await ensureWritableDirOrWarn(api, resolveGamePath(discovery, GAME.modsDir));$0
}`,
    },
    tregisterInstaller: {
        description: 'Registers an installer',
        body: 'context.registerInstaller(INSTALLERS.${1:mods}.id, INSTALLERS.${1:mods}.priority, ${2:testSupportedMods}, ${3:installMods});',
    },
    ttestSupported: {
        description: 'Decides whether an installer handles an archive',
        body: `/**
 * Test function for archives that contain \${2:mod files}.
 *
 * @param files - List of files contained in the archive.
 * @param gameId - ID of the game the archive is being installed for.
 * @returns A promise resolving to the support state and required files.
 */
export const \${1:testSupportedMods}: types.TestSupported = async (files, gameId) => ({
    supported: gameId === GAME.id && \${3:findModFiles(files).length > 0},
    requiredFiles: [],
});`,
    },
    tinstallContent: {
        description: 'Copies the files of an archive into the mods folder',
        body: `/**
 * Installer implementation: copies \${2:each mod file} into the mods folder.
 *
 * @param files - Files contained in the archive.
 * @returns A promise resolving to installer instructions.
 */
export const \${1:installMods}: types.InstallFunc = async (files) => ({
    instructions: \${3:findModFiles(files)}.map(file => copyInstruction(file, \${4:path.basename(file)})),
});`,
    },
    tfatalErrorInstruction: {
        description: 'Cancels an installation and tells the user why',
        body: 'return { instructions: [fatalErrorInstruction(\'${1:The archive contains no mod files.}\')] };',
    },
    tdeployEvents: {
        description: 'Runs code after every deployment and purge',
        body: `context.once(() => {
    context.api.onAsync('did-deploy', (profileId: string) => \${1:onDeploymentChanged}(context.api, profileId));
    context.api.onAsync('did-purge', (profileId: string) => \${1:onDeploymentChanged}(context.api, profileId));
});`,
    },
    tdeploymentHandler: {
        description: 'Handles a deployment or purge of this game\'s profiles',
        body: `/**
 * Runs after Vortex deployed or purged the mods of a profile.
 *
 * @param api - Vortex extension API.
 * @param profileId - ID of the profile that was deployed or purged.
 * @returns A promise that resolves once the handler is done.
 */
export async function \${1:onDeploymentChanged}(api: types.IExtensionApi, profileId: string): Promise<void> {
    if (selectors.profileById(api.getState(), profileId)?.gameId !== GAME.id) {
        return;
    }
    try {
        $0
    } catch (err) {
        log('warn', '\${2:Failed to handle the deployment}', err);
    }
}`,
    },
    tregisterStartHook: {
        description: 'Changes how Vortex starts the game',
        body: `context.registerStartHook(\${1:200}, '\${2:start-hook-id}', util.toBlue(async (call: types.IRunParameters) => {
    if (selectors.activeGameId(context.api.getState()) !== GAME.id) {
        return call;
    }
    $0
    return call;
}));`,
    },
    tregisterAction: {
        description: 'Adds a button to the toolbar of the Mods page',
        body: `context.registerAction('mod-icons', \${1:300}, '\${2:refresh}', {}, '\${3:Action title}',
    () => {
        $0
    },
    () => selectors.activeGameId(context.api.getState()) === GAME.id);`,
    },
    tnotifyMissingDependency: {
        description: 'Warns when a file the mods need is missing',
        body: `if (!await fileExistsAsync(resolveGamePath(discovery, '\${1:path/to/required.dll}'))) {
    api.sendNotification?.({
        id: '\${2:dependency-missing}',
        type: 'warning',
        title: '\${3:Dependency} not installed',
        message: '\${3:Dependency} is required to use mods for this game.',
        actions: [
            apiMakeOpenUrlFunction('Get \${3:Dependency}', '\${4:https://www.nexusmods.com/}'),
        ],
    });
}`,
    },
    tsupportedTools: {
        description: 'A tool Vortex can start next to the game',
        body: `supportedTools: [
    {
        id: '\${1:tool-id}',
        name: '\${2:Tool Name}',
        executable: () => '\${3:Tool.exe}',
        requiredFiles: ['\${3:Tool.exe}'],
        relative: true,
    },
],`,
    },
};
