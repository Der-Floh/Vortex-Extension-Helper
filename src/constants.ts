import pkg from '../package.json';

export const MANIFEST = pkg;

export const COMMAND_NEW_GAME_EXTENSION = pkg.contributes.commands[0].command;
export const COMMAND_INSTALL_DEPENDENCIES = pkg.contributes.commands[1].command;
export const COMMAND_CREATE_MISSING_FILES = pkg.contributes.commands[2].command;
export const COMMAND_RUN_WORKSPACE_CHECKS = pkg.contributes.commands[3].command;
export const COMMAND_OPEN_DOCUMENTATION = pkg.contributes.commands[4].command;
export const COMMAND_ADD_VORTEX_LIBRARY = pkg.contributes.commands[5].command;
export const COMMAND_DEBUG_IN_VORTEX = pkg.contributes.commands[6].command;
export const COMMAND_BUILD = pkg.contributes.commands[7].command;
export const COMMAND_PACKAGE_ZIP = pkg.contributes.commands[8].command;
export const COMMAND_DEPLOY_TO_VORTEX = pkg.contributes.commands[9].command;
export const COMMAND_ATTACH_TO_VORTEX = pkg.contributes.commands[10].command;
export const COMMAND_REMOVE_VORTEX_LIBRARY = pkg.contributes.commands[11].command;
export const COMMAND_INSERT_SNIPPET = pkg.contributes.commands[12].command;
export const COMMAND_OPEN_PLUGINS_FOLDER = pkg.contributes.commands[13].command;
export const COMMAND_OPEN_VORTEX_LOG = pkg.contributes.commands[14].command;
export const COMMAND_REFRESH_SIDEBAR = pkg.contributes.commands[15].command;

export const BUILTIN_SHOW_PROBLEMS = 'workbench.actions.view.problems';
export const BUILTIN_REVEAL_IN_OS = 'revealFileInOS';
export const BUILTIN_OPEN = 'vscode.open';

export const CONFIG_SECTION = 'vortexHelper';
export const CONFIG_USE_NEXUS_API = 'useNexusApi';
export const CONFIG_AUTHOR = 'author';
export const CONFIG_ASK_STEAM_APP_ID = 'askSteamAppId';
export const CONFIG_ASK_EXECUTABLE = 'askExecutable';
export const CONFIG_VORTEX_EXECUTABLE = 'vortexExecutable';
export const CONFIG_VORTEX_PLUGINS_FOLDER = 'vortexPluginsFolder';
export const CONFIG_DEBUG_PORT = 'debugPort';

export const SETTING_AUTHOR = `${CONFIG_SECTION}.${CONFIG_AUTHOR}`;
export const SETTING_VORTEX_EXECUTABLE = `${CONFIG_SECTION}.${CONFIG_VORTEX_EXECUTABLE}`;
export const SETTING_VORTEX_PLUGINS_FOLDER = `${CONFIG_SECTION}.${CONFIG_VORTEX_PLUGINS_FOLDER}`;
export const SETTING_DEBUG_PORT = `${CONFIG_SECTION}.${CONFIG_DEBUG_PORT}`;

export const CONTEXT_IS_VORTEX_WORKSPACE = 'vortexHelper.isVortexWorkspace';
/** Set once every folder has been looked at, so the sidebar's welcome text can't flash before a project is found */
export const CONTEXT_DETECTION_DONE = 'vortexHelper.detectionDone';
export const VIEW_SIDEBAR = pkg.contributes.views.vortexHelper[0].id;

/** The `viewItem` values the sidebar's inline buttons are tied to in package.json */
export const ROW_DEPENDENCIES_MISSING = 'dependenciesMissing';
export const ROW_DEPLOYABLE = 'deployable';
export const ROW_ATTACHABLE = 'attachable';
export const ROW_LIBRARY_AVAILABLE = 'libraryAvailable';
export const ROW_LIBRARY_UNLISTED = 'libraryUnlisted';
export const ROW_LIBRARY_ADDED = 'libraryAdded';
export const ROW_SNIPPET = 'snippet';

