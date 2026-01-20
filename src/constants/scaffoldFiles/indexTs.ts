export const indexTsContent = `
import * as vortex from 'vortex-api';
import * as path from 'path';
import Promise from 'bluebird';
import { fs, log, util } from 'vortex-api';


// Nexus Mods domain for the game. e.g. nexusmods.com/bloodstainedritualofthenight
const GAME_ID = 'bloodstainedritualofthenight';

//Steam Application ID, you can get this from https://steamdb.info/apps/
const STEAMAPP_ID = '692850';

//GOG Application ID, you can get this from https://www.gogdb.org/
const GOGAPP_ID = '1133514031';

const MOD_FILE_EXT = '.pak';
const QMM_DLL = 'QModManager.dll';
const QMM_MODPAGE = 'https://www.nexusmods.com/bloodstainedritualofthenight/mods/56';


// -------------------------------------
//#region Register Game
// -------------------------------------

function main(context: vortex.types.IExtensionContext): boolean {
    // Register your game here
    context.registerGame({
        id: GAME_ID,
        name: 'Bloodstained: Ritual of the Night',
        mergeMods: true,
        queryPath: findGame,
        supportedTools: [],
        queryModPath: () => 'BloodstainedRotN/Content/Paks/~mods',
        logo: 'gameart.jpg',
        executable: () => 'BloodstainedROTN.exe',
        requiredFiles: [
            'BloodstainedRotN.exe',
            'BloodstainedROTN/Binaries/Win64/BloodstainedRotN-Win64-Shipping.exe',
        ],
        setup: (discovery) => prepareForModding(discovery, context.api),
        environment: { SteamAPPId: STEAMAPP_ID },
        details: { steamAppId: STEAMAPP_ID, gogAppId: GOGAPP_ID },
    });

    // Register mod installer
    context.registerInstaller('bloodstainedrotn-mod', 25, testSupportedContent, installContent);

    return true;
}

function findGame(): Promise<string> {
    return util.GameStoreHelper.findByAppId([STEAMAPP_ID, GOGAPP_ID])
        .then((game: vortex.types.IGameStoreEntry) => game.gamePath);
}

function prepareForModdingSimple(discovery: vortex.types.IDiscoveryResult): Promise<void> {
    return fs.ensureDirAsync(path.join(discovery.path!, 'BloodstainedRotN', 'Content', 'Paks', '~mods'));
}

function prepareForModding(discovery: vortex.types.IDiscoveryResult, api: vortex.types.IExtensionApi): Promise<void> {
    // Path to the main QModManager DLL file.
    const qModPath = path.join(discovery.path!, '<mod-manager>', '<mod-manager-bin-dir>', QMM_DLL);
    // Ensure the mods folder exists, then check for QMM.
    return fs.ensureDirWritableAsync(path.join(discovery.path!, '<mod-dir>'))
        .then(() => checkForQMM(api, qModPath));
}

function checkForQMM(api: vortex.types.IExtensionApi, qModPath: string): Promise<void> {
    return fs.statAsync(qModPath)
        .then(() => undefined)
        .catch(() => {
            api.sendNotification!({
                id: 'qmm-missing',
                type: 'warning',
                title: 'QModManager not installed',
                message: 'QMM is required to mod Subnautica.',
                actions: [{ title: 'Get QMM', action: () => util.opn(QMM_MODPAGE).catch(() => undefined) }],
            });
            return undefined;
        });
}
//#endregion


// -------------------------------------
//#region Mod installers
// -------------------------------------

const testSupportedContent: vortex.types.TestSupported = (files, gameId) => {
    // Make sure we're able to support this mod.
    const supported =
        (gameId === GAME_ID) &&
        (files.find(file => path.extname(file).toLowerCase() === MOD_FILE_EXT) !== undefined);

    return Promise.resolve({ supported, requiredFiles: [] });
};

const installContent: vortex.types.InstallFunc = (files) => {
    // The .pak file is expected to always be positioned in the mods directory we're going to disregard anything placed outside the root.
    const modFile = files.find(file => path.extname(file).toLowerCase() === MOD_FILE_EXT)!;
    const idx = modFile.indexOf(path.basename(modFile));
    const rootPath = path.dirname(modFile);

    // Remove directories and anything that isn't in the rootPath.
    const filtered = files.filter(file =>
        (file.indexOf(rootPath) !== -1) && (!file.endsWith(path.sep)));

    const instructions: vortex.types.IInstruction[] = filtered.map(file => ({
        type: 'copy',
        source: file,
        destination: path.join(file.substr(idx)),
    }));

    return Promise.resolve({ instructions });
};
//#endregion


// -------------------------------------
//#region Modding Tools
// -------------------------------------

const moddingTools: vortex.types.ITool[] = [
  {
    id: 'FNVEdit',
    name: 'FNVEdit',
    logo: 'fo3edit.png',
    executable: () => 'FNVEdit.exe',
    requiredFiles: [
      'FNVEdit.exe',
    ],
  },
  {
    id: 'nvse',
    name: 'New Vegas Script Extender',
    shortName: 'NVSE',
    executable: () => 'nvse_loader.exe',
    requiredFiles: [
      'nvse_loader.exe',
    ],
    relative: true,
    exclusive: true,
  }
];
//#endregion

export default main;
`.trimStart();
