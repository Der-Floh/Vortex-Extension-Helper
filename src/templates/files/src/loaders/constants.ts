/**
 * Files a mod author can add to an archive to say which loader it is for.
 * Only a mod's own files are installed, so these are never deployed.
 */
export const MARKERS = {
    melonLoader: '_melonloader',
    bepInEx: '_bepinex',
};

/**
 * Deploys to the game folder. MelonLoader's files need it, because Vortex's
 * BepInEx support would otherwise claim every `.dll`. It never matches by
 * itself, so its priority only has to come after the BepInEx types.
 */
export const GAME_ROOT_MOD_TYPE = {
    id: '{{idPrefix}}-root',
    name: 'Game Root',
    priority: 100,
};

/** The mod type Vortex's BepInEx support gives BepInEx itself. */
export const BEPINEX_INJECTOR_MOD_TYPE = 'bepinex-injector';

/** Mod attribute marking MelonLoader's own release once it is installed through Vortex. */
export const MELON_LOADER_PACKAGE_ATTRIBUTE = 'melonLoaderPackage';

/** Ids of the notifications about the installed loaders. */
export const LOADER_NOTIFICATIONS = {
    noLoader: '{{idPrefix}}-no-mod-loader',
    bothLoaders: '{{idPrefix}}-both-mod-loaders',
};
