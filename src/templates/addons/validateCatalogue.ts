import * as path from 'path';
import { isRecord } from '../../utils/jsonUtils';
import { BASE_PLACEHOLDER_KEYS } from '../render';
import { HOOK_MODULES, type AddonHooks, type AddonManifest } from './addon';

/** What `esbuild.addons.mjs` found, before anything is known to be valid */
export interface CatalogueInput {
    readonly engines: unknown;
    readonly categories: unknown;
    readonly addons: readonly RawAddon[];
    /** The baseline's own folders below `src`, which an add-on can't take */
    readonly reservedFolders: readonly string[];
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
}

interface CheckedAddon {
    readonly manifest: AddonManifest;
    readonly files: RawAddon['files'];
}

/** Every field an addon.json may have */
export const MANIFEST_FIELDS: ReadonlySet<string> = new Set([
    '$schema', 'id', 'version', 'name', 'description', 'category', 'engines', 'hidden', 'dependsOn', 'conflicts', 'when',
    'supersedes', 'replacesPlainInstaller', 'modsPath', 'hooks', 'options', 'readme',
]);
const ID_LISTS = ['dependsOn', 'conflicts', 'when', 'supersedes'] as const;
const ADDON_ID = /^[a-z][a-zA-Z0-9]*$/;
const ENTRY_ID = /^[a-z][a-zA-Z0-9]*$/;
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const PLACEHOLDER_NAME = /^[A-Za-z]+$/;
const CHOICE_VALUE = /^[A-Za-z0-9_.-]+$/;
const IMPORT_SPECIFIER = /(?:from\s+|import\s*\(\s*)(['"])([^'"]+)\1/g;
const MODS_PATH_BASES = ['game', 'executable'];

/** Everything that can be wrong with the add-on folders, so a build or a test can refuse them */
export function validateCatalogue(input: CatalogueInput): CatalogueProblem[] {
    const engines = checkEntries(input.engines, 'catalogue/engines.json', ['id', 'label', 'examples']);
    const categories = checkEntries(input.categories, 'catalogue/categories.json', ['id', 'label', 'description']);
    const known: Known = { engines: engines.ids, categories: categories.ids, reserved: new Set(input.reservedFolders) };
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
        ...['name', 'description'].flatMap(field => isText(manifest[field]) ? [] : [`"${field}" must be text.`]),
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
    return Object.entries(hooks).flatMap(([hook, name]) => {
        if (!Object.hasOwn(HOOK_MODULES, hook)) {
            return [`"hooks" has an unknown hook "${hook}"; there are ${listOf(Object.keys(HOOK_MODULES))}.`];
        }
        if (typeof name !== 'string' || !IDENTIFIER.test(name)) {
            return [`"hooks.${hook}" must be the name of a function.`];
        }
        const module = HOOK_MODULES[hook as keyof AddonHooks];
        const text = files.find(file => file.path === module)?.text;
        if (text === undefined) {
            return [`"hooks.${hook}" needs ${module} in the add-on's folder.`];
        }
        return exportsName(text, name) ? [] : [`${module} doesn't export ${name}.`];
    });
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
        .map(hook => `src/${manifest.id}/${path.posix.parse(HOOK_MODULES[hook as keyof AddonHooks]).name}`)));
    return [...addons.values()].flatMap(({ manifest, files }) => files.flatMap(file => {
        const from = path.posix.dirname(`src/${manifest.id}/${file.path}`);
        return [...(file.text ?? '').matchAll(IMPORT_SPECIFIER)]
            .map(match => match[2])
            .filter(specifier => specifier.startsWith('.') && hookTargets.has(path.posix.join(from, specifier)))
            .map(specifier => ({ folder: manifest.id, message: `${file.path} imports ${specifier}, a hook module; only the generated main() and prepareForModding may.` }));
    }));
}

/** Two add-ons that can be picked together must not both own the mods folder or take over the same add-on */
function checkPairs(addons: ReadonlyMap<string, CheckedAddon>): Required<CatalogueProblem>[] {
    const manifests = [...addons.values()].map(addon => addon.manifest);
    const problems: Required<CatalogueProblem>[] = [];
    for (const [index, first] of manifests.entries()) {
        for (const second of manifests.slice(index + 1).filter(other => canMeet(first, other))) {
            if (first.modsPath && second.modsPath && !settled(first, second, manifests)) {
                problems.push({ folder: first.id, message: `${first.id} and ${second.id} both set "modsPath". Add a hidden add-on with "when" and "supersedes" for both, or list one in the other's "conflicts".` });
            }
            const overlap = (first.supersedes ?? []).filter(id => second.supersedes?.includes(id));
            if (overlap.length > 0 && !settled(first, second, manifests)) {
                problems.push({ folder: first.id, message: `${first.id} and ${second.id} both take over ${listOf(overlap)}. One of them must supersede the other, or a third one both.` });
            }
        }
    }
    return problems;
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

function exportsName(text: string, name: string): boolean {
    return new RegExp(`export\\s+(?:async\\s+)?function\\s+${name}\\b|export\\s+const\\s+${name}\\b`).test(text);
}

function isRelativeFolder(folder: string): boolean {
    return !folder.includes('\\') && !path.posix.isAbsolute(folder) && !folder.split('/').includes('..');
}

function isText(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0;
}

function isTextList(value: unknown): value is string[] {
    return Array.isArray(value) && value.every(item => typeof item === 'string');
}

function listOf(items: readonly string[]): string {
    return items.join(', ');
}
