import { DEBUG_PORT_DEFAULT, PLACEHOLDER_EXECUTABLE, PLACEHOLDER_STEAM_APP_ID } from '../constants';
import type { ProjectValues } from '../types/project';
import type { Composition } from './addons/composeAddons';
import { packageNameFor } from './packageJson';

const PLACEHOLDER = /(?<!\$)\{\{([A-Za-z]+)\}\}/g;

export type TemplateValues = Readonly<Record<string, string>>;

/** The placeholders `restoreValues` and `compositionPlaceholders` can provide for an existing project */
export const RESTORE_KEYS: readonly string[] = Object.freeze(['packageName', 'gameName', 'debugPort', 'entryDescription', 'setupDescription']);

/** Every placeholder the baseline's templates use, which an add-on's option can't be named after */
export const BASE_PLACEHOLDER_KEYS: readonly string[] = Object.freeze([
    ...RESTORE_KEYS,
    'idPrefix',
    'gameIdValue',
    'gameNameValue',
    'steamAppIdValue',
    'exePathValue',
    'modsPathValue',
    'readmeFeatures',
    'readmeModsNote',
    'readmeAddonSections',
]);

/**
 * Replaces every `{{key}}` token of a template.
 *
 * @throws Error if the template uses a key missing from `values`.
 */
export function renderTemplate(template: string, values: TemplateValues): string {
    return template.replace(PLACEHOLDER, (match, key: string) => {
        if (!Object.hasOwn(values, key)) {
            throw new Error(`Unknown template placeholder ${match}`);
        }
        return values[key];
    });
}

/** The keys of the `{{key}}` tokens in a template */
export function placeholderKeys(template: string): string[] {
    return [...template.matchAll(PLACEHOLDER)].map(match => match[1]);
}

/** Makes a value safe to use inside the single quotes it is written between in a template */
export function jsStringBody(value: string): string {
    return value
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/\r/g, '\\r')
        .replace(/\n/g, '\\n');
}

/** Makes a value safe to use inside a block comment */
export function commentText(value: string): string {
    return value.replace(/\*\//g, '*​/').replace(/[\r\n]+/g, ' ');
}

/** The values of every placeholder the templates use */
export function placeholderValues(values: ProjectValues, composition: Composition): TemplateValues {
    const gameName = commentText(values.gameName);
    const composed = compositionPlaceholders(composition, gameName);
    const readmeValues = { gameName, ...composed };
    return {
        ...readmeValues,
        packageName: packageNameFor(values.shortName),
        idPrefix: values.shortName,
        gameIdValue: jsStringBody(values.gameId),
        gameNameValue: jsStringBody(values.gameName),
        steamAppIdValue: jsStringBody(values.steamAppId || PLACEHOLDER_STEAM_APP_ID),
        exePathValue: jsStringBody(values.executable || PLACEHOLDER_EXECUTABLE),
        modsPathValue: jsStringBody(composition.modsPath(values.executable ?? '')),
        debugPort: String(DEBUG_PORT_DEFAULT),
        readmeFeatures: renderTemplate(composition.readme.features, readmeValues),
        readmeModsNote: renderTemplate(composition.readme.notes, readmeValues),
        readmeAddonSections: renderTemplate(composition.readme.sections, readmeValues),
    };
}

/**
 * What the add-ons add to the placeholders: the doc-comment sentences, the option values and
 * their choices' prose. The same for a new project and for a restore.
 */
export function compositionPlaceholders(composition: Composition, gameName: string): TemplateValues {
    const options = Object.entries(composition.optionValues).map(([key, value]) => [key, renderTemplate(value, { gameName })]);
    return {
        entryDescription: composition.entryDescription,
        setupDescription: composition.setupDescription,
        ...Object.fromEntries(options),
    };
}

/** The placeholder values that can be read back from an existing project's package.json */
export function restoreValues(packageName: string, gameName: string): TemplateValues {
    return {
        packageName,
        gameName: commentText(gameName),
        debugPort: String(DEBUG_PORT_DEFAULT),
    };
}
