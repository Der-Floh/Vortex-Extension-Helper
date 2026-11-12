import { CONSTANTS_PATH, ENTRY_PATH, GAMEART_PATH, PACKAGE_JSON_PATH } from '../constants';
import type { GeneratedOutput, ProjectValues, Severity } from '../types/project';
import { spec, type GeneratedFileSpec } from './fileSpec';
import type { LoaderProfile } from './loaders/loaderProfile';
import { PLAIN_PROFILE, profileFor } from './loaders/profiles';
import { buildPackageJson } from './packageJson';
import { placeholderValues, profilePlaceholders, renderTemplate, type TemplateValues } from './render';
import { fillSlots } from './slots';
import readme from './files/README.md?text';
import gameart from './files/assets/gameart.jpg';
import gitignore from './files/gitignore?text';
import rollupConfig from './files/rollup.config.mjs?text';
import inspection from './files/src/archive/inspection.ts?text';
import constants from './files/src/common/constants.ts?text';
import commonFiles from './files/src/common/files.ts?text';
import notifications from './files/src/common/notifications.ts?text';
import discovery from './files/src/detection/discovery.ts?text';
import indexSource from './files/src/index.ts?text';
import instructions from './files/src/installers/instructions.ts?text';
import mods from './files/src/installers/mods.ts?text';
import prepareForModding from './files/src/setup/prepareForModding.ts?text';
import tsconfig from './files/tsconfig.json?text';
import deployToVortex from './files/vscode/build/deploy-to-vortex.mjs?text';
import packageZip from './files/vscode/build/package-zip.mjs?text';
import populatePack from './files/vscode/build/populate-pack.mjs?text';
import startVortex from './files/vscode/build/start-vortex.mjs?text';
import vortexPaths from './files/vscode/build/vortex-paths.mjs?text';
import vscodeLaunch from './files/vscode/launch.json?text';
import vscodeSettings from './files/vscode/settings.json?text';
import vscodeTasks from './files/vscode/tasks.json?text';

export const GENERATED_FILES: readonly GeneratedFileSpec[] = Object.freeze([
    spec('rollup.config.mjs', rollupConfig, { required: 'error' }),
    spec('tsconfig.json', tsconfig, { required: 'error' }),
    spec('.gitignore', gitignore),
    spec('README.md', readme, { templated: true, restorable: false }),
    spec('.vscode/tasks.json', vscodeTasks),
    spec('.vscode/settings.json', vscodeSettings),
    spec('.vscode/launch.json', vscodeLaunch, { templated: true }),
    spec('.vscode/build/populate-pack.mjs', populatePack, { required: 'error' }),
    spec('.vscode/build/package-zip.mjs', packageZip, { required: 'error' }),
    spec('.vscode/build/deploy-to-vortex.mjs', deployToVortex),
    spec('.vscode/build/start-vortex.mjs', startVortex, { templated: true }),
    spec('.vscode/build/vortex-paths.mjs', vortexPaths),
    spec(GAMEART_PATH, gameart),
    spec(ENTRY_PATH, indexSource, { templated: true, required: 'error' }),
    spec(CONSTANTS_PATH, constants, { templated: true, restorable: false }),
    spec('src/common/files.ts', commonFiles),
    spec('src/common/notifications.ts', notifications),
    spec('src/detection/discovery.ts', discovery, { templated: true }),
    spec('src/setup/prepareForModding.ts', prepareForModding, { templated: true }),
    spec('src/installers/instructions.ts', instructions),
    spec('src/installers/mods.ts', mods, { templated: true, plainOnly: true }),
    spec('src/archive/inspection.ts', inspection, { templated: true }),
]);

/**
 * Every file of a new project, package.json first.
 *
 * @throws Error if no profile covers the selected mod loaders.
 */
export function renderProject(values: ProjectValues): readonly GeneratedOutput[] {
    const profile = profileFor(values.modLoaders);
    if (!profile) {
        throw new Error(`No template covers the mod loaders ${values.modLoaders?.join(', ')}.`);
    }
    const placeholders = placeholderValues(values, profile);
    return [
        { path: PACKAGE_JSON_PATH, content: buildPackageJson(values) },
        ...filesOf(profile).map(file => render(file, placeholders, profile)),
    ];
}

/** The files Create Missing Files can write for an existing project */
export function restorableOutputs(values: TemplateValues, profile: LoaderProfile = PLAIN_PROFILE): readonly GeneratedOutput[] {
    const placeholders = { ...values, ...profilePlaceholders(profile) };
    return filesOf(profile).filter(file => file.restorable).map(file => render(file, placeholders, profile));
}

/** The files that are never restored, so Create Missing Files can name them */
export function unrestorablePaths(profile: LoaderProfile = PLAIN_PROFILE): readonly string[] {
    return [PACKAGE_JSON_PATH, ...filesOf(profile).filter(file => !file.restorable).map(file => file.path)];
}

export function requiredFiles(): readonly { path: string; severity: Severity }[] {
    return GENERATED_FILES.flatMap(file => file.required ? [{ path: file.path, severity: file.required }] : []);
}

function filesOf(profile: LoaderProfile): readonly GeneratedFileSpec[] {
    return profile === PLAIN_PROFILE
        ? GENERATED_FILES
        : [...GENERATED_FILES.filter(file => !file.plainOnly), ...profile.files];
}

function render(file: GeneratedFileSpec, values: TemplateValues, profile: LoaderProfile): GeneratedOutput {
    const content = file.templated && typeof file.source === 'string'
        ? renderTemplate(fillSlots(file.source, profile.slots), values)
        : file.source;
    return { path: file.path, content };
}
