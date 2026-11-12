import { spec } from '../fileSpec';
import { bepInExModsPath, BEPINEX_FILES } from './bepinex';
import { loaderSlots, type LoaderProfile } from './loaderProfile';
import { MELON_LOADER_FILES } from './melonLoader';
import { LOADER_ARCHIVE_HELPERS } from './sharedFiles';
import constants from '../files/src/loaders/constants.ts?text';
import detection from '../files/src/loaders/detection.ts?text';
import register from '../files/src/loaders/register.ts?text';
import routing from '../files/src/loaders/routing.ts?text';
import setup from '../files/src/loaders/setup.ts?text';
import readmeSection from '../readme/combinedLoaders.md?text';

/** MelonLoader and BepInEx in one project: their own files, and `src/loaders/` to route mods between them */
export const COMBINED_LOADERS_PROFILE = Object.freeze<LoaderProfile>({
    files: [
        LOADER_ARCHIVE_HELPERS,
        ...MELON_LOADER_FILES,
        ...BEPINEX_FILES,
        spec('src/loaders/constants.ts', constants, { templated: true, restorable: false }),
        spec('src/loaders/routing.ts', routing),
        spec('src/loaders/detection.ts', detection),
        spec('src/loaders/setup.ts', setup),
        spec('src/loaders/register.ts', register),
    ],
    slots: loaderSlots({ folder: 'loaders', register: 'registerLoaders', prepare: 'prepareLoaders' }),
    modsPath: bepInExModsPath,
    entryDescription: 'Registers the game and the installers for MelonLoader and BepInEx, which route each mod to the right loader.',
    setupDescription: 'Ensures the mods folders exist and are writable, and warns unless exactly one mod loader is installed.',
    readme: {
        features: [
            '- Installs mods for MelonLoader and BepInEx, and works out which loader each mod is for (see [Which loader a mod goes to](#which-loader-a-mod-goes-to)).',
            '- Installs either loader itself when you drop its release on the Mods page, and warns when neither or both are installed.',
        ].join('\n'),
        modsNote: '- `src/loaders/routing.ts` decides which loader a mod goes to. `src/melonloader/` and `src/bepinex/` hold each loader\'s folders, files and installers, and `BEPINEX` in `src/bepinex/constants.ts` holds the game\'s Unity build. Check them for {{gameName}}.',
        section: () => readmeSection,
    },
});
