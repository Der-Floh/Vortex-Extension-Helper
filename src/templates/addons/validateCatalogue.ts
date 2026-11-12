import * as path from 'path';
import { SOURCE_FOLDER, VORTEX_LIBRARIES } from '../../constants';
import { isRecord } from '../../utils/jsonUtils';
import { BASELINE_DEV_DEPENDENCIES, BASELINE_SCRIPTS } from '../packageJson';
import { BASE_PLACEHOLDER_KEYS } from '../render';
import { BASELINE_GAME_FIELDS, HOOK_MODULES, hookFunction, type AddonHooks, type AddonManifest } from './addon';

/** What `esbuild.addons.mjs` found, before anything is known to be valid */
export interface CatalogueInput {
    readonly engines: unknown;
    readonly categories: unknown;
    readonly addons: readonly RawAddon[];
    /** The baseline's own folders below `src`, which an add-on can't take */
    readonly reservedFolders: readonly string[];
    /** Every path the baseline project writes, package.json included, which `projectFiles` can't take */
    readonly baselineFiles: readonly string[];
}

export interface RawAddon {
    readonly folder: string;
    readonly manifest: unknown;
    readonly files: readonly { readonly path: string; readonly text?: string }[];
}

export interface CatalogueProblem {
    /** The add-on folder the problem is in; none for the catalogue's own files */
    readonly folder?: string;
    readonly message: string;
}

interface Known {
    readonly engines: ReadonlySet<string>;
    readonly categories: ReadonlySet<string>;
    readonly reserved: ReadonlySet<string>;
    readonly baselineFiles: ReadonlySet<string>;
}

interface CheckedAddon {
    readonly manifest: AddonManifest;
    readonly files: RawAddon['files'];
}

