import * as vscode from 'vscode';
import { findAddon, listing, selectableAddons, type Addon, type AddonOption, type Catalogue, type CategoryEntry, type EngineEntry } from '../templates/addons/addon';
import { DISCOVERED_CATALOGUE } from '../templates/addons/discoveredCatalogue';
import { resolveAddons } from '../templates/addons/resolveAddons';
import type { ProjectValues } from '../types/project';
import { showInfo } from '../utils/notifications';
import { applyChecklist, tickedAddons, type ChecklistOutcome } from './addonSelection';

export type AddonAnswers = Required<Pick<ProjectValues, 'addons' | 'addonOptions'>>;

/** The id of the menu's first entry, which ends the add-on questions */
export const MENU_DONE = '';
const NOTHING_PICKED = 'No add-ons: the extension copies mod files into a folder';

export interface MenuEntry {
    readonly id: string;
    readonly label: string;
    readonly description: string;
    readonly detail?: string;
}

export interface ChecklistItem {
    readonly addon: Addon;
    readonly ticked: boolean;
}

/** The wizard's questions about the engine and the add-ons; each resolves to undefined when it is cancelled */
export interface AddonPromptUi {
    pickEngine(engines: readonly EngineEntry[]): Thenable<EngineEntry | undefined>;
    /** @returns The picked entry's id, `MENU_DONE` for Done */
    pickFromMenu(engine: EngineEntry, entries: readonly MenuEntry[]): Thenable<string | undefined>;
    /** @returns The ids of the ticked add-ons */
    pickInChecklist(engine: EngineEntry, category: CategoryEntry, items: readonly ChecklistItem[]): Thenable<readonly string[] | undefined>;
    pickOption(addon: Addon, option: AddonOption): Thenable<string | undefined>;
    tell(message: string): void;
}

/**
 * Asks for the engine, then for the add-ons: a menu of the engine's categories, each opening a checklist,
 * until Done. With add-ons in a single category its checklist comes directly. Then the options of the add-ons.
 *
 * @returns The picks and the answers, none for a plain project, or undefined if the user cancels.
 */
export async function askAddons(catalogue: Catalogue = DISCOVERED_CATALOGUE, ui: AddonPromptUi = VSCODE_ADDON_PROMPTS): Promise<AddonAnswers | undefined> {
    const engine = await ui.pickEngine(catalogue.engines);
    if (!engine) {
        return undefined;
    }
    const picked = await askPicks(engine, catalogue, ui);
    if (!picked) {
        return undefined;
    }
    const options = await askOptions(picked, catalogue, ui);
    return options ? { addons: picked, addonOptions: options } : undefined;
}

async function askPicks(engine: EngineEntry, catalogue: Catalogue, ui: AddonPromptUi): Promise<readonly string[] | undefined> {
    const addons = selectableAddons(catalogue, engine.id);
    const categories = catalogue.categories.filter(category => addons.some(addon => addon.manifest.category === category.id));
    if (categories.length === 0) {
        return [];
    }
    return categories.length === 1
        ? askSingleChecklist(engine, categories[0], addons, catalogue, ui)
        : askThroughMenu(engine, categories, addons, catalogue, ui);
}

async function askSingleChecklist(engine: EngineEntry, category: CategoryEntry, addons: readonly Addon[], catalogue: Catalogue, ui: AddonPromptUi): Promise<readonly string[] | undefined> {
    let picked: readonly string[] = [];
    for (;;) {
        const accepted = await ui.pickInChecklist(engine, category, checklist(category, addons, picked, catalogue));
        if (accepted === undefined) {
            return undefined;
        }
        picked = applied(applyChecklist(picked, idsIn(category, addons), accepted, catalogue), catalogue, ui);
        const problem = conflictOf(picked, catalogue);
        if (!problem) {
            return picked;
        }
        ui.tell(problem);
    }
}

async function askThroughMenu(engine: EngineEntry, categories: readonly CategoryEntry[], addons: readonly Addon[], catalogue: Catalogue, ui: AddonPromptUi): Promise<readonly string[] | undefined> {
    let picked: readonly string[] = [];
    for (;;) {
        const choice = await ui.pickFromMenu(engine, menu(categories, addons, picked, catalogue));
        if (choice === undefined) {
            return undefined;
        }
        if (choice === MENU_DONE) {
            const problem = conflictOf(picked, catalogue);
            if (!problem) {
                return picked;
            }
            ui.tell(problem);
            continue;
        }
        const category = categories.find(candidate => candidate.id === choice);
        const accepted = category ? await ui.pickInChecklist(engine, category, checklist(category, addons, picked, catalogue)) : undefined;
        if (category && accepted !== undefined) {
            picked = applied(applyChecklist(picked, idsIn(category, addons), accepted, catalogue), catalogue, ui);
        }
    }
}

