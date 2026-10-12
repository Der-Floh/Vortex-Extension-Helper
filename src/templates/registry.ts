import { GAMEART_PATH } from '../constants';
import type { GeneratedOutput, ProjectLanguage, ProjectValues, Severity } from '../types/project';
import { buildPackageJson } from './packageJson';
import { placeholderValues, renderTemplate, type TemplateValues } from './render';
import gameart from './files/common/assets/gameart.jpg';
import gitignore from './files/common/gitignore.tmpl';
import packageZip from './files/common/vscode/build/package-zip.mjs.tmpl';
import populatePack from './files/common/vscode/build/populate-pack.mjs.tmpl';
import vscodeSettings from './files/common/vscode/settings.json.tmpl';
import vscodeTasks from './files/common/vscode/tasks.json.tmpl';
import jsReadme from './files/js/README.md.tmpl';
import jsconfig from './files/js/jsconfig.json.tmpl';
import jsRollupConfig from './files/js/rollup.config.mjs.tmpl';
import jsInspection from './files/js/src/archive/inspection.js.tmpl';
import jsConstants from './files/js/src/common/constants.js.tmpl';
import jsFiles from './files/js/src/common/files.js.tmpl';
import jsNotifications from './files/js/src/common/notifications.js.tmpl';
import jsDiscovery from './files/js/src/detection/discovery.js.tmpl';
import jsIndex from './files/js/src/index.js.tmpl';
import jsInstructions from './files/js/src/installers/instructions.js.tmpl';
import jsMods from './files/js/src/installers/mods.js.tmpl';
import jsPrepareForModding from './files/js/src/setup/prepareForModding.js.tmpl';
import tsReadme from './files/ts/README.md.tmpl';
import tsRollupConfig from './files/ts/rollup.config.mjs.tmpl';
import tsInspection from './files/ts/src/archive/inspection.ts.tmpl';
import tsConstants from './files/ts/src/common/constants.ts.tmpl';
import tsFiles from './files/ts/src/common/files.ts.tmpl';
import tsNotifications from './files/ts/src/common/notifications.ts.tmpl';
import tsDiscovery from './files/ts/src/detection/discovery.ts.tmpl';
import tsIndex from './files/ts/src/index.ts.tmpl';
import tsInstructions from './files/ts/src/installers/instructions.ts.tmpl';
import tsMods from './files/ts/src/installers/mods.ts.tmpl';
import tsPrepareForModding from './files/ts/src/setup/prepareForModding.ts.tmpl';
import tsconfig from './files/ts/tsconfig.json.tmpl';

export const PACKAGE_JSON_PATH = 'package.json';
export const CONSTANTS_MODULE = 'src/common/constants';

const SOURCE_EXTENSIONS: Readonly<Record<ProjectLanguage, string>> = { typescript: '.ts', javascript: '.js' };

export interface GeneratedFileSpec {
    readonly path: string;
    readonly language?: ProjectLanguage;
    readonly source: string | Uint8Array;
    /** Contains `{{key}}` placeholders; other files are written byte for byte */
    readonly templated: boolean;
    /** Create Missing Files may write it; needs no values beyond `restoreValues` */
    readonly restorable: boolean;
    /** Severity reported when the file is missing */
    readonly required?: Severity;
}

type SpecOptions = Partial<Pick<GeneratedFileSpec, 'language' | 'templated' | 'restorable' | 'required'>>;

function spec(path: string, source: string | Uint8Array, options: SpecOptions = {}): GeneratedFileSpec {
    return Object.freeze({ path, source, templated: false, restorable: true, ...options });
}

const TS: SpecOptions = { language: 'typescript' };
const JS: SpecOptions = { language: 'javascript' };