/** Every field an addon.json may have */
export const MANIFEST_FIELDS: ReadonlySet<string> = new Set([
    '$schema', 'id', 'version', 'name', 'description', 'category', 'engines', 'hidden', 'dependsOn', 'conflicts', 'when',
    'supersedes', 'replacesPlainInstaller', 'modsPath', 'hooks', 'options', 'readme', 'projectFiles', 'packageJson',
    'vortexLibraries', 'gitignore',
]);
const ID_LISTS = ['dependsOn', 'conflicts', 'when', 'supersedes'] as const;
const PACKAGE_JSON_FIELDS = ['devDependencies', 'scripts'] as const;
const PACKAGE_JSON_BASELINE: Readonly<Record<typeof PACKAGE_JSON_FIELDS[number], Readonly<Record<string, string>>>> = {
    devDependencies: BASELINE_DEV_DEPENDENCIES,
    scripts: BASELINE_SCRIPTS,
};
const ADDON_ID = /^[a-z][a-zA-Z0-9]*$/;
const ENTRY_ID = /^[a-z][a-zA-Z0-9]*$/;
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const PLACEHOLDER_NAME = /^[A-Za-z]+$/;
const CHOICE_VALUE = /^[A-Za-z0-9_.-]+$/;
const IMPORT_SPECIFIER = /(?:from\s+|import\s*\(\s*)(['"])([^'"]+)\1/g;
const TYPESCRIPT_FILE = /\.[cm]?tsx?$/;
const MODS_PATH_BASES = ['game', 'executable'];
const LIBRARY_NAMES = VORTEX_LIBRARIES.map(library => library.name);

/** Everything that can be wrong with the add-on folders, so a build or a test can refuse them */
export function validateCatalogue(input: CatalogueInput): CatalogueProblem[] {
    const engines = checkEntries(input.engines, 'catalogue/engines.json', ['id', 'label', 'examples']);
    const categories = checkEntries(input.categories, 'catalogue/categories.json', ['id', 'label', 'description']);
    const known: Known = {
        engines: engines.ids,
        categories: categories.ids,
        reserved: new Set(input.reservedFolders),
        baselineFiles: new Set(input.baselineFiles),
    };
    const problems: CatalogueProblem[] = [...engines.problems, ...categories.problems].map(message => ({ message }));

    const checked = new Map<string, CheckedAddon>();
    for (const addon of input.addons) {
        const found = checkManifest(addon, known);
        problems.push(...found.problems.map(message => ({ folder: addon.folder, message })));
        if (found.manifest) {
            checked.set(found.manifest.id, { manifest: found.manifest, files: addon.files });
        }
    }
    return [...problems, ...checkAcrossAddons(checked)];
}

function checkEntries(value: unknown, file: string, fields: readonly string[]): { ids: Set<string>; problems: string[] } {
    if (!Array.isArray(value)) {
        return { ids: new Set(), problems: [`${file} must hold a list.`] };
    }
    const ids = new Set<string>();
    const problems: string[] = [];
    for (const entry of value) {
        const id = isRecord(entry) ? entry.id : undefined;
        if (!isRecord(entry) || typeof id !== 'string' || !ENTRY_ID.test(id) || !fields.every(field => typeof entry[field] === 'string')) {
            problems.push(`Every entry of ${file} needs ${listOf(fields)} as text, with an id of letters and digits: ${JSON.stringify(entry)}`);
            continue;
        }
        if (ids.has(id)) {
            problems.push(`${file} lists ${id} twice.`);
        }
        ids.add(id);
    }
    return { ids, problems };
}

function checkManifest(addon: RawAddon, known: Known): { problems: string[]; manifest?: AddonManifest } {
    const manifest = addon.manifest;
    if (!isRecord(manifest)) {
        return { problems: ['addon.json must hold an object.'] };
    }
    const problems = [
        ...Object.keys(manifest).filter(key => !MANIFEST_FIELDS.has(key)).map(key => `addon.json has an unknown field "${key}".`),
        ...checkIdentity(manifest, addon.folder, known),
        ...checkLists(manifest, known),
        ...checkModsPath(manifest.modsPath),
        ...checkHooks(manifest.hooks, addon.files),
        ...checkOptions(manifest.options, manifest.hidden === true),
        ...checkReadme(manifest.readme),
        ...checkProjectFiles(manifest.projectFiles, addon.files, known),
        ...checkPackageJson(manifest.packageJson),
        ...checkVortexLibraries(manifest.vortexLibraries),
        ...checkGitignore(manifest.gitignore),
    ];
    return { problems, manifest: problems.length === 0 ? manifest as unknown as AddonManifest : undefined };
}

function checkIdentity(manifest: Record<string, unknown>, folder: string, known: Known): string[] {
    const { id, version, category } = manifest;
    return [
        ...typeof id === 'string' && ADDON_ID.test(id) ? [] : ['"id" must start with a lower-case letter and hold only letters and digits.'],
        ...id === folder ? [] : [`"id" must be the folder's name, ${folder}.`],
        ...known.reserved.has(folder) ? [`${folder} is a folder of the baseline project and can't be an add-on.`] : [],
        ...typeof version === 'string' && SEMVER.test(version) ? [] : ['"version" must be a version like 1.0.0.'],
        ...['name', 'description'].flatMap(field => isLine(manifest[field]) ? [] : [`"${field}" must be text on one line.`]),
        ...typeof category === 'string' && known.categories.has(category) ? [] : [`"category" must be one of ${listOf([...known.categories])}.`],
        ...['hidden', 'replacesPlainInstaller'].flatMap(field => manifest[field] === undefined || typeof manifest[field] === 'boolean' ? [] : [`"${field}" must be true or false.`]),
    ];
}

function checkLists(manifest: Record<string, unknown>, known: Known): string[] {
    const engines = manifest.engines;
    const engineProblems = engines === undefined || (isTextList(engines) && engines.length > 0 && engines.every(engine => known.engines.has(engine)))
        ? []
        : [`"engines" must list some of ${listOf([...known.engines])}.`];
    const idProblems = ID_LISTS.flatMap(field => {
        const value = manifest[field];
        if (value === undefined) {
            return [];
        }
        if (!isTextList(value) || value.length === 0) {
            return [`"${field}" must list add-on ids.`];
        }
        return value.includes(manifest.id as string) ? [`"${field}" can't name the add-on itself.`] : [];
    });
    return [...engineProblems, ...idProblems];
}

function checkModsPath(modsPath: unknown): string[] {
    if (modsPath === undefined) {
        return [];
    }
    const valid = isRecord(modsPath)
        && typeof modsPath.base === 'string' && MODS_PATH_BASES.includes(modsPath.base)
        && isText(modsPath.path) && isRelativeFolder(modsPath.path)
        && Object.keys(modsPath).every(key => key === 'base' || key === 'path');
    return valid ? [] : [`"modsPath" must be { "base": ${listOf(MODS_PATH_BASES.map(base => `"${base}"`))}, "path": a relative folder with / }.`];
}

function checkHooks(hooks: unknown, files: RawAddon['files']): string[] {
    if (hooks === undefined) {
        return [];
    }
    if (!isRecord(hooks)) {
        return ['"hooks" must be an object.'];
    }
    return Object.entries(hooks).flatMap(([hook, value]) => {
        if (!Object.hasOwn(HOOK_MODULES, hook)) {
            return [`"hooks" has an unknown hook "${hook}"; there are ${listOf(Object.keys(HOOK_MODULES))}.`];
        }
        const shape = hook === 'game' ? checkGameHook(value) : checkFunctionName(`hooks.${hook}`, value);
        if (shape.length > 0) {
            return shape;
        }
        const module = HOOK_MODULES[hook as keyof AddonHooks];
        const name = hookFunction(hooks as AddonHooks, hook as keyof AddonHooks) ?? '';
        const text = files.find(file => file.path === module)?.text;
        if (text === undefined) {
            return [`"hooks.${hook}" needs ${module} in the add-on's folder.`];
        }
        return exportsName(text, name) ? [] : [`${module} doesn't export ${name}.`];
    });
}

function checkFunctionName(field: string, name: unknown): string[] {
    return typeof name === 'string' && IDENTIFIER.test(name) ? [] : [`"${field}" must be the name of a function.`];
}

function checkGameHook(game: unknown): string[] {
    if (!isRecord(game) || !Object.keys(game).every(key => key === 'export' || key === 'fields')) {
        return ['"hooks.game" must be { "export": the function\'s name, "fields": the registerGame fields it returns }.'];
    }
    const fields = game.fields;
    if (!isTextList(fields) || fields.length === 0 || new Set(fields).size !== fields.length || !fields.every(field => IDENTIFIER.test(field))) {
        return [...checkFunctionName('hooks.game.export', game.export), '"hooks.game.fields" must name each registerGame field the function returns, once.'];
    }
    const taken = fields.filter(field => BASELINE_GAME_FIELDS.includes(field));
    return [
        ...checkFunctionName('hooks.game.export', game.export),
        ...taken.length > 0 ? [`The baseline's registerGame sets ${listOf(taken)} already, so "hooks.game" can't return ${taken.length === 1 ? 'it' : 'them'}.`] : [],
    ];
}

function checkOptions(options: unknown, hidden: boolean): string[] {
    if (options === undefined) {
        return [];
    }
    if (!isRecord(options) || Object.keys(options).length === 0) {
        return ['"options" must be an object with at least one option.'];
    }
    if (hidden) {
        return ['A hidden add-on is never shown, so it can\'t ask anything.'];
    }
    return Object.entries(options).flatMap(([id, option]) => [
        ...PLACEHOLDER_NAME.test(id) ? [] : [`The option "${id}" must be named with letters only, since templates use it as {{${id}}}.`],
        ...checkOption(id, option),
    ]);
}

function checkOption(id: string, option: unknown): string[] {
    if (!isRecord(option) || !isText(option.title) || (option.placeholder !== undefined && typeof option.placeholder !== 'string')) {
        return [`The option "${id}" needs a "title" and may have a "placeholder", both text.`];
    }
    const choices = option.choices;
    if (!Array.isArray(choices) || choices.length === 0) {
        return [`The option "${id}" needs "choices".`];
    }
    const problems = choices.flatMap((choice: unknown) => checkChoice(id, choice));
    const values = choices.map((choice: unknown) => isRecord(choice) ? choice.value : undefined);
    if (new Set(values).size !== values.length) {
        problems.push(`The option "${id}" has a value twice.`);
    }
    const keySets = new Set(choices.map((choice: unknown) => isRecord(choice) && isRecord(choice.placeholders) ? Object.keys(choice.placeholders).sort().join() : ''));
    if (keySets.size > 1) {
        problems.push(`Every choice of the option "${id}" must define the same placeholders.`);
    }
    return problems;
}

function checkChoice(id: string, choice: unknown): string[] {
    if (!isRecord(choice) || typeof choice.value !== 'string' || !CHOICE_VALUE.test(choice.value) || !isText(choice.label)
        || (choice.detail !== undefined && typeof choice.detail !== 'string')) {
        return [`Every choice of the option "${id}" needs a "value" of letters, digits, _, . or -, and a "label".`];
    }
    const placeholders = choice.placeholders;
    if (placeholders === undefined) {
        return [];
    }
    const valid = isRecord(placeholders) && Object.entries(placeholders).every(([key, text]) => PLACEHOLDER_NAME.test(key) && typeof text === 'string');
    return valid ? [] : [`The placeholders of the option "${id}" must map names of letters to text.`];
}

function checkReadme(readme: unknown): string[] {
    if (readme === undefined) {
        return [];
    }
    const valid = isRecord(readme)
        && Object.keys(readme).every(key => key === 'features' || key === 'notes')
        && [readme.features, readme.notes].every(lines => lines === undefined || isTextList(lines));
    return valid ? [] : ['"readme" may hold "features" and "notes", each a list of text.'];
}

function checkProjectFiles(projectFiles: unknown, files: RawAddon['files'], known: Known): string[] {
    if (projectFiles === undefined) {
        return [];
    }
    if (!isRecord(projectFiles) || Object.keys(projectFiles).length === 0) {
        return ['"projectFiles" must map files of the add-on\'s folder to their paths in the project.'];
    }
    const targets = Object.values(projectFiles);
    return [
        ...Object.entries(projectFiles).flatMap(([file, target]) => checkProjectFile(file, target, files, known)),
        ...new Set(targets).size === targets.length ? [] : ['"projectFiles" writes two files to the same path.'],
    ];
}

function checkProjectFile(file: string, target: unknown, files: RawAddon['files'], known: Known): string[] {
    if (!files.some(candidate => candidate.path === file)) {
        return [`"projectFiles" names ${file}, which isn't in the add-on's folder.`];
    }
    if (TYPESCRIPT_FILE.test(file)) {
        return [`"projectFiles" can't move ${file}: TypeScript stays in the add-on's folder, where it is type-checked.`];
    }
    if (typeof target !== 'string' || !isProjectPath(target)) {
        return [`"projectFiles" must give ${file} a path in the project, relative and with /.`];
    }
    if (target === SOURCE_FOLDER || target.startsWith(`${SOURCE_FOLDER}/`)) {
        return [`"projectFiles" can't write ${file} into ${SOURCE_FOLDER}; what goes there belongs in the add-on's folder.`];
    }
    return known.baselineFiles.has(target) ? [`"projectFiles" can't write ${file} to ${target}, which the baseline project writes.`] : [];
}

function checkPackageJson(packageJson: unknown): string[] {
    if (packageJson === undefined) {
        return [];
    }
    const fields: readonly string[] = PACKAGE_JSON_FIELDS;
    if (!isRecord(packageJson) || Object.keys(packageJson).length === 0 || !Object.keys(packageJson).every(key => fields.includes(key))) {
        return [`"packageJson" may hold ${listOf(fields.map(field => `"${field}"`))}.`];
    }
    return PACKAGE_JSON_FIELDS.flatMap(field => {
        const entries = packageJson[field];
        if (entries === undefined) {
            return [];
        }
        if (!isRecord(entries) || Object.keys(entries).length === 0 || !Object.entries(entries).every(([name, value]) => isText(name) && isText(value))) {
            return [`"packageJson.${field}" must map names to text.`];
        }
        const names = Object.keys(entries);
        const taken = names.filter(name => Object.hasOwn(PACKAGE_JSON_BASELINE[field], name));
        const libraries = field === 'devDependencies' ? names.filter(name => LIBRARY_NAMES.includes(name)) : [];
        return [
            ...taken.length > 0 ? [`The baseline's package.json has ${listOf(taken)} in "${field}" already.`] : [],
            ...libraries.length > 0 ? [`Vortex provides ${listOf(libraries)} at runtime; list ${libraries.length === 1 ? 'it' : 'them'} in "vortexLibraries" instead.`] : [],
        ];
    });
}

function checkVortexLibraries(libraries: unknown): string[] {
    if (libraries === undefined) {
        return [];
    }
    const valid = isTextList(libraries) && libraries.length > 0 && new Set(libraries).size === libraries.length
        && libraries.every(name => LIBRARY_NAMES.includes(name));
    return valid ? [] : [`"vortexLibraries" must list some of ${listOf(LIBRARY_NAMES)}, each once.`];
}

function checkGitignore(lines: unknown): string[] {
    if (lines === undefined) {
        return [];
    }
    const valid = isTextList(lines) && lines.length > 0 && lines.every(isLine);
    return valid ? [] : ['"gitignore" must list lines for .gitignore, each on one line.'];
}

function checkAcrossAddons(addons: ReadonlyMap<string, CheckedAddon>): CatalogueProblem[] {
    const problems: CatalogueProblem[] = [];
    const report = (folder: string, message: string) => problems.push({ folder, message });
    for (const { manifest } of addons.values()) {
        for (const field of ID_LISTS) {
            (manifest[field] ?? []).filter(id => !addons.has(id)).forEach(id => report(manifest.id, `"${field}" names ${id}, which isn't an add-on.`));
        }
        if (manifest.when && !manifest.hidden) {
            report(manifest.id, 'An add-on with "when" is included by itself, so it must be hidden.');
        }
        if (manifest.hidden && !manifest.when && ![...addons.values()].some(other => other.manifest.dependsOn?.includes(manifest.id))) {
            report(manifest.id, 'Nothing depends on this hidden add-on and it has no "when", so it can never take part.');
        }
    }
    checkDependencyCycles(addons).forEach(id => report(id, 'Its "dependsOn" leads back to itself.'));
    checkPlaceholderNames(addons).forEach(({ folder, message }) => report(folder, message));
    checkHookImports(addons).forEach(({ folder, message }) => report(folder, message));
    checkPairs(addons).forEach(({ folder, message }) => report(folder, message));
    return problems;
}

function checkDependencyCycles(addons: ReadonlyMap<string, CheckedAddon>): string[] {
    const leadsBack = (start: string): boolean => {
        const seen = new Set<string>();
        const pending = [...addons.get(start)?.manifest.dependsOn ?? []];
        while (pending.length > 0) {
            const id = pending.pop()!;
            if (id === start) {
                return true;
            }
            if (!seen.has(id)) {
                seen.add(id);
                pending.push(...addons.get(id)?.manifest.dependsOn ?? []);
            }
        }
        return false;
    };
    return [...addons.keys()].filter(leadsBack);
}

/** Option ids and their choices' placeholders share one namespace with the baseline's placeholders */
function checkPlaceholderNames(addons: ReadonlyMap<string, CheckedAddon>): Required<CatalogueProblem>[] {
    const owners = new Map<string, string>();
    const problems: Required<CatalogueProblem>[] = [];
    for (const { manifest } of addons.values()) {
        for (const [optionId, option] of Object.entries(manifest.options ?? {})) {
            const names = [optionId, ...new Set(option.choices.flatMap(choice => Object.keys(choice.placeholders ?? {})))];
            for (const name of names) {
                const owner = BASE_PLACEHOLDER_KEYS.includes(name) ? 'the baseline' : owners.get(name);
                if (owner) {
                    problems.push({ folder: manifest.id, message: `The placeholder {{${name}}} is already used by ${owner}.` });
                }
                owners.set(name, manifest.id);
            }
        }
    }
    return problems;
}

/** Only the generated `main()` and `prepareForModding` may import a hook module, so a superseded add-on can drop it */
function checkHookImports(addons: ReadonlyMap<string, CheckedAddon>): Required<CatalogueProblem>[] {
    const hookTargets = new Set([...addons.values()].flatMap(({ manifest }) => Object.keys(manifest.hooks ?? {})
        .map(hook => `${SOURCE_FOLDER}/${manifest.id}/${path.posix.parse(HOOK_MODULES[hook as keyof AddonHooks]).name}`)));
    return [...addons.values()].flatMap(({ manifest, files }) => files.flatMap(file => {
        const from = path.posix.dirname(`${SOURCE_FOLDER}/${manifest.id}/${file.path}`);
        return [...(file.text ?? '').matchAll(IMPORT_SPECIFIER)]
            .map(match => match[2])
            .filter(specifier => specifier.startsWith('.') && hookTargets.has(path.posix.join(from, specifier)))
            .map(specifier => ({ folder: manifest.id, message: `${file.path} imports ${specifier}, a hook module; only the generated main() and prepareForModding may.` }));
    }));
}

/** Two add-ons that can be picked together must not both own one thing of the project */
function checkPairs(addons: ReadonlyMap<string, CheckedAddon>): Required<CatalogueProblem>[] {
    const manifests = [...addons.values()].map(addon => addon.manifest);
    return manifests.flatMap((first, index) => manifests.slice(index + 1)
        .filter(second => canMeet(first, second))
        .flatMap(second => pairProblems(first, second, settled(first, second, manifests))
            .map(problem => ({ folder: first.id, message: `${first.id} and ${second.id} ${problem}` }))));
}

/** What two add-ons that meet both claim; `settled` when one of them, or a third, takes the other over */
function pairProblems(first: AddonManifest, second: AddonManifest, settled: boolean): string[] {
    const takeOver = 'One of them must supersede the other, or a third one both.';
    const overlap = shared(first.supersedes, second.supersedes);
    const fields = shared(first.hooks?.game?.fields, second.hooks?.game?.fields);
    const targets = shared(Object.values(first.projectFiles ?? {}), Object.values(second.projectFiles ?? {}));
    return [
        ...first.modsPath && second.modsPath && !settled
            ? ['both set "modsPath". Add a hidden add-on with "when" and "supersedes" for both, or list one in the other\'s "conflicts".']
            : [],
        ...overlap.length > 0 && !settled ? [`both take over ${listOf(overlap)}. ${takeOver}`] : [],
        ...fields.length > 0 && !settled ? [`both return ${listOf(fields)} for registerGame. ${takeOver}`] : [],
        ...targets.length > 0 ? [`both write ${listOf(targets)}.`] : [],
        ...PACKAGE_JSON_FIELDS.flatMap(field => {
            const theirs = second.packageJson?.[field] ?? {};
            return Object.entries(first.packageJson?.[field] ?? {})
                .filter(([name, value]) => Object.hasOwn(theirs, name) && theirs[name] !== value)
                .map(([name]) => `give ${name} different values in "packageJson.${field}".`);
        }),
    ];
}

function canMeet(first: AddonManifest, second: AddonManifest): boolean {
    const sharesEngine = first.engines === undefined || second.engines === undefined || first.engines.some(engine => second.engines!.includes(engine));
    return sharesEngine && !first.conflicts?.includes(second.id) && !second.conflicts?.includes(first.id);
}

function supersedes(first: AddonManifest, second: AddonManifest): boolean {
    return first.supersedes?.includes(second.id) ?? false;
}

/** One takes the other over, or a glue add-on takes both over and is always included once both take part */
function settled(first: AddonManifest, second: AddonManifest, manifests: readonly AddonManifest[]): boolean {
    const together = new Set([first.id, second.id, ...first.when ?? [], ...second.when ?? []]);
    return supersedes(first, second) || supersedes(second, first) || manifests.some(glue => supersedes(glue, first) && supersedes(glue, second)
        && (glue.when ?? []).every(id => together.has(id)));
}

function shared(first: readonly string[] | undefined, second: readonly string[] | undefined): string[] {
    return (first ?? []).filter(item => second?.includes(item));
}

function exportsName(text: string, name: string): boolean {
    return new RegExp(`export\\s+(?:async\\s+)?function\\s+${name}\\b|export\\s+const\\s+${name}\\b`).test(text);
}

function isRelativeFolder(folder: string): boolean {
    return !folder.includes('\\') && !path.posix.isAbsolute(folder) && !folder.split('/').includes('..');
}

/** A file below the project folder, written the way the generated outputs name their paths */
function isProjectPath(file: string): boolean {
    return isText(file) && !file.includes('\\') && !/^[A-Za-z]:/.test(file) && !path.posix.isAbsolute(file)
        && path.posix.normalize(file) === file && file !== '.' && file !== '..' && !file.startsWith('../') && !file.endsWith('/');
}

function isText(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0;
}

function isLine(value: unknown): value is string {
    return isText(value) && !/[\r\n]/.test(value);
}

function isTextList(value: unknown): value is string[] {
    return Array.isArray(value) && value.every(item => typeof item === 'string');
}

function listOf(items: readonly string[]): string {
    return items.join(', ');
}