export const DIAGNOSTIC_COLLECTION = 'vortexHelper';
export const DIAGNOSTIC_SOURCE = 'Vortex';
/** Not contributed as a task definition, which would activate the extension on every task fetch */
export const TASK_TYPE = 'vortexHelper';
export const PENDING_INSTALL_KEY = 'vortexHelper.pendingInstall';
export const PENDING_INSTALL_MAX_AGE_MS = 15 * 60_000;

export const NEXUS_GAMES_URL = 'https://data.nexusmods.com/file/nexus-data/games.json';
export const NEXUS_FETCH_TIMEOUT_MS = 15_000;
export const DOCUMENTATION_URL = 'https://github.com/Nexus-Mods/Vortex/wiki/MODDINGWIKI-Developers-General-Creating-a-game-extension';
export const PACKAGING_WIKI_URL = 'https://github.com/Nexus-Mods/Vortex/wiki/How-to-package-a-game-extension';
export const NEXUS_SITE_URL = 'https://www.nexusmods.com';

export const PACKAGE_JSON_PATH = 'package.json';
export const PACKAGE_LOCK_PATH = 'package-lock.json';
export const SOURCE_FOLDER = 'src';
export const ENTRY_PATH = 'src/index.ts';
export const CONSTANTS_PATH = 'src/common/constants.ts';
export const GAMEART_PATH = 'assets/gameart.jpg';
/** A root info.json marks the layout from before package.json held the metadata */
export const LEGACY_INFO_JSON = 'info.json';
export const PACK_DIR = '.pack';
export const PACK_INFO = 'info.json';
export const PACK_ENTRY = 'index.js';
export const VORTEX_LOG_FILE = 'vortex.log';

export const PROJECT_VERSION = '1.0.0';
export const PACKAGE_NAME_SUFFIX = '-support';
export const DISPLAY_NAME_PREFIX = 'Game: ';
export const GAMEART_EXTENSION = '.jpg';
export const VORTEX_API_SOURCE = 'git+https://github.com/Nexus-Mods/vortex-api.git';
export const PLACEHOLDER_STEAM_APP_ID = 'STEAM_APP_ID';
export const PLACEHOLDER_EXECUTABLE = 'GAME_EXECUTABLE.exe';

export const MOD_LOADER_GML = 'gml';
export const MOD_LOADER_MELON_LOADER = 'melonloader';
export const MOD_LOADER_BEPINEX = 'bepinex';
/** The names Vortex's BepInEx extension uses for a game's Unity build */
export const BEPINEX_BUILD_MONO = 'unitymono';
export const BEPINEX_BUILD_IL2CPP = 'unityil2cpp';

/** The versions `resolve-version` of the shared release workflow accepts */
export const VERSION_PATTERN = /^[0-9]+(\.[0-9]+){1,3}(-[0-9A-Za-z.-]+)?$/;
/** A leading letter keeps the generated folder a valid URL scheme for the source map prefix */
export const SHORT_NAME_PATTERN = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

export const REVALIDATE_DEBOUNCE_MS = 300;
export const TASK_START_TIMEOUT_MS = 10_000;

/** The contributed default, so the templates and the command can't disagree on the port */
export const DEBUG_PORT_DEFAULT = pkg.contributes.configuration.properties[SETTING_DEBUG_PORT].default;
export const VORTEX_READY_TIMEOUT_MS = 90_000;
export const VORTEX_PROBE_INTERVAL_MS = 250;
export const VORTEX_QUIT_TIMEOUT_MS = 15_000;
export const SIDEBAR_PROBE_INTERVAL_MS = 1_000;
/** So the process list and the project's files are looked at every 5 seconds */
export const SIDEBAR_PROBES_PER_SLOW_TICK = 5;
/** js-debug's Chrome attach, which is how the Vortex renderer is reached */
export const DEBUG_SESSION_TYPE = 'chrome';
export const JS_DEBUG_EXTENSION_ID = 'ms-vscode.js-debug';
