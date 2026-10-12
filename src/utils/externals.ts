import { applyEdits, modify, type FormattingOptions } from 'jsonc-parser';
import { isRecord, parseLenientJson } from './jsonUtils';

const EXTERNALS_PATH = ['vortex', 'externals'];

/** The modules a project's rollup config treats as provided by Vortex at runtime, from `vortex.externals` */
export function readExternals(packageJsonText: string): string[] {
    const manifest = parseLenientJson(packageJsonText);
    const externals = isRecord(manifest) && isRecord(manifest.vortex) ? manifest.vortex.externals : undefined;
    return Array.isArray(externals) ? externals.filter((name): name is string => typeof name === 'string') : [];
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
