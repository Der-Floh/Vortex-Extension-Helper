import { applyEdits, modify, type FormattingOptions, type JSONPath } from 'jsonc-parser';
import { VORTEX_FIELDS } from '../constants';
import type { AddonManifestChange, AddonRecord, EntryChange } from '../types/project';
import { compareDependencyNames, isRecord, parseLenientJson } from '../utils/jsonUtils';

const VORTEX_KEY = 'vortex';
const EXTERNALS_PATH = [VORTEX_KEY, 'externals'];

type VortexField = typeof VORTEX_FIELDS[number];

export const DEPENDENCY_FIELDS = ['devDependencies', 'dependencies'];

/** A Vortex game extension declares vortex-api as a devDependency */
export function isVortexManifest(manifest: unknown): boolean {
    return isRecord(manifest)
        && isRecord(manifest.devDependencies)
        && typeof manifest.devDependencies['vortex-api'] === 'string';
}

export function dependencySpec(manifest: unknown, name: string): string | undefined {
    if (!isRecord(manifest)) {
        return undefined;
    }
    for (const field of DEPENDENCY_FIELDS) {
        const dependencies = manifest[field];
        if (isRecord(dependencies) && typeof dependencies[name] === 'string') {
            return dependencies[name];
        }
    }
    return undefined;
}

export function dependencyNames(manifest: unknown): Set<string> {
    if (!isRecord(manifest)) {
        return new Set();
    }
    return new Set(DEPENDENCY_FIELDS.flatMap(field => {
        const dependencies = manifest[field];
        return isRecord(dependencies) ? Object.keys(dependencies) : [];
    }));
}

export function declaresScript(manifest: unknown, script: string): boolean {
    return isRecord(manifest) && isRecord(manifest.scripts) && typeof manifest.scripts[script] === 'string';
}

/** The modules a project's rollup config treats as provided by Vortex at runtime, from `vortex.externals` */
export function externalsOf(manifest: unknown): string[] {
    const externals = isRecord(manifest) && isRecord(manifest.vortex) ? manifest.vortex.externals : undefined;
    return Array.isArray(externals) ? externals.filter((name): name is string => typeof name === 'string') : [];
}

/** The add-ons the project was generated with, from `vortex.addons` and `vortex.addonOptions`; none for a project without */
export function addonRecordOf(manifest: unknown): AddonRecord | undefined {
    const vortex = isRecord(manifest) && isRecord(manifest.vortex) ? manifest.vortex : undefined;
    if (!vortex || !isRecord(vortex.addons)) {
        return undefined;
    }
    return { addons: textEntries(vortex.addons), options: isRecord(vortex.addonOptions) ? textEntries(vortex.addonOptions) : {} };
}

/** The id of the game's engine the project records in `vortex.engine` */
export function engineOf(manifest: unknown): string | undefined {
    const engine = isRecord(manifest) && isRecord(manifest.vortex) ? manifest.vortex.engine : undefined;
    return typeof engine === 'string' && engine ? engine : undefined;
}

/**
 * Applies what adding or removing add-ons changes in package.json, keeping the file's formatting. A new entry goes
 * where a new project has it, so an untouched file ends up as a new project's would be, and an entry is only taken
 * out while it still has the value the add-on gave it.
 */
export function applyAddonChange(packageJsonText: string, change: AddonManifestChange): string {
    const formattingOptions = detectFormatting(packageJsonText);
    let text = packageJsonText;
    const set = (path: JSONPath, value: unknown, goesBefore?: (existing: string) => boolean) => {
        const getInsertionIndex = goesBefore && ((properties: string[]) => {
            const index = properties.findIndex(goesBefore);
            return index < 0 ? properties.length : index;
        });
        text = applyEdits(text, modify(text, path, value, { formattingOptions, getInsertionIndex }));
    };
    const scriptRank = (name: string) => rankIn(change.scripts.order, name);
    applyEntries(() => parseLenientJson(text), 'devDependencies', change.devDependencies, set, name => existing => compareDependencyNames(existing, name) > 0);
    applyEntries(() => parseLenientJson(text), 'scripts', change.scripts, set, name => existing => scriptRank(existing) > scriptRank(name));

    const setVortex = (field: VortexField, value: unknown) => {
        const vortex = vortexOf(parseLenientJson(text));
        if (value === undefined) {
            if (vortex && Object.hasOwn(vortex, field)) {
                set([VORTEX_KEY, field], undefined);
            }
        } else if (vortex) {
            set([VORTEX_KEY, field], value, existing => rankIn(VORTEX_FIELDS, existing) > rankIn(VORTEX_FIELDS, field));
        } else {
            set([VORTEX_KEY], { [field]: value });
        }
    };
    if (change.engine && !engineOf(parseLenientJson(text))) {
        setVortex('engine', change.engine);
    }
    setVortex('addons', change.record?.addons);
    setVortex('addonOptions', change.record && Object.keys(change.record.options).length > 0 ? change.record.options : undefined);
    const externals = readExternals(text);
    const nextExternals = [...externals.filter(name => !change.externals.remove.includes(name)), ...change.externals.add.filter(name => !externals.includes(name))];
    if (nextExternals.join() !== externals.join()) {
        setVortex('externals', nextExternals.length > 0 ? nextExternals : undefined);
    }
    const vortex = vortexOf(parseLenientJson(text));
    if (vortex && Object.keys(vortex).length === 0) {
        set([VORTEX_KEY], undefined);
    }
    return text;
}

