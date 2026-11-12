import * as path from 'path';
import { GAME } from '../common/constants';

const EXE_DIR = path.dirname(GAME.exePath);
const CORE_DIR = path.join('BepInEx', 'core');
const MONO_FILES = [path.join(CORE_DIR, 'BepInEx.dll'), path.join(CORE_DIR, 'BepInEx.Unity.Mono.dll')];
const IL2CPP_FILES = [path.join(CORE_DIR, 'BepInEx.Unity.IL2CPP.dll')];

/** The game's Unity build: `unitymono` or `unityil2cpp`. */
const UNITY_BUILD: string = '{{bepinexUnityBuildValue}}';
const IS_MONO = UNITY_BUILD === 'unitymono';

/** BepInEx, a mod loader for Unity games. Its folder sits next to the game's executable. */
export const BEPINEX = {
    name: 'BepInEx',
    unityBuild: UNITY_BUILD,
    isMono: IS_MONO,
    /** `x64`, or `x86` for a 32-bit game. */
    architecture: 'x64',
    /** The exe's folder if it isn't the game folder, which Vortex's BepInEx support has to be told. */
    installDir: EXE_DIR === '.' ? undefined : EXE_DIR,
    modFile: '.dll',
    pluginsDir: 'plugins',
    packageFiles: [...MONO_FILES, ...IL2CPP_FILES],
    detectionFiles: (IS_MONO ? MONO_FILES : IL2CPP_FILES).map(file => path.join(EXE_DIR, file)),
    downloadPage: IS_MONO ? 'https://github.com/BepInEx/BepInEx/releases/latest' : 'https://builds.bepinex.dev/projects/bepinex_be',
    /** Start of the download's file name. */
    downloadName: IS_MONO ? 'BepInEx_win_x64' : 'BepInEx-Unity.IL2CPP-win-x64',
};

/** Installer ids and priorities; Vortex queries lower priorities first. */
export const BEPINEX_INSTALLERS = {
    mods: { id: '{{idPrefix}}-bepinex-mods', priority: 20 },
};

/** Ids of the notifications about BepInEx. */
export const BEPINEX_NOTIFICATIONS = {
    missing: '{{idPrefix}}-bepinex-missing',
    /** Sent by Vortex's BepInEx support on every activation of a game registered with it. */
    vortexNotice: `bepis_injector${GAME.id}`,
};
