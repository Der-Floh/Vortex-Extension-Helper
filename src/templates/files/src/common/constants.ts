/**
 * {{gameName}} as registered with Vortex. Every `...Path` is relative to the
 * folder `findGame` returns, which is the store's install folder. Some games sit
 * in a subfolder of it, and then each path needs that subfolder in front, for
 * example `Game/Game.exe`.
 *
 * `requiredFilePaths` is how Vortex verifies the folder: when one of them is
 * missing the game counts as not discovered and never appears in Vortex, with
 * nothing reported anywhere. It is the first thing to check if the game doesn't
 * show up after installing the extension.
 *
 * `modsPath` is where mods are installed. Change it to the folder the game loads
 * mods from.
 */
export const GAME = {
    id: '{{gameIdValue}}',
    name: '{{gameNameValue}}',
    logo: 'gameart.jpg',
    steamAppId: '{{steamAppIdValue}}',
    exePath: '{{exePathValue}}',
    modsPath: '{{modsPathValue}}',
    requiredFilePaths: [
        '{{exePathValue}}',
    ],
};

// slot:constants-plain-installer
/**
 * Files an archive must contain to be installed as a {{gameName}} mod. Change
 * `extensions` to the file types the game loads as mods.
 */
export const MOD_FILES = {
    extensions: ['.pak'],
};

/** Installer ids and priorities; Vortex queries lower priorities first. */
export const INSTALLERS = {
    mods: { id: '{{idPrefix}}-mods', priority: 25 },
};

// endslot
/** Ids of the notifications this extension sends or dismisses. */
export const NOTIFICATION_IDS = {
    directoryNotWritable: '{{idPrefix}}-writable-warning',
};
