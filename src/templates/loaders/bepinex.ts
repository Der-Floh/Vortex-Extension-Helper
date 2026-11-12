import { BEPINEX_BUILD_IL2CPP } from '../../constants';
import { spec } from '../fileSpec';
import { loaderSlots, nextToExecutable, type LoaderProfile } from './loaderProfile';
import { LOADER_ARCHIVE_HELPERS } from './sharedFiles';
import constants from '../files/src/bepinex/constants.ts?text';
import detection from '../files/src/bepinex/detection.ts?text';
import modsInstaller from '../files/src/bepinex/modsInstaller.ts?text';
import register from '../files/src/bepinex/register.ts?text';
import setup from '../files/src/bepinex/setup.ts?text';
import vortexSupport from '../files/src/bepinex/vortexSupport.ts?text';
import il2cppSection from '../readme/bepinexIl2cpp.md?text';
import monoSection from '../readme/bepinexMono.md?text';

const PLUGINS_FOLDER = 'BepInEx/plugins';

/** Where BepInEx plugins go, which also suits Vortex's own BepInEx mod types */
export function bepInExModsPath(executable: string): string {
    return nextToExecutable(executable, PLUGINS_FOLDER);
}

/** The files that stay the same whether or not MelonLoader is picked as well */
export const BEPINEX_FILES = Object.freeze([
    spec('src/bepinex/constants.ts', constants, { templated: true, restorable: false }),
    spec('src/bepinex/detection.ts', detection),
    spec('src/bepinex/modsInstaller.ts', modsInstaller),
    spec('src/bepinex/vortexSupport.ts', vortexSupport),
]);

export const BEPINEX_PROFILE = Object.freeze<LoaderProfile>({
    files: [
        LOADER_ARCHIVE_HELPERS,
        ...BEPINEX_FILES,
        spec('src/bepinex/setup.ts', setup),
        spec('src/bepinex/register.ts', register),
    ],
    slots: loaderSlots({ folder: 'bepinex', register: 'registerBepInEx', prepare: 'prepareBepInEx' }),
    modsPath: bepInExModsPath,
    entryDescription: 'Registers the game, the installer for BepInEx plugins and the game\'s BepInEx support in Vortex.',
    setupDescription: 'Ensures the plugins folder exists and is writable, and warns if BepInEx is missing and Vortex can\'t download it.',
    readme: {
        features: [
            '- Installs BepInEx plugins into `BepInEx/plugins`. A plugin that is already inside a `plugins` folder keeps its subfolders; from any other archive only the `.dll` files are installed.',
            '- Registers the game with Vortex\'s BepInEx support, which installs BepInEx itself as a mod.',
        ].join('\n'),
        modsNote: '- `BEPINEX` in `src/bepinex/constants.ts` holds the game\'s Unity build (`unityBuild`) and `architecture`, and `GAME.modsPath` is BepInEx\'s plugins folder. Check them for {{gameName}}.',
        section: values => values.bepInExBuild === BEPINEX_BUILD_IL2CPP ? il2cppSection : monoSection,
    },
});
