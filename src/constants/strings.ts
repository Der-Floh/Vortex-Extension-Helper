export namespace EXTENSION {
    export const NAME = 'Vortex Helper';
    export const ID = 'vortexHelper';
}

export namespace CONFIGS {
    export const CONFIG_USE_NEXUS_API = `${EXTENSION.ID}.useNexusApi`;
}

export namespace COMMANDS {
    export const NEW_GAME_SUPPORT = `${EXTENSION.ID}.newGameSupportExtension`;
    export const SETUP_VORTEX_API = `${EXTENSION.ID}.setupVortexApi`;
    export const SCAFFOLD_GAME_EXTENSION = `${EXTENSION.ID}.scaffoldGameExtension`;
    export const RUN_WORKSPACE_CHECKS = `${EXTENSION.ID}.runWorkspaceChecks`;
    export const OPEN_DOCUMENTATION = `${EXTENSION.ID}.openDocumentation`;
}

export namespace GLOBAL_STATE {
    export const PENDING_SCAFFOLD = `${EXTENSION.ID}.pendingScaffoldState`;
}

export namespace NEXUS_API {
    export const APP_ID = 'vortex_extension_helper';
    export const APP_NAME = 'Vortex Helper';
    export const APP_VERSION = '0.0.1';
    export const DEFAULT_GAME = '';
    export const API_KEY = 'hidden';
    export const API_KEY_SECRET = `${EXTENSION.ID}.nexusApiKey`;
    export const SSO_URL = 'wss://sso.nexusmods.com';
    export const SSO_BROWSER_URL = 'https://www.nexusmods.com/sso';
}

export namespace MISCELLANEOUS {
    export const NEXUS_DOCS_URL = 'https://github.com/Nexus-Mods/Vortex/wiki/MODDINGWIKI-Developers-General-Creating-a-game-extension';
}
