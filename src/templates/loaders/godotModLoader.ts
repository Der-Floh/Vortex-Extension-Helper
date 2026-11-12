import { spec } from '../fileSpec';
import { loaderSlots, nextToExecutable, type LoaderProfile } from './loaderProfile';
import archive from '../files/src/gml/archive.ts?text';
import caches from '../files/src/gml/caches.ts?text';
import constants from '../files/src/gml/constants.ts?text';
import deployment from '../files/src/gml/deployment.ts?text';
import detection from '../files/src/gml/detection.ts?text';
import gameLaunch from '../files/src/gml/gameLaunch.ts?text';
import http from '../files/src/gml/http.ts?text';
import install from '../files/src/gml/install.ts?text';
import loaderArchiveInstaller from '../files/src/gml/loaderArchiveInstaller.ts?text';
import modZipsInstaller from '../files/src/gml/modZipsInstaller.ts?text';
import register from '../files/src/gml/register.ts?text';
import release from '../files/src/gml/release.ts?text';
import setup from '../files/src/gml/setup.ts?text';
import sevenZip from '../files/src/gml/sevenZip.ts?text';
import unpackedModsInstaller from '../files/src/gml/unpackedModsInstaller.ts?text';
import readmeSection from '../readme/godotModLoader.md?text';

export const GODOT_MOD_LOADER_PROFILE = Object.freeze<LoaderProfile>({
    files: [
        spec('src/gml/constants.ts', constants, { templated: true, restorable: false }),
        spec('src/gml/http.ts', http),
        spec('src/gml/sevenZip.ts', sevenZip),
        spec('src/gml/archive.ts', archive),
        spec('src/gml/detection.ts', detection),
        spec('src/gml/release.ts', release),
        spec('src/gml/install.ts', install),
        spec('src/gml/caches.ts', caches),
        spec('src/gml/deployment.ts', deployment),
        spec('src/gml/gameLaunch.ts', gameLaunch),
        spec('src/gml/loaderArchiveInstaller.ts', loaderArchiveInstaller),
        spec('src/gml/modZipsInstaller.ts', modZipsInstaller),
        spec('src/gml/unpackedModsInstaller.ts', unpackedModsInstaller),
        spec('src/gml/setup.ts', setup),
        spec('src/gml/register.ts', register),
    ],
    slots: loaderSlots({ folder: 'gml', register: 'registerGodotModLoader', prepare: 'prepareGodotModLoader' }),
    modsPath: executable => nextToExecutable(executable, 'mods'),
    entryDescription: 'Registers the game, the installers for Godot Mod Loader mods, a start hook that runs the loader\'s setup, a Mods page action to reinstall the loader, and handlers that clear its caches.',
    setupDescription: 'Ensures the mods folder exists and is writable, removes outdated Godot Mod Loader caches and warns if the loader is missing.',
    readme: {
        features: [
            '- Installs Godot Mod Loader for you: it downloads the release set in `src/gml/constants.ts`, checks it against the SHA-256 GitHub publishes, and copies its `addons` folder next to the game\'s executable.',
            '- Installs mods the way Godot Mod Loader loads them: as zips in the `mods` folder. Extracted mods are zipped again as `<namespace>-<name>.zip`, and archives that hold mod zips install those zips unchanged.',
            '- Starts the game with Godot Mod Loader\'s setup when you start it from Vortex, so mods keep working after game updates.',
            '- Deletes the loader\'s caches after every deployment, after purging and after game updates, so it rebuilds them for your current mods and game version.',
        ].join('\n'),
        modsNote: '- `GML_RELEASE` in `src/gml/constants.ts` is the Godot Mod Loader release the extension installs. v7.0.1 supports Godot 4.1 to 4.3, so check the [releases](https://github.com/GodotModding/godot-mod-loader/releases) if {{gameName}} uses another version.',
        section: () => readmeSection,
    },
});
