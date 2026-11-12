import { findAddon, type Catalogue } from '../templates/addons/addon';

export interface ChecklistOutcome {
    /** The picks from now on */
    readonly picked: readonly string[];
    /** Unticked because something newly ticked can't be combined with them */
    readonly removed: readonly { readonly id: string; readonly by: string }[];
    /** Unticked by the user but kept, because another pick depends on them */
    readonly kept: readonly { readonly id: string; readonly by: string }[];
}

/** The picks plus the visible add-ons they depend on, which the checklists show ticked */
export function tickedAddons(picked: readonly string[], catalogue: Catalogue): Set<string> {
    return new Set([...dependencyClosure(picked, catalogue)].filter(id => !findAddon(catalogue, id)?.manifest.hidden));
}

/**
 * Applies an accepted checklist of one category. A newly ticked add-on unticks whatever can't be
 * combined with it, including a pick that only brings in such an add-on as a dependency.
 */
export function applyChecklist(picked: readonly string[], categoryIds: readonly string[], accepted: readonly string[], catalogue: Catalogue): ChecklistOutcome {
    const before = tickedAddons(picked, catalogue);
    let next = [...new Set([...picked.filter(id => !categoryIds.includes(id)), ...accepted])];
    const removed: { id: string; by: string }[] = [];
    for (const id of accepted.filter(candidate => !before.has(candidate) && next.includes(candidate))) {
        const clashing = next.filter(other => other !== id && [...dependencyClosure([other], catalogue)].some(member => conflicts(id, member, catalogue)));
        removed.push(...clashing.map(other => ({ id: other, by: id })));
        next = next.filter(other => !clashing.includes(other));
    }
    const ticked = tickedAddons(next, catalogue);
    const kept = categoryIds
        .filter(id => before.has(id) && !accepted.includes(id) && ticked.has(id))
        .map(id => ({ id, by: next.find(other => other !== id && dependencyClosure([other], catalogue).has(id)) ?? id }));
    return { picked: next, removed, kept };
}

function dependencyClosure(ids: readonly string[], catalogue: Catalogue): Set<string> {
    const closure = new Set<string>();
    const pending = [...ids];
    while (pending.length > 0) {
        const id = pending.pop()!;
        if (!closure.has(id)) {
            closure.add(id);
            pending.push(...findAddon(catalogue, id)?.manifest.dependsOn ?? []);
        }
    }
    return closure;
}

function conflicts(first: string, second: string, catalogue: Catalogue): boolean {
    return (findAddon(catalogue, first)?.manifest.conflicts?.includes(second) ?? false)
        || (findAddon(catalogue, second)?.manifest.conflicts?.includes(first) ?? false);
}
