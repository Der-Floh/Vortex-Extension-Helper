import { applyEdits, modify, type FormattingOptions } from 'jsonc-parser';
import { isRecord, parseLenientJson } from '../utils/jsonUtils';

const EXTERNALS_PATH = ['vortex', 'externals'];

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

function detectFormatting(text: string): FormattingOptions {
    const indent = /^([ \t]+)\S/m.exec(text)?.[1] ?? '    ';
    return {
        insertSpaces: !indent.startsWith('\t'),
        tabSize: indent.startsWith('\t') ? 4 : indent.length,
        eol: text.includes('\r\n') ? '\r\n' : '\n',
    };
}
