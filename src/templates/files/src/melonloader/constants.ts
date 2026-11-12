import * as path from 'path';
import { GAME } from '../common/constants';

const EXE_DIR = path.dirname(GAME.exePath);

/** Files of MelonLoader's release, relative to the folder it is installed into. */
const PACKAGE_FILES = [
    path.join('MelonLoader', 'net6', 'MelonLoader.dll'),
    path.join('MelonLoader', 'net35', 'MelonLoader.dll'),
    path.join('MelonLoader', 'MelonLoader.dll'),
];

/** MelonLoader, a mod loader for Unity games. Its folders sit next to the game's executable. */
export const MELON_LOADER = {
    name: 'MelonLoader',
    exeDir: EXE_DIR,
    modFile: '.dll',
    userDataFile: '.cfg',
    modDir: 'Mods',
    userDataDir: 'UserData',
    /** Files an archive already has in one of these folders stay in it. */
    contentDirs: ['Mods', 'Plugins', 'UserLibs', 'UserData'],
    packageFiles: PACKAGE_FILES,
    detectionFiles: PACKAGE_FILES.map(file => path.join(EXE_DIR, file)),
    downloadPage: 'https://github.com/LavaGang/MelonLoader/releases/latest',
};

/** Installer ids and priorities; Vortex queries lower priorities first. */
export const MELON_LOADER_INSTALLERS = {
    package: { id: '{{idPrefix}}-melonloader-package', priority: 5 },
    mods: { id: '{{idPrefix}}-melonloader-mods', priority: 30 },
};

/** Ids of the notifications about MelonLoader. */
export const MELON_LOADER_NOTIFICATIONS = {
    missing: '{{idPrefix}}-melonloader-missing',
};
