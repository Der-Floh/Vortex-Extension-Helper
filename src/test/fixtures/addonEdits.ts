import { addonRecordOf, applyAddonChange, engineOf } from '../../project/projectManifest';
import type { Catalogue } from '../../templates/addons/addon';
import { planAddonChange, type AddonChangePlan, type AddonChangeRequest, type ExistingProject } from '../../templates/addons/changeAddons';
import type { AddonChoices } from '../../templates/addons/resolveAddons';
import { renderProject } from '../../templates/registry';
import type { ProjectValues } from '../../types/project';
import { parseLenientJson } from '../../utils/jsonUtils';
import { TS_FIXTURE_VALUES } from './createFixtureWorkspace';
import { TEST_CATALOGUE } from './testAddon';

export type ProjectFiles = Map<string, string | Uint8Array>;

/** Something an author does to a generated project that adding or removing an add-on has to keep */
export interface AuthorEdit {
    readonly label: string;
    /** It changes TypeScript, so the result is worth type-checking */
    readonly changesCode: boolean;
    apply(files: ReadonlyMap<string, string | Uint8Array>): ProjectFiles;
}

export interface EditedProject {
    readonly label: string;
    readonly kind: 'add' | 'remove';
    readonly edit: AuthorEdit;
    /** What the planner made of the edited project */
    readonly result: ProjectFiles;
    /** The edit made to a new project with the add-ons the change leads to */
    readonly expected: ProjectFiles;
}

/** A change of add-ons, both ways */
export interface ChangePair {
    readonly label: string;
    readonly engine: string;
    readonly from: AddonChoices;
    readonly to: AddonChoices;
}

const EXTRA_MODULE = `import { types } from 'vortex-api';

/** The author's own code */
export function extra(context: types.IExtensionContext): void {
    context.once(() => undefined);
}
`;

export const AUTHOR_EDITS: readonly AuthorEdit[] = [
    {
        label: 'an import and a call in main(), with the module they use',
        changesCode: true,
        apply: files => edited(files, {
            'src/index.ts': text => replaceOnce(
                replaceOnce(text, 'import { prepareForModding } from \'./setup/prepareForModding\';', 'import { prepareForModding } from \'./setup/prepareForModding\';\nimport { extra } from \'./extra\';'),
                '\n\n    return true;',
                '\n    extra(context);\n\n    return true;',
            ),
        }, { 'src/extra.ts': EXTRA_MODULE }),
    },
    {
        label: 'a name added to the import from the constants',
        changesCode: true,
        apply: files => edited(files, { 'src/index.ts': text => replaceOnce(text, 'import { GAME', 'import { GAME, NOTIFICATION_IDS') }),
    },
    {
        label: 'a renamed GAME.name',
        changesCode: true,
        apply: files => edited(files, { 'src/common/constants.ts': text => replaceOnce(text, /^ {4}name: '.*',$/m, '    name: \'Renamed Game\',') }),
    },
    {
        label: 'a README intro of its own',
        changesCode: false,
        apply: files => edited(files, { 'README.md': text => replaceOnce(text, /^This extension adds support for .*$/m, 'A README of my own.') }),
    },
    {
        label: 'line endings converted to CRLF',
        changesCode: false,
        apply: files => new Map([...files].map(([file, content]) => [file, typeof content === 'string' ? content.replace(/\r?\n/g, '\r\n') : content])),
    },
];

export const CHANGE_PAIRS: readonly ChangePair[] = [
    { label: 'Godot Mod Loader on a plain project', engine: 'godot', from: { addons: [], options: {} }, to: { addons: ['gml'], options: {} } },
    { label: 'MelonLoader on a plain project', engine: 'unity', from: { addons: [], options: {} }, to: { addons: ['melonloader'], options: {} } },
    { label: 'BepInEx next to MelonLoader, which brings the glue', engine: 'unity', from: { addons: ['melonloader'], options: {} }, to: { addons: ['melonloader', 'bepinex'], options: { unityBuild: 'unityil2cpp' } } },
    { label: 'the test add-on next to Godot Mod Loader', engine: 'godot', from: { addons: ['gml'], options: {} }, to: { addons: ['gml', 'everything'], options: { flavour: 'spicy' } } },
];

