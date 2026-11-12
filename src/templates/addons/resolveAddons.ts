import type { AddonRecord } from '../../types/project';
import { findAddon, listing, type Addon, type Catalogue } from './addon';

/** What the wizard asks for: the picked add-ons and the answers to their options */
export interface AddonChoices {
    readonly addons: readonly string[];
    readonly options: Readonly<Record<string, string>>;
}

export interface ResolvedAddons {
    /** Every add-on that takes part, each after the add-ons it depends on, combines or takes over */
    readonly addons: readonly Addon[];
    /** The ids whose hooks, README texts and mods folder another add-on took over */
    readonly superseded: ReadonlySet<string>;
    /** A value for every option of the add-ons */
    readonly options: Readonly<Record<string, string>>;
}

export type Resolution =
    | { readonly ok: true; readonly resolved: ResolvedAddons }
    | { readonly ok: false; readonly problem: string };

export const NO_ADDONS: ResolvedAddons = Object.freeze({ addons: [], superseded: new Set<string>(), options: {} });

/** The full set for a selection: what the picks depend on, and the glue add-ons whose `when` they satisfy */
export function resolveAddons(choices: AddonChoices, catalogue: Catalogue): Resolution {
    const unknown = choices.addons.filter(id => !findAddon(catalogue, id));
    if (unknown.length > 0) {
        return failure(`No add-on is called ${listing(unknown)}.`);
    }
    return complete(expand(choices.addons, catalogue), choices.options, catalogue);
}

/** Exactly the set a project recorded, so a later release can't change what an old project gets */
export function resolveRecord(record: AddonRecord, catalogue: Catalogue): Resolution {
    const mismatches = Object.entries(record.addons).flatMap(([id, version]) => {
        const addon = findAddon(catalogue, id);
        if (!addon) {
            return [`${id} ${version}, which this version doesn't have`];
        }
        return addon.manifest.version === version ? [] : [`${addon.manifest.name} ${version}, which this version has as ${addon.manifest.version}`];
    });
    if (mismatches.length > 0) {
        return failure(`The project was generated with ${listing(mismatches)}.`);
    }
    return complete(new Set(Object.keys(record.addons)), record.options, catalogue);
}

/** The set a project recorded, in this version's definitions whatever versions it names; it fails only for an add-on this version doesn't know */
export function resolveRecordedSet(record: AddonRecord, catalogue: Catalogue): Resolution {
    const unknown = Object.keys(record.addons).filter(id => !findAddon(catalogue, id));
    if (unknown.length > 0) {
        return failure(`The project has ${listing(unknown)}, which this version doesn't know.`);
    }
    return complete(new Set(Object.keys(record.addons)), record.options, catalogue);
}

function expand(picked: readonly string[], catalogue: Catalogue): Set<string> {
    const active = new Set(picked);
    let changed = true;
    while (changed) {
        changed = false;
        for (const addon of catalogue.addons) {
            const id = addon.manifest.id;
            const needed = [...active].some(activeId => findAddon(catalogue, activeId)?.manifest.dependsOn?.includes(id));
            const triggered = addon.manifest.when !== undefined && addon.manifest.when.every(member => active.has(member));
            if (!active.has(id) && (needed || triggered)) {
                active.add(id);
                changed = true;
            }
        }
    }
    return active;
}

function complete(active: ReadonlySet<string>, given: Readonly<Record<string, string>>, catalogue: Catalogue): Resolution {
    const addons = ordered(active, catalogue);
    const conflict = findConflict(addons);
    if (conflict) {
        return failure(`${conflict[0].manifest.name} can't be combined with ${conflict[1].manifest.name}.`);
    }
    const options = optionValues(addons, given);
    if (typeof options === 'string') {
        return failure(options);
    }
    const superseded = new Set(addons.flatMap(addon => addon.manifest.supersedes ?? []).filter(id => active.has(id)));
    return { ok: true, resolved: { addons, superseded, options } };
}

/** Each add-on after everything it depends on, combines or takes over; ties in id order, so the output never changes */
function ordered(active: ReadonlySet<string>, catalogue: Catalogue): Addon[] {
    const addons = catalogue.addons.filter(addon => active.has(addon.manifest.id));
    const before = (addon: Addon) => [...addon.manifest.dependsOn ?? [], ...addon.manifest.when ?? [], ...addon.manifest.supersedes ?? []]
        .filter(id => active.has(id));
    const result: Addon[] = [];
    const placed = new Set<string>();
    while (result.length < addons.length) {
        const ready = addons
            .filter(addon => !placed.has(addon.manifest.id) && before(addon).every(id => placed.has(id)))
            .sort((left, right) => compareIds(left.manifest.id, right.manifest.id));
        if (ready.length === 0) {
            throw new Error(`The add-ons ${listing(addons.filter(addon => !placed.has(addon.manifest.id)).map(addon => addon.manifest.id))} depend on each other.`);
        }
        ready.forEach(addon => placed.add(addon.manifest.id));
        result.push(...ready);
    }
    return result;
}

function findConflict(addons: readonly Addon[]): readonly [Addon, Addon] | undefined {
    for (const addon of addons) {
        const other = addons.find(candidate => candidate !== addon && (
            addon.manifest.conflicts?.includes(candidate.manifest.id) || candidate.manifest.conflicts?.includes(addon.manifest.id)));
        if (other) {
            return [addon, other];
        }
    }
    return undefined;
}

/** @returns A value for every option, the first choice where none was given, or a problem */
function optionValues(addons: readonly Addon[], given: Readonly<Record<string, string>>): Record<string, string> | string {
    const values: Record<string, string> = {};
    for (const addon of addons) {
        for (const [id, option] of Object.entries(addon.manifest.options ?? {})) {
            const value = given[id] ?? option.choices[0].value;
            if (!option.choices.some(choice => choice.value === value)) {
                return `${value} isn't a choice of ${addon.manifest.name}'s ${option.title}.`;
            }
            values[id] = value;
        }
    }
    return values;
}

function compareIds(left: string, right: string): number {
    return left < right ? -1 : left > right ? 1 : 0;
}

function failure(problem: string): Resolution {
    return { ok: false, problem };
}
