import * as path from 'path';
import { GAME } from '../common/constants';

const EXE_DIR = path.dirname(GAME.exePath);
const EXE_NAME = path.basename(GAME.exePath, path.extname(GAME.exePath));
const MOD_LOADER_DIR = path.join('addons', 'mod_loader');
const SCRIPT_ARGUMENT = '--script';
const SETUP_SCRIPT_RES_PATH = 'addons/mod_loader/mod_loader_setup.gd';

/**
 * Godot Mod Loader. Godot looks up its scripts relative to the working
 * directory, which is the store's folder when the store starts the game and
 * the exe's folder when Vortex does, so it is installed into both.
 */
export const GML = {
    name: 'Godot Mod Loader',
    exeDir: EXE_DIR,
    pck: path.join(EXE_DIR, `${EXE_NAME}.pck`),
    installDirs: [...new Set(['.', EXE_DIR])],
    detectionFiles: [
        path.join(MOD_LOADER_DIR, 'mod_loader.gd'),
        path.join(MOD_LOADER_DIR, 'mod_loader_setup.gd'),
        path.join(MOD_LOADER_DIR, 'vendor', 'GDRE', 'gdre_tools.exe'),
    ],
    setupScript: path.join(MOD_LOADER_DIR, 'mod_loader_setup.gd'),
    scriptArgument: SCRIPT_ARGUMENT,
    setupArgs: [SCRIPT_ARGUMENT, SETUP_SCRIPT_RES_PATH],
    steamLaunchOption: `${SCRIPT_ARGUMENT} "${SETUP_SCRIPT_RES_PATH}"`,
    hookPack: path.join(EXE_DIR, 'mod-hooks.zip'),
    /** Releases after v7.0.1 cache the decompiled game scripts here. */
    decompDir: path.join(EXE_DIR, MOD_LOADER_DIR, 'decomp'),
    releasesPage: 'https://github.com/GodotModding/godot-mod-loader/releases',
};

/**
 * The Godot Mod Loader release the extension installs. Its name stays pinned
 * because the newest release can be a Godot 3 build. v7.0.1 supports Godot 4.1
 * to 4.3; if {{gameName}} needs another one from `GML.releasesPage`, change the
 * tag at the end of `apiUrl` and the file name in `assetName`.
 */
export const GML_RELEASE = {
    apiUrl: 'https://api.github.com/repos/GodotModding/godot-mod-loader/releases/tags/v7.0.1',
    assetName: 'ModLoader-Self-Setup_7.0.1-WIN.zip',
    digestPrefix: 'sha256:',
    tempFilePrefix: '{{idPrefix}}-gml-',
};

/**
 * Layout Godot Mod Loader expects in a mod zip: `mods-unpacked/<namespace>-<name>/`
 * holding `mod_main.gd` and `manifest.json`, optionally next to `.godot/`.
 */
export const MOD_LAYOUT = {
    unpackedDir: 'mods-unpacked',
    godotDir: '.godot',
    addonsDir: 'addons',
    mainFile: 'mod_main.gd',
    manifestFile: 'manifest.json',
    zipExtension: '.zip',
    loaderFile: path.join(MOD_LOADER_DIR, 'mod_loader.gd'),
};

/** Folders the unpacked-mods installer creates inside Vortex's extraction folder. */
export const REPACK = {
    workDir: '__{{idPrefix}}_repack__',
    stagingDir: 'staging',
    zipsDir: 'zips',
};

/** 7-Zip switches for mod zips (zip format, UTF-8 entry names) and its success exit code. */
export const SEVEN_ZIP = {
    zipSwitches: ['-tzip', '-mcu=on'],
    successCode: 0,
};

/** Settings for the HTTPS requests to GitHub. */
export const HTTP = {
    userAgent: '{{packageName}}',
    acceptGithubJson: 'application/vnd.github+json',
    okStatus: 200,
    redirectStatuses: [301, 302, 303, 307, 308],
    rateLimitStatuses: [403, 429],
    rateLimitRemainingHeader: 'x-ratelimit-remaining',
    maxRedirects: 5,
    timeoutMs: 30000,
};

/** Installer ids and priorities; Vortex queries lower priorities first. */
export const GML_INSTALLERS = {
    loaderArchive: { id: '{{idPrefix}}-gml-loader', priority: 10 },
    modZips: { id: '{{idPrefix}}-mod-zips', priority: 20 },
    unpackedMods: { id: '{{idPrefix}}-unpacked-mods', priority: 25 },
};

/** Start hook that adds the setup arguments; it runs after Vortex's pre-start deployment (priority 100). */
export const START_HOOK = {
    id: '{{idPrefix}}-gml-setup',
    priority: 200,
};

/** Mods page toolbar action that reinstalls Godot Mod Loader. */
export const REINSTALL_ACTION = {
    group: 'mod-icons',
    position: 300,
    icon: 'refresh',
    title: `Reinstall ${GML.name}`,
};

/** Ids of the notifications about Godot Mod Loader. */
export const GML_NOTIFICATIONS = {
    missing: '{{idPrefix}}-gml-missing',
    installProgress: '{{idPrefix}}-gml-install-progress',
    installed: '{{idPrefix}}-gml-installed',
    cachesNotRemoved: '{{idPrefix}}-gml-caches-not-removed',
};
