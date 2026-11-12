import { spec } from '../fileSpec';
import { loaderSlots, type LoaderProfile } from './loaderProfile';
import { LOADER_ARCHIVE_HELPERS } from './sharedFiles';
import constants from '../files/src/melonloader/constants.ts?text';
import detection from '../files/src/melonloader/detection.ts?text';
import modsInstaller from '../files/src/melonloader/modsInstaller.ts?text';
import packageInstaller from '../files/src/melonloader/packageInstaller.ts?text';
import register from '../files/src/melonloader/register.ts?text';
import setup from '../files/src/melonloader/setup.ts?text';
import readmeSection from '../readme/melonLoader.md?text';

/** The files that stay the same whether or not BepInEx is picked as well */
export const MELON_LOADER_FILES = Object.freeze([
    spec('src/melonloader/constants.ts', constants, { templated: true, restorable: false }),
    spec('src/melonloader/detection.ts', detection),
    spec('src/melonloader/modsInstaller.ts', modsInstaller),
    spec('src/melonloader/packageInstaller.ts', packageInstaller),
]);

export const MELON_LOADER_PROFILE = Object.freeze<LoaderProfile>({
    files: [
        LOADER_ARCHIVE_HELPERS,
        ...MELON_LOADER_FILES,
        spec('src/melonloader/setup.ts', setup),
        spec('src/melonloader/register.ts', register),
    ],
    slots: loaderSlots({ folder: 'melonloader', register: 'registerMelonLoader', prepare: 'prepareMelonLoader' }),
    modsPath: () => '.',
    entryDescription: 'Registers the game and the installers for MelonLoader and its mods.',
    setupDescription: 'Ensures the game folder is writable and warns if MelonLoader is missing.',
    readme: {
        features: [
            '- Installs MelonLoader mods: `.dll` files into `Mods` and `.cfg` files into `UserData`. Files an archive already has in `Mods`, `Plugins`, `UserLibs` or `UserData` stay there.',
            '- Installs MelonLoader itself when you drop its release on the Mods page, and warns when it is missing.',
        ].join('\n'),
        modsNote: '- `src/melonloader/constants.ts` holds MelonLoader\'s folders and files, and `src/melonloader/modsInstaller.ts` decides where a mod\'s files go. Mods are installed relative to the game\'s executable. Check both for {{gameName}}.',
        section: () => readmeSection,
    },
});
