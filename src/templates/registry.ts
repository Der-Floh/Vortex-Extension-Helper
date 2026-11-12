import { CONSTANTS_PATH, ENTRY_PATH, GAMEART_PATH, GITIGNORE_PATH, PACKAGE_JSON_PATH } from '../constants';
import type { AddonRecord, GeneratedOutput, ProjectValues, Severity } from '../types/project';
import type { Catalogue } from './addons/addon';
import { composeAddons, PLAIN_COMPOSITION, type Composition } from './addons/composeAddons';
import { DISCOVERED_CATALOGUE } from './addons/discoveredCatalogue';
import { NO_ADDONS, resolveAddons, resolveRecord, type Resolution } from './addons/resolveAddons';
import { spec, type GeneratedFileSpec } from './fileSpec';
import { buildPackageJson } from './packageJson';
import { compositionPlaceholders, placeholderValues, renderTemplate, type TemplateValues } from './render';
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

/** The baseline: the project without add-ons. The add-ons' own files come from their folders, see `discoveredCatalogue.ts` */
export const GENERATED_FILES: readonly GeneratedFileSpec[] = Object.freeze([
    spec('rollup.config.mjs', rollupConfig, { required: 'error' }),
    spec('tsconfig.json', tsconfig, { required: 'error' }),
    spec(GITIGNORE_PATH, gitignore),
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
 * @throws Error if the picked add-ons can't be combined.
 */
export function renderProject(values: ProjectValues, catalogue: Catalogue = DISCOVERED_CATALOGUE): readonly GeneratedOutput[] {
    const composition = compositionOf(resolveAddons({ addons: values.addons ?? [], options: values.addonOptions ?? {} }, catalogue));
    const placeholders = placeholderValues(values, composition);
    return [
        { path: PACKAGE_JSON_PATH, content: buildPackageJson(values, composition.packageJson) },
        ...filesOf(composition).map(file => render(file, placeholders, composition)),
    ];
}

/** What Create Missing Files restores for a project: exactly the add-ons it recorded, or none */
export function restorationOf(record: AddonRecord | undefined, catalogue: Catalogue = DISCOVERED_CATALOGUE): Resolution {
    return record ? resolveRecord(record, catalogue) : { ok: true, resolved: NO_ADDONS };
}

/** The files Create Missing Files can write for an existing project */
export function restorableOutputs(values: TemplateValues, composition: Composition = PLAIN_COMPOSITION): readonly GeneratedOutput[] {
    const placeholders = { ...values, ...compositionPlaceholders(composition, values.gameName) };
    return filesOf(composition).filter(file => file.restorable).map(file => render(file, placeholders, composition));
}

/** The baseline files no add-on changes, which can be restored even when a project's add-ons aren't available */
export function independentOutputs(values: TemplateValues): readonly GeneratedOutput[] {
    return GENERATED_FILES
        .filter(file => file.restorable && !file.plainOnly && !changedByAddons(file))
        .map(file => render(file, values, PLAIN_COMPOSITION));
}

/** The files that are never restored, so Create Missing Files can name them */
export function unrestorablePaths(composition: Composition = PLAIN_COMPOSITION): readonly string[] {
    return [PACKAGE_JSON_PATH, ...filesOf(composition).filter(file => !file.restorable).map(file => file.path)];
}

export function requiredFiles(): readonly { path: string; severity: Severity }[] {
    return GENERATED_FILES.flatMap(file => file.required ? [{ path: file.path, severity: file.required }] : []);
}

/** @throws Error with the resolution's problem */
export function compositionOf(resolution: Resolution): Composition {
    if (!resolution.ok) {
        throw new Error(resolution.problem);
    }
    return composeAddons(resolution.resolved);
}

/** @throws Error if two files would be written to the same path */
function filesOf(composition: Composition): readonly GeneratedFileSpec[] {
    const baseline = composition.keepsPlainInstaller ? GENERATED_FILES : GENERATED_FILES.filter(file => !file.plainOnly);
    const files = [...baseline.map(file => withAddonLines(file, composition)), ...composition.files];
    const paths = [PACKAGE_JSON_PATH, ...files.map(file => file.path)];
    const clash = paths.find((file, index) => paths.indexOf(file) !== index);
    if (clash) {
        throw new Error(`Two files would be written to ${clash}.`);
    }
    return files;
}

function withAddonLines(file: GeneratedFileSpec, composition: Composition): GeneratedFileSpec {
    return file.path === GITIGNORE_PATH && composition.gitignore && typeof file.source === 'string'
        ? Object.freeze({ ...file, source: `${file.source}${composition.gitignore}` })
        : file;
}

/** A slotted file takes the add-ons' code, and `.gitignore` their lines */
function changedByAddons(file: GeneratedFileSpec): boolean {
    return file.path === GITIGNORE_PATH || (typeof file.source === 'string' && file.source.includes('// slot:'));
}

function render(file: GeneratedFileSpec, values: TemplateValues, composition: Composition): GeneratedOutput {
    const content = file.templated && typeof file.source === 'string'
        ? renderTemplate(fillSlots(file.source, composition.slots), values)
        : file.source;
    return { path: file.path, content };
}