export const GENERATED_FILES: readonly GeneratedFileSpec[] = Object.freeze([
    spec('rollup.config.mjs', tsRollupConfig, { ...TS, required: 'error' }),
    spec('rollup.config.mjs', jsRollupConfig, { ...JS, required: 'error' }),
    spec('tsconfig.json', tsconfig, { ...TS, required: 'error' }),
    spec('jsconfig.json', jsconfig, { ...JS, required: 'warning' }),
    spec('.gitignore', gitignore),
    spec('README.md', tsReadme, { ...TS, templated: true, restorable: false }),
    spec('README.md', jsReadme, { ...JS, templated: true, restorable: false }),
    spec('.vscode/tasks.json', vscodeTasks),
    spec('.vscode/settings.json', vscodeSettings),
    spec('.vscode/build/populate-pack.mjs', populatePack, { required: 'error' }),
    spec('.vscode/build/package-zip.mjs', packageZip, { required: 'error' }),
    spec(GAMEART_PATH, gameart),
    spec('src/index.ts', tsIndex, { ...TS, templated: true, required: 'error' }),
    spec('src/index.js', jsIndex, { ...JS, templated: true, required: 'error' }),
    spec('src/common/constants.ts', tsConstants, { ...TS, templated: true, restorable: false }),
    spec('src/common/constants.js', jsConstants, { ...JS, templated: true, restorable: false }),
    spec('src/common/files.ts', tsFiles, TS),
    spec('src/common/files.js', jsFiles, JS),
    spec('src/common/notifications.ts', tsNotifications, TS),
    spec('src/common/notifications.js', jsNotifications, JS),
    spec('src/detection/discovery.ts', tsDiscovery, { ...TS, templated: true }),
    spec('src/detection/discovery.js', jsDiscovery, { ...JS, templated: true }),
    spec('src/setup/prepareForModding.ts', tsPrepareForModding, TS),
    spec('src/setup/prepareForModding.js', jsPrepareForModding, JS),
    spec('src/installers/instructions.ts', tsInstructions, TS),
    spec('src/installers/instructions.js', jsInstructions, JS),
    spec('src/installers/mods.ts', tsMods, { ...TS, templated: true }),
    spec('src/installers/mods.js', jsMods, { ...JS, templated: true }),
    spec('src/archive/inspection.ts', tsInspection, TS),
    spec('src/archive/inspection.js', jsInspection, JS),
]);

export function filesFor(language: ProjectLanguage): readonly GeneratedFileSpec[] {
    return GENERATED_FILES.filter(file => file.language === undefined || file.language === language);
}

/** Every file of a new project, package.json first */
export function renderProject(values: ProjectValues): readonly GeneratedOutput[] {
    const placeholders = placeholderValues(values);
    return [
        { path: PACKAGE_JSON_PATH, content: buildPackageJson(values) },
        ...filesFor(values.language).map(file => render(file, placeholders)),
    ];
}

/** The files Create Missing Files can write for an existing project */
export function restorableOutputs(language: ProjectLanguage, values: TemplateValues): readonly GeneratedOutput[] {
    return filesFor(language)
        .filter(file => file.restorable)
        .map(file => render(file, values));
}

/** The files that are never restored, so Create Missing Files can name them */
export function unrestorablePaths(language: ProjectLanguage): readonly string[] {
    return [PACKAGE_JSON_PATH, ...filesFor(language).filter(file => !file.restorable).map(file => file.path)];
}

export function requiredFiles(language: ProjectLanguage): readonly { path: string; severity: Severity }[] {
    return filesFor(language).flatMap(file => file.required ? [{ path: file.path, severity: file.required }] : []);
}

/** The path of a source module in the project's language, such as `src/common/constants.ts` */
export function sourcePath(language: ProjectLanguage, modulePath: string): string {
    return `${modulePath}${SOURCE_EXTENSIONS[language]}`;
}

function render(file: GeneratedFileSpec, values: TemplateValues): GeneratedOutput {
    const content = file.templated && typeof file.source === 'string' ? renderTemplate(file.source, values) : file.source;
    return { path: file.path, content };
}
