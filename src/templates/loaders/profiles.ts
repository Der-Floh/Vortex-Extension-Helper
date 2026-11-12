import { MOD_LOADER_BEPINEX, MOD_LOADER_GML, MOD_LOADER_MELON_LOADER } from '../../constants';
import type { ModLoaderId } from '../../types/project';
import { BEPINEX_PROFILE } from './bepinex';
import { COMBINED_LOADERS_PROFILE } from './combinedLoaders';
import { GODOT_MOD_LOADER_PROFILE } from './godotModLoader';
import type { LoaderProfile } from './loaderProfile';
import { MELON_LOADER_PROFILE } from './melonLoader';

/** What the wizard shows for each mod loader */
export const MOD_LOADERS: Readonly<Record<ModLoaderId, { readonly label: string; readonly detail: string }>> = Object.freeze({
    [MOD_LOADER_GML]: {
        label: 'Godot Mod Loader',
        detail: 'For Godot 4.1 to 4.3. Installs the loader for the user, keeps mods as zips and runs its setup when Vortex starts the game.',
    },
    [MOD_LOADER_MELON_LOADER]: {
        label: 'MelonLoader',
        detail: 'Installs .dll mods into Mods and warns when the loader is missing.',
    },
    [MOD_LOADER_BEPINEX]: {
        label: 'BepInEx',
        detail: 'Uses Vortex\'s BepInEx support and installs plugins into BepInEx/plugins.',
    },
});

/** The project without a mod loader: mods are plain files copied into a folder */
export const PLAIN_PROFILE = Object.freeze<LoaderProfile>({
    files: [],
    slots: {},
    modsPath: () => 'mods',
    entryDescription: 'Registers the game and the installer for its mods.',
    setupDescription: 'Ensures the mods folder exists and is writable.',
    readme: {
        features: '- Installs mods into the game\'s mods folder.',
        modsNote: '- `GAME.modsPath` and `MOD_FILES.extensions` in `src/common/constants.ts` decide where mods are installed and which files count as mods. Check both for {{gameName}}.',
        section: () => '',
    },
});

const PROFILES: ReadonlyMap<string, LoaderProfile> = new Map([
    [selectionKey([]), PLAIN_PROFILE],
    [selectionKey([MOD_LOADER_GML]), GODOT_MOD_LOADER_PROFILE],
    [selectionKey([MOD_LOADER_MELON_LOADER]), MELON_LOADER_PROFILE],
    [selectionKey([MOD_LOADER_BEPINEX]), BEPINEX_PROFILE],
    [selectionKey([MOD_LOADER_MELON_LOADER, MOD_LOADER_BEPINEX]), COMBINED_LOADERS_PROFILE],
]);

/** @returns What a selection of mod loaders generates, or undefined if no profile covers that selection */
export function profileFor(modLoaders: readonly string[] = []): LoaderProfile | undefined {
    return PROFILES.get(selectionKey(modLoaders));
}

function selectionKey(modLoaders: readonly string[]): string {
    return [...modLoaders].sort().join('+');
}
