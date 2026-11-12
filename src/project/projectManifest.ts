import { applyEdits, modify, type FormattingOptions } from 'jsonc-parser';
import type { AddonRecord } from '../types/project';
import { isRecord, parseLenientJson } from '../utils/jsonUtils';

const VORTEX_KEY = 'vortex';
const EXTERNALS_PATH = [VORTEX_KEY, 'externals'];

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
