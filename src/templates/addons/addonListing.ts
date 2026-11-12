import type { AddonListing, AddonRecord, AddonSummary } from '../../types/project';
import { findAddon, selectableAddons, supportsEngine, type Addon, type Catalogue } from './addon';
import { resolveAddons } from './resolveAddons';

/** The add-ons that can still join a project with these add-ons, for its engine */
export function offeredAddons(engineId: string, present: readonly string[], catalogue: Catalogue): readonly Addon[] {
    return selectableAddons(catalogue, engineId).filter(addon => !present.includes(addon.manifest.id) && joins(addon, present, catalogue));
}

/** The engine a project records, or else the one all its add-ons are for */
export function projectEngine(recorded: string | undefined, record: AddonRecord | undefined, catalogue: Catalogue): string | undefined {
    if (recorded) {
        return recorded;
    }
    const addons = Object.keys(record?.addons ?? {}).map(id => findAddon(catalogue, id)).filter((addon): addon is Addon => addon !== undefined);
    const engines = addons.length === 0 ? [] : catalogue.engines.filter(engine => addons.every(addon => supportsEngine(addon, engine.id)));
    return engines.length === 1 ? engines[0].id : undefined;
}

/** What the sidebar shows of a project's add-ons and of those it could add */
export function addonListing(recorded: string | undefined, record: AddonRecord | undefined, catalogue: Catalogue): AddonListing {
    const engineId = projectEngine(recorded, record, catalogue);
    const present = Object.keys(record?.addons ?? {});
    const added = present.flatMap((id): AddonListing['added'] => {
        const addon = findAddon(catalogue, id);
        if (!addon || addon.manifest.hidden) {
            return addon ? [] : [{ id, name: id, description: 'Not known to this version of the helper', category: '', version: record!.addons[id], unknown: true }];
        }
        const version = record!.addons[id];
        return [{ ...summaryOf(addon, catalogue), version, ...(version === addon.manifest.version ? {} : { current: addon.manifest.version }) }];
    });
    if (engineId === undefined) {
        return { added, available: [], blocked: [], grouped: false };
    }
    const candidates = selectableAddons(catalogue, engineId).filter(addon => !present.includes(addon.manifest.id));
    const available = candidates.filter(addon => joins(addon, present, catalogue)).map(addon => summaryOf(addon, catalogue));
    const blocked = candidates.filter(addon => !joins(addon, present, catalogue)).map(addon => ({ ...summaryOf(addon, catalogue), reason: reasonOf(addon, present, catalogue) }));
    const categories = new Set([...added, ...available, ...blocked].map(row => row.category).filter(category => category));
    return { engine: catalogue.engines.find(engine => engine.id === engineId)?.label ?? engineId, added, available, blocked, grouped: categories.size > 1 };
}

function joins(addon: Addon, present: readonly string[], catalogue: Catalogue): boolean {
    return resolveAddons({ addons: [...present, addon.manifest.id], options: {} }, catalogue).ok;
}

function reasonOf(addon: Addon, present: readonly string[], catalogue: Catalogue): string {
    const resolution = resolveAddons({ addons: [...present, addon.manifest.id], options: {} }, catalogue);
    return resolution.ok ? '' : resolution.problem;
}

function summaryOf(addon: Addon, catalogue: Catalogue): AddonSummary {
    return {
        id: addon.manifest.id,
        name: addon.manifest.name,
        description: addon.manifest.description,
        category: catalogue.categories.find(category => category.id === addon.manifest.category)?.label ?? addon.manifest.category,
    };
}
