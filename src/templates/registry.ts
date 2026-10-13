import { GAMEART_PATH } from '../constants';
import type { GeneratedOutput, ProjectValues, Severity } from '../types/project';
import { buildPackageJson } from './packageJson';
import { placeholderValues, renderTemplate, type TemplateValues } from './render';
import readme from './files/README.md.tmpl';
import gameart from './files/assets/gameart.jpg';
import gitignore from './files/gitignore.tmpl';
import rollupConfig from './files/rollup.config.mjs.tmpl';
import inspection from './files/src/archive/inspection.ts.tmpl';
import constants from './files/src/common/constants.ts.tmpl';
import commonFiles from './files/src/common/files.ts.tmpl';
import notifications from './files/src/common/notifications.ts.tmpl';
import discovery from './files/src/detection/discovery.ts.tmpl';
import indexSource from './files/src/index.ts.tmpl';
import instructions from './files/src/installers/instructions.ts.tmpl';
import mods from './files/src/installers/mods.ts.tmpl';
import prepareForModding from './files/src/setup/prepareForModding.ts.tmpl';
import tsconfig from './files/tsconfig.json.tmpl';
import packageZip from './files/vscode/build/package-zip.mjs.tmpl';
import populatePack from './files/vscode/build/populate-pack.mjs.tmpl';
import vscodeSettings from './files/vscode/settings.json.tmpl';
import vscodeTasks from './files/vscode/tasks.json.tmpl';

export const PACKAGE_JSON_PATH = 'package.json';
export const CONSTANTS_PATH = 'src/common/constants.ts';

export interface GeneratedFileSpec {
    readonly path: string;
    readonly source: string | Uint8Array;
    /** Contains `{{key}}` placeholders; other files are written byte for byte */
    readonly templated: boolean;
    /** Create Missing Files may write it; needs no values beyond `restoreValues` */
    readonly restorable: boolean;
    /** Severity reported when the file is missing */
    readonly required?: Severity;
}

type SpecOptions = Partial<Pick<GeneratedFileSpec, 'templated' | 'restorable' | 'required'>>;

function spec(path: string, source: string | Uint8Array, options: SpecOptions = {}): GeneratedFileSpec {
    return Object.freeze({ path, source, templated: false, restorable: true, ...options });
}

export const GENERATED_FILES: readonly GeneratedFileSpec[] = Object.freeze([
    spec('rollup.config.mjs', rollupConfig, { required: 'error' }),
    spec('tsconfig.json', tsconfig, { required: 'error' }),
    spec('.gitignore', gitignore),
    spec('README.md', readme, { templated: true, restorable: false }),
    spec('.vscode/tasks.json', vscodeTasks),
    spec('.vscode/settings.json', vscodeSettings),
    spec('.vscode/build/populate-pack.mjs', populatePack, { required: 'error' }),
    spec('.vscode/build/package-zip.mjs', packageZip, { required: 'error' }),
    spec(GAMEART_PATH, gameart),
    spec('src/index.ts', indexSource, { templated: true, required: 'error' }),
    spec(CONSTANTS_PATH, constants, { templated: true, restorable: false }),
    spec('src/common/files.ts', commonFiles),
    spec('src/common/notifications.ts', notifications),
    spec('src/detection/discovery.ts', discovery, { templated: true }),
    spec('src/setup/prepareForModding.ts', prepareForModding),
    spec('src/installers/instructions.ts', instructions),
    spec('src/installers/mods.ts', mods, { templated: true }),
    spec('src/archive/inspection.ts', inspection),
]);

/** Every file of a new project, package.json first */
export function renderProject(values: ProjectValues): readonly GeneratedOutput[] {
    const placeholders = placeholderValues(values);
    return [
        { path: PACKAGE_JSON_PATH, content: buildPackageJson(values) },
        ...GENERATED_FILES.map(file => render(file, placeholders)),
    ];
}

/** The files Create Missing Files can write for an existing project */
export function restorableOutputs(values: TemplateValues): readonly GeneratedOutput[] {
    return GENERATED_FILES.filter(file => file.restorable).map(file => render(file, values));
}

/** The files that are never restored, so Create Missing Files can name them */
export function unrestorablePaths(): readonly string[] {
    return [PACKAGE_JSON_PATH, ...GENERATED_FILES.filter(file => !file.restorable).map(file => file.path)];
}

export function requiredFiles(): readonly { path: string; severity: Severity }[] {
    return GENERATED_FILES.flatMap(file => file.required ? [{ path: file.path, severity: file.required }] : []);
}

function render(file: GeneratedFileSpec, values: TemplateValues): GeneratedOutput {
    const content = file.templated && typeof file.source === 'string' ? renderTemplate(file.source, values) : file.source;
    return { path: file.path, content };
}
