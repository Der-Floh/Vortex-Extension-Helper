import pkg from '../package.json';

export const MANIFEST = pkg;

export const COMMAND_NEW_GAME_EXTENSION = pkg.contributes.commands[0].command;
export const COMMAND_INSTALL_DEPENDENCIES = pkg.contributes.commands[1].command;
export const COMMAND_CREATE_MISSING_FILES = pkg.contributes.commands[2].command;
export const COMMAND_RUN_WORKSPACE_CHECKS = pkg.contributes.commands[3].command;
export const COMMAND_OPEN_DOCUMENTATION = pkg.contributes.commands[4].command;
export const COMMAND_ADD_VORTEX_LIBRARY = pkg.contributes.commands[5].command;

export const CONFIG_SECTION = 'vortexHelper';
export const CONFIG_USE_NEXUS_API = 'useNexusApi';
export const CONFIG_AUTHOR = 'author';
export const CONFIG_ASK_STEAM_APP_ID = 'askSteamAppId';
export const CONFIG_ASK_EXECUTABLE = 'askExecutable';

export const CONTEXT_IS_VORTEX_WORKSPACE = 'vortexHelper.isVortexWorkspace';
export const DIAGNOSTIC_COLLECTION = 'vortexHelper';
export const DIAGNOSTIC_SOURCE = 'Vortex';
/** Not contributed as a task definition, which would activate the extension on every task fetch */
export const TASK_TYPE = 'vortexHelper';
export const PENDING_INSTALL_KEY = 'vortexHelper.pendingInstall';
export const PENDING_INSTALL_MAX_AGE_MS = 15 * 60_000;

export const NEXUS_GAMES_URL = 'https://data.nexusmods.com/file/nexus-data/games.json';
export const NEXUS_FETCH_TIMEOUT_MS = 15_000;
export const DOCUMENTATION_URL = 'https://github.com/Nexus-Mods/Vortex/wiki/MODDINGWIKI-Developers-General-Creating-a-game-extension';

export const PROJECT_VERSION = '1.0.0';
export const PACKAGE_NAME_SUFFIX = '-support';
export const DISPLAY_NAME_PREFIX = 'Game: ';
export const GAMEART_PATH = 'assets/gameart.jpg';
export const GAMEART_EXTENSION = '.jpg';
export const VORTEX_API_SOURCE = 'git+https://github.com/Nexus-Mods/vortex-api.git';
export const PLACEHOLDER_STEAM_APP_ID = 'STEAM_APP_ID';
export const PLACEHOLDER_EXECUTABLE = 'GAME_EXECUTABLE.exe';

/** The versions `resolve-version` of the shared release workflow accepts */
export const VERSION_PATTERN = /^[0-9]+(\.[0-9]+){1,3}(-[0-9A-Za-z.-]+)?$/;
/** A leading letter keeps `<name>-support:///` a valid URL scheme for the source maps */
export const SHORT_NAME_PATTERN = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

export const REVALIDATE_DEBOUNCE_MS = 300;
export const TASK_START_TIMEOUT_MS = 10_000;