export function readExternals(packageJsonText: string): string[] {
    return externalsOf(parseLenientJson(packageJsonText));
}

/** Adds a module to `vortex.externals`, keeping the file's formatting; returns the text unchanged if it is listed already */
export function addExternal(packageJsonText: string, moduleName: string): string {
    const externals = readExternals(packageJsonText);
    if (externals.includes(moduleName)) {
        return packageJsonText;
    }
    const edits = modify(packageJsonText, EXTERNALS_PATH, [...externals, moduleName], { formattingOptions: detectFormatting(packageJsonText) });
    return applyEdits(packageJsonText, edits);
}

/** Takes a module out of `vortex.externals`, and the `vortex` key with it once nothing else is in there, which undoes `addExternal` */
export function removeExternal(packageJsonText: string, moduleName: string): string {
    const externals = readExternals(packageJsonText);
    if (!externals.includes(moduleName)) {
        return packageJsonText;
    }
    const remaining = externals.filter(name => name !== moduleName);
    const removal = remaining.length > 0
        ? { path: EXTERNALS_PATH, value: remaining }
        : { path: holdsOnlyExternals(packageJsonText) ? [VORTEX_KEY] : EXTERNALS_PATH, value: undefined };
    const edits = modify(packageJsonText, removal.path, removal.value, { formattingOptions: detectFormatting(packageJsonText) });
    return applyEdits(packageJsonText, edits);
}

/** Adds the entries a field lacks and takes out those that still have the given value */
function applyEntries(
    read: () => unknown,
    field: string,
    entries: EntryChange,
    set: (path: JSONPath, value: unknown, goesBefore?: (existing: string) => boolean) => void,
    placeOf: (name: string) => (existing: string) => boolean,
): void {
    const current = (name: string) => {
        const manifest = read();
        const values = isRecord(manifest) ? manifest[field] : undefined;
        return isRecord(values) && Object.hasOwn(values, name) ? values[name] : undefined;
    };
    for (const [name, value] of Object.entries(entries.add)) {
        if (current(name) === undefined) {
            set([field, name], value, placeOf(name));
        }
    }
    for (const [name, value] of Object.entries(entries.remove)) {
        if (current(name) === value) {
            set([field, name], undefined);
        }
    }
}

function vortexOf(manifest: unknown): Record<string, unknown> | undefined {
    return isRecord(manifest) && isRecord(manifest.vortex) ? manifest.vortex : undefined;
}

/** Where a name comes in an order; names it doesn't list come last */
function rankIn(order: readonly string[], name: string): number {
    const index = order.indexOf(name);
    return index < 0 ? order.length : index;
}

function holdsOnlyExternals(packageJsonText: string): boolean {
    const manifest = parseLenientJson(packageJsonText);
    return isRecord(manifest) && isRecord(manifest.vortex) && Object.keys(manifest.vortex).length === 1;
}

function detectFormatting(text: string): FormattingOptions {
    const indent = /^([ \t]+)\S/m.exec(text)?.[1] ?? '    ';
    return {
        insertSpaces: !indent.startsWith('\t'),
        tabSize: indent.startsWith('\t') ? 4 : indent.length,
        eol: text.includes('\r\n') ? '\r\n' : '\n',
    };
}

function textEntries(record: Record<string, unknown>): Record<string, string> {
    return Object.fromEntries(Object.entries(record).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
}
