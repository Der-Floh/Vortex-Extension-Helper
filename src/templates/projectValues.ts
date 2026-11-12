import { DISPLAY_NAME_PREFIX, PACKAGE_NAME_SUFFIX } from '../constants';
import type { ProjectValues } from '../types/project';
import { isRecord } from '../utils/jsonUtils';
import { escapeRegExp } from '../utils/regExp';
import { linesOf } from '../utils/threeWayMerge';
import { GENERATED_FILES } from './registry';
import { placeholderKeys } from './render';

type ReadBackValue = 'gameId' | 'gameName' | 'steamAppId' | 'executable' | 'shortName';

interface LinePattern {
    readonly path: string;
    readonly value: ReadBackValue;
    readonly pattern: RegExp;
    readonly decode: (written: string) => string;
}

/** Inside single quotes, the way `jsStringBody` writes a value */
const STRING_BODY = /((?:[^'\\]|\\.)*)/.source;
const SHORT_NAME = /([a-z][a-z0-9]*(?:-[a-z0-9]+)*)/.source;
const unescapeString = (written: string) => written.replace(/\\(.)/g, (_match, character: string) => character === 'n' ? '\n' : character === 'r' ? '\r' : character);

/** The placeholders a generated project shows once on a line of its own, which give back what the wizard asked */
const READ_BACK: Readonly<Record<string, { readonly value: ReadBackValue; readonly capture: string; readonly decode: (written: string) => string }>> = {
    gameIdValue: { value: 'gameId', capture: STRING_BODY, decode: unescapeString },
    gameNameValue: { value: 'gameName', capture: STRING_BODY, decode: unescapeString },
    steamAppIdValue: { value: 'steamAppId', capture: STRING_BODY, decode: unescapeString },
    exePathValue: { value: 'executable', capture: STRING_BODY, decode: unescapeString },
    idPrefix: { value: 'shortName', capture: SHORT_NAME, decode: written => written },
};

/** Every baseline line with one of those placeholders and some words around it, as a pattern for the project's version of the line */
const LINE_PATTERNS: readonly LinePattern[] = GENERATED_FILES.flatMap(file => typeof file.source !== 'string' || !file.templated ? [] : linesOf(file.source).flatMap(line => {
    const keys = placeholderKeys(line);
    const known = keys.length === 1 ? READ_BACK[keys[0]] : undefined;
    if (!known) {
        return [];
    }
    const [before, after] = line.trim().split(`{{${keys[0]}}}`);
    return /[A-Za-z]/.test(before + after)
        ? [{ path: file.path, value: known.value, pattern: new RegExp(`^${escapeRegExp(before)}${known.capture}${escapeRegExp(after)}$`), decode: known.decode }]
        : [];
}));

/**
 * The wizard's answers for a project generated earlier, read back from its package.json and files: the game's
 * ids and executable from the constants, the short name from its ids, the rest from package.json. A value that
 * can't be found is left out, so rendering writes the wizard's placeholder for it.
 */
export function readProjectValues(manifest: unknown, files: ReadonlyMap<string, string | Uint8Array>): ProjectValues {
    const found = readBack(files);
    const name = textField(manifest, 'name') ?? '';
    const displayName = textField(manifest, 'displayName');
    const shortName = found.shortName ?? (name.endsWith(PACKAGE_NAME_SUFFIX) ? name.slice(0, -PACKAGE_NAME_SUFFIX.length) : name);
    return {
        shortName,
        gameId: found.gameId ?? '',
        gameName: displayName?.startsWith(DISPLAY_NAME_PREFIX) ? displayName.slice(DISPLAY_NAME_PREFIX.length) : found.gameName ?? displayName ?? shortName,
        author: textField(manifest, 'author') ?? '',
        steamAppId: found.steamAppId,
        executable: found.executable,
    };
}

function readBack(files: ReadonlyMap<string, string | Uint8Array>): Partial<Record<ReadBackValue, string>> {
    const found: Partial<Record<ReadBackValue, string>> = {};
    const linesByPath = new Map<string, string[]>();
    for (const { path, value, pattern, decode } of LINE_PATTERNS) {
        const text = files.get(path);
        if (found[value] !== undefined || typeof text !== 'string') {
            continue;
        }
        const lines = linesByPath.get(path) ?? linesOf(text).map(line => line.trim());
        linesByPath.set(path, lines);
        const match = lines.map(line => pattern.exec(line)).find(candidate => candidate !== null);
        if (match) {
            found[value] = decode(match[1]);
        }
    }
    return found;
}

function textField(manifest: unknown, field: string): string | undefined {
    const value = isRecord(manifest) ? manifest[field] : undefined;
    return typeof value === 'string' && value ? value : undefined;
}
