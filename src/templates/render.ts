import { DEBUG_PORT_DEFAULT, PLACEHOLDER_EXECUTABLE, PLACEHOLDER_STEAM_APP_ID } from '../constants';
import type { ProjectValues } from '../types/project';
import { packageNameFor } from './packageJson';

const PLACEHOLDER = /(?<!\$)\{\{([A-Za-z]+)\}\}/g;

export type TemplateValues = Readonly<Record<string, string>>;

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
export function placeholderValues(values: ProjectValues): TemplateValues {
    return {
        packageName: packageNameFor(values.shortName),
        idPrefix: values.shortName,
        gameName: commentText(values.gameName),
        gameIdValue: jsStringBody(values.gameId),
        gameNameValue: jsStringBody(values.gameName),
        steamAppIdValue: jsStringBody(values.steamAppId || PLACEHOLDER_STEAM_APP_ID),
        exePathValue: jsStringBody(values.executable || PLACEHOLDER_EXECUTABLE),
        debugPort: String(DEBUG_PORT_DEFAULT),
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