/** A generated project's files, as an author would have them on disk */
export function generatedProject(values: ProjectValues, choices: AddonChoices, catalogue: Catalogue = TEST_CATALOGUE): ProjectFiles {
    return new Map(renderProject({ ...values, addons: choices.addons, addonOptions: choices.options }, catalogue).map(output => [output.path, output.content]));
}

export function existingProject(files: ReadonlyMap<string, string | Uint8Array>): ExistingProject {
    const manifest = parseLenientJson(String(files.get('package.json') ?? ''));
    return { manifest, record: addonRecordOf(manifest), engine: engineOf(manifest), files };
}

/** @throws Error with the planner's problem if it refuses the change */
export function plannedChange(files: ReadonlyMap<string, string | Uint8Array>, request: AddonChangeRequest, catalogue: Catalogue = TEST_CATALOGUE): AddonChangePlan {
    const result = planAddonChange(existingProject(files), request, catalogue);
    if (!result.ok) {
        throw new Error(result.problem);
    }
    return result.plan;
}

/** The project after the plan is written, as the commands write it */
export function withPlan(files: ReadonlyMap<string, string | Uint8Array>, plan: AddonChangePlan): ProjectFiles {
    const result = new Map(files);
    plan.creates.forEach(output => result.set(output.path, output.content));
    plan.updates.forEach(update => result.set(update.path, update.content));
    plan.deletes.forEach(file => result.delete(file));
    result.set('package.json', applyAddonChange(String(files.get('package.json')), plan.manifest));
    return result;
}

export function addRequest(pair: ChangePair): AddonChangeRequest {
    return { kind: 'add', addons: pair.to.addons.filter(id => !pair.from.addons.includes(id)), options: pair.to.options, engine: pair.engine };
}

export function removeRequest(pair: ChangePair): AddonChangeRequest {
    return { kind: 'remove', addons: pair.to.addons.filter(id => !pair.from.addons.includes(id)) };
}

/** Every author edit on both sides of every pair, added and removed, as the planner writes it */
export function editedProjects(): EditedProject[] {
    const values = (engine: string): ProjectValues => ({ ...TS_FIXTURE_VALUES, engine });
    return CHANGE_PAIRS.flatMap(pair => AUTHOR_EDITS.flatMap(edit => {
        const from = edit.apply(generatedProject(values(pair.engine), pair.from));
        const to = edit.apply(generatedProject(values(pair.engine), pair.to));
        return [
            { label: `${pair.label}, added to ${edit.label}`, kind: 'add' as const, edit, result: withPlan(from, plannedChange(from, addRequest(pair))), expected: to },
            { label: `${pair.label}, removed from ${edit.label}`, kind: 'remove' as const, edit, result: withPlan(to, plannedChange(to, removeRequest(pair))), expected: from },
        ];
    }));
}

function edited(files: ReadonlyMap<string, string | Uint8Array>, changes: Readonly<Record<string, (text: string) => string>>, added: Readonly<Record<string, string>> = {}): ProjectFiles {
    const result = new Map(files);
    for (const [file, change] of Object.entries(changes)) {
        result.set(file, change(String(files.get(file))));
    }
    Object.entries(added).forEach(([file, text]) => result.set(file, text));
    return result;
}

/** @throws Error if the text doesn't have what the edit changes, so an edit can't quietly do nothing */
function replaceOnce(text: string, from: string | RegExp, to: string): string {
    const found = typeof from === 'string' ? text.includes(from) : from.test(text);
    if (!found) {
        throw new Error(`The edit expects ${String(from)} in the file`);
    }
    return text.replace(from, to);
}
