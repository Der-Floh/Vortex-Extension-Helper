import { PACKAGE_NAME_SUFFIX, SHORT_NAME_PATTERN } from '../constants';

const INVALID_FILE_NAME_CHARS = /[<>:"/\\|?*]/g;

export function packageNameFor(shortName: string): string {
    return `${shortName}${PACKAGE_NAME_SUFFIX}`;
}

/** Suggests a Nexus Mods domain for a game entered by hand: `Baldur's Gate 3` becomes `baldursgate3` */
export function suggestGameId(gameName: string): string {
    return gameName.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Suggests a short name for a Nexus Mods domain: `steins;gateelite` becomes `steins-gateelite` */
export function toShortName(gameId: string): string {
    return gameId.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export function suggestExecutable(gameName: string): string {
    return `${gameName.replace(INVALID_FILE_NAME_CHARS, '').trim()}.exe`;
}

/** Converts backslashes to forward slashes and drops a leading `./` */
export function normalizeExecutable(value: string): string {
    return value.trim().replace(/\\/g, '/').replace(/^(\.\/)+/, '');
}

/** @returns An error message, or undefined if the value is valid */
export function validateShortName(value: string): string | undefined {
    if (!value) {
        return 'Enter a short name.';
    }
    if (!SHORT_NAME_PATTERN.test(value)) {
        return 'Use lower-case letters, digits and single hyphens, starting with a letter (for example "coalllc").';
    }
    return undefined;
}

/** @returns An error message, or undefined if the value is valid */
export function validateGameId(value: string): string | undefined {
    if (!value.trim()) {
        return 'Enter the game\'s Nexus Mods domain.';
    }
    if (/[\s/\\'"]/.test(value)) {
        return 'The domain can\'t contain spaces, slashes or quotes. It is the part of the game\'s Nexus Mods URL after nexusmods.com/.';
    }
    return undefined;
}

/** @returns An error message, or undefined if the value is valid. An empty value selects the placeholder. */
export function validateSteamAppId(value: string): string | undefined {
    return value.trim() === '' || /^\d+$/.test(value.trim()) ? undefined : 'A Steam app id contains only digits.';
}

/** @returns An error message, or undefined if the value is valid. An empty value selects the placeholder. */
export function validateExecutable(value: string): string | undefined {
    const normalized = normalizeExecutable(value);
    if (normalized === '') {
        return undefined;
    }
    if (normalized.startsWith('/') || /^[A-Za-z]:/.test(normalized)) {
        return 'Enter a path relative to the game folder.';
    }
    if (normalized.split('/').includes('..')) {
        return 'The executable must be inside the game folder.';
    }
    return undefined;
}
