// Common imports
const commonImports = `
const vortex = require('vortex-api');
/** @typedef {(context: vortex.types.IExtensionContext) => boolean} VortexExtensionEntry */
/** @typedef {{ default: VortexExtensionEntry }} VortexGameExtensionModule */
// -------------------------------------


const path = require('path');
const Promise = require('bluebird');
const { fs, log, util } = require('vortex-api');
`;

const commonConsts = `
// Nexus Mods domain for the game. e.g. nexusmods.com/bloodstainedritualofthenight
const GAME_ID = 'bloodstainedritualofthenight';

//Steam Application ID, you can get this from https://steamdb.info/apps/
const STEAMAPP_ID = '692850';

//GOG Application ID, you can get this from https://www.gogdb.org/
const GOGAPP_ID = '1133514031';

const MOD_FILE_EXT = ".pak";
const QMM_DLL = 'QModManager.dll';
const QMM_MODPAGE = 'https://www.nexusmods.com/bloodstainedritualofthenight/mods/56';
`;

// Common functions
const registerGame = `
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
`;

const registerInstaller = `
context.registerInstaller('bloodstainedrotn-mod', 25, testSupportedContent, installContent);
`;

const findGameSteam = `
/** @returns {Promise<string | vortex.types.IGameStoreEntry>} */
function findGame() {
    return util.GameStoreHelper.findByAppId([STEAMAPP_ID, GOGAPP_ID])
        .then(game => game.gamePath);
}
`;

const prepareForModdingSimple = `
/**
 *
 * @param {vortex.types.IDiscoveryResult} discovery
 * @returns {Promise<void>}
 */
function prepareForModding(discovery) {
    return fs.ensureDirAsync(path.join(discovery.path, 'BloodstainedRotN', 'Content', 'Paks', '~mods'));
}
`;

const prepareForModdingModManager = `
/**
 *
 * @param {vortex.types.IDiscoveryResult} discovery
 * @param {vortex.types.IExtensionApi} api
 * @returns {Promise<void>}
 */
function prepareForModding(discovery, api) {
    // Path to the main QModManager DLL file.
    const qModPath = path.join(discovery.path, 'BepInEx', 'plugins', 'QModManager', QMM_DLL);
    // Ensure the mods folder exists, then check for QMM.
    return fs.ensureDirWritableAsync(path.join(discovery.path, 'QMods'))
        .then(() => checkForQMM(api, qModPath));
}
`;

const checkForQMM = `
/**
 *
 * @param {vortex.types.IExtensionApi} api
 * @param {string} qModPath
 * @returns {Promise<void>}
 */
function checkForQMM(api, qModPath) {
    return fs.statAsync(qModPath)
        .then(() => undefined)
        .catch(() => {
            api.sendNotification({
                id: 'qmm-missing',
                type: 'warning',
                title: 'QModManager not installed',
                message: 'QMM is required to mod Subnautica.',
                actions: [
                    {
                        title: 'Get QMM',
                        action: () => util.opn(QMM_MODPAGE).catch(() => undefined)
                    }
                ]
            });
            return undefined;
        });
}
`;

const testSupportedContent = `
/** @type {vortex.types.TestSupported} */
function testSupportedContent(files, gameId) {
    // Make sure we're able to support this mod.
    let supported = (gameId === GAME_ID) &&
        (files.find(file => path.extname(file).toLowerCase() === MOD_FILE_EXT) !== undefined);

    return Promise.resolve({
        supported,
        requiredFiles: [],
    });
}
`;

const installContent = `
/** @type {vortex.types.InstallFunc} */
function installContent(files) {
    // The .pak file is expected to always be positioned in the mods directory we're going to disregard anything placed outside the root.
    const modFile = files.find(file => path.extname(file).toLowerCase() === MOD_FILE_EXT);
    const idx = modFile.indexOf(path.basename(modFile));
    const rootPath = path.dirname(modFile);

    // Remove directories and anything that isn't in the rootPath.
    const filtered = files.filter(file =>
    ((file.indexOf(rootPath) !== -1)
        && (!file.endsWith(path.sep))));

    /** @type {vortex.types.IInstruction[]} */
    const instructions = filtered.map(file => {
        return {
            type: 'copy',
            source: file,
            destination: path.join(file.substr(idx)),
        };
    });

    return Promise.resolve({ instructions });
}
`;

const moddingTools = `
/** @type {vortex.types.ITool[]} */
const moddingTools = [
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
`;

export const snippetsJs = {
    tcommonImports: commonImports.trim(),
    tcommonConsts: commonConsts.trim(),
    tregisterGame: registerGame.trim(),
    tregisterInstaller: registerInstaller.trim(),
    tfindGameSteam: findGameSteam.trim(),
    tprepareForModdingSimple: prepareForModdingSimple.trim(),
    tprepareForModdingModManager: prepareForModdingModManager.trim(),
    tcheckForQMM: checkForQMM.trim(),
    ttestSupportedContent: testSupportedContent.trim(),
    tinstallContent: installContent.trim(),
    tmoddingTools: moddingTools.trim(),
};