async function askOptions(picked: readonly string[], catalogue: Catalogue, ui: AddonPromptUi): Promise<Record<string, string> | undefined> {
    const resolution = resolveAddons({ addons: picked, options: {} }, catalogue);
    const answers: Record<string, string> = {};
    for (const addon of resolution.ok ? resolution.resolved.addons : []) {
        for (const [id, option] of Object.entries(addon.manifest.options ?? {})) {
            const value = await ui.pickOption(addon, option);
            if (value === undefined) {
                return undefined;
            }
            answers[id] = value;
        }
    }
    return answers;
}

function menu(categories: readonly CategoryEntry[], addons: readonly Addon[], picked: readonly string[], catalogue: Catalogue): MenuEntry[] {
    const ticked = tickedAddons(picked, catalogue);
    const namesIn = (ids: readonly string[]) => ids.filter(id => ticked.has(id)).map(id => findAddon(catalogue, id)!.manifest.name);
    const all = namesIn(addons.map(addon => addon.manifest.id));
    return [
        { id: MENU_DONE, label: 'Done', description: all.length > 0 ? listing(all) : NOTHING_PICKED },
        ...categories.map(category => {
            const names = namesIn(idsIn(category, addons));
            const count = idsIn(category, addons).length;
            return {
                id: category.id,
                label: category.label,
                description: names.length > 0 ? listing(names) : `${count} add-on${count === 1 ? '' : 's'}`,
                detail: category.description,
            };
        }),
    ];
}

function checklist(category: CategoryEntry, addons: readonly Addon[], picked: readonly string[], catalogue: Catalogue): ChecklistItem[] {
    const ticked = tickedAddons(picked, catalogue);
    return addons.filter(addon => addon.manifest.category === category.id).map(addon => ({ addon, ticked: ticked.has(addon.manifest.id) }));
}

function idsIn(category: CategoryEntry, addons: readonly Addon[]): string[] {
    return addons.filter(addon => addon.manifest.category === category.id).map(addon => addon.manifest.id);
}

/** Tells the user what a checklist changed besides what they ticked */
function applied(outcome: ChecklistOutcome, catalogue: Catalogue, ui: AddonPromptUi): readonly string[] {
    const name = (id: string) => findAddon(catalogue, id)?.manifest.name ?? id;
    outcome.removed.forEach(({ id, by }) => ui.tell(`Unticked ${name(id)}, which can't be combined with ${name(by)}.`));
    outcome.kept.forEach(({ id, by }) => ui.tell(`${name(id)} stays ticked, because ${name(by)} needs it.`));
    return outcome.picked;
}

function conflictOf(picked: readonly string[], catalogue: Catalogue): string | undefined {
    const resolution = resolveAddons({ addons: picked, options: {} }, catalogue);
    return resolution.ok ? undefined : resolution.problem;
}

const VSCODE_ADDON_PROMPTS: AddonPromptUi = {
    async pickEngine(engines) {
        const picked = await vscode.window.showQuickPick(
            engines.map(engine => ({ label: engine.label, description: engine.examples, engine })),
            { title: 'Game engine', placeHolder: 'Which engine does the game use?', ignoreFocusOut: true },
        );
        return picked?.engine;
    },

    async pickFromMenu(engine, [done, ...categories]) {
        const items: (vscode.QuickPickItem & { readonly id?: string })[] = [
            { ...done },
            { label: '', kind: vscode.QuickPickItemKind.Separator },
            ...categories.map(entry => ({ ...entry })),
        ];
        const picked = await vscode.window.showQuickPick(items, {
            title: `Add-ons for ${engine.label}`,
            placeHolder: 'Pick a category to choose its add-ons, or Done to go on',
            matchOnDescription: true,
            ignoreFocusOut: true,
        });
        return picked?.id;
    },

    async pickInChecklist(engine, category, items) {
        const picked = await vscode.window.showQuickPick(
            items.map(({ addon, ticked }) => ({ label: addon.manifest.name, detail: addon.manifest.description, picked: ticked, id: addon.manifest.id })),
            { title: `${category.label} for ${engine.label}`, placeHolder: 'Tick what the extension should include', canPickMany: true, ignoreFocusOut: true },
        );
        return picked?.map(item => item.id);
    },

    async pickOption(_addon, option) {
        const picked = await vscode.window.showQuickPick(
            option.choices.map(choice => ({ label: choice.label, detail: choice.detail, value: choice.value })),
            { title: option.title, placeHolder: option.placeholder, ignoreFocusOut: true },
        );
        return picked?.value;
    },

    tell: message => showInfo(message),
};
