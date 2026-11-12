import { selectableAddons, type Catalogue } from '../../templates/addons/addon';
import { resolveAddons, type AddonChoices } from '../../templates/addons/resolveAddons';

export interface AddonOutcome {
    readonly label: string;
    readonly choices: AddonChoices;
}

/**
 * Selections that together cover every add-on: none; each one alone; every pair that can be combined;
 * and every largest combination per engine. Each comes with its options' first choices, then once more
 * for every other choice of one option at a time, so the number stays linear in the choices.
 */
export function addonOutcomes(catalogue: Catalogue): readonly AddonOutcome[] {
    const outcomes = new Map<string, AddonOutcome>();
    const add = (addons: readonly string[]) => {
        for (const options of optionVariants(addons, catalogue)) {
            const choices = normalized({ addons, options });
            outcomes.set(outcomeKey(choices), { label: labelOf(choices), choices });
        }
    };
    add([]);
    for (const engine of catalogue.engines) {
        const ids = selectableAddons(catalogue, engine.id).map(addon => addon.manifest.id);
        const compatible = (left: string, right: string) => resolveAddons({ addons: [left, right], options: {} }, catalogue).ok;
        ids.forEach(id => add([id]));
        ids.forEach((left, index) => ids.slice(index + 1).filter(right => compatible(left, right)).forEach(right => add([left, right])));
        largestCombinations(ids, compatible).forEach(add);
    }
    return [...outcomes.values()];
}

/** The same key for the same selection, whatever order its add-ons and options were given in */
export function outcomeKey(choices: AddonChoices): string {
    return JSON.stringify(normalized(choices));
}

function normalized(choices: AddonChoices): AddonChoices {
    return {
        addons: [...choices.addons].sort(),
        options: Object.fromEntries(Object.entries(choices.options).sort(([left], [right]) => left < right ? -1 : 1)),
    };
}

function optionVariants(addons: readonly string[], catalogue: Catalogue): Record<string, string>[] {
    const resolution = resolveAddons({ addons, options: {} }, catalogue);
    if (!resolution.ok) {
        throw new Error(`The selection ${addons.join(' + ')} doesn't resolve: ${resolution.problem}`);
    }
    const options = resolution.resolved.addons.flatMap(addon => Object.entries(addon.manifest.options ?? {}));
    const first = Object.fromEntries(options.map(([id, option]) => [id, option.choices[0].value]));
    return [first, ...options.flatMap(([id, option]) => option.choices.slice(1).map(choice => ({ ...first, [id]: choice.value })))];
}

/** Every set in which each pair can be combined and that no further add-on fits, found by Bron–Kerbosch */
function largestCombinations(ids: readonly string[], compatible: (left: string, right: string) => boolean): string[][] {
    const found: string[][] = [];
    const grow = (chosen: readonly string[], candidates: readonly string[], excluded: readonly string[]) => {
        if (candidates.length === 0 && excluded.length === 0) {
            if (chosen.length > 1) {
                found.push([...chosen]);
            }
            return;
        }
        let remaining = [...candidates];
        let skipped = [...excluded];
        for (const id of candidates) {
            grow([...chosen, id], remaining.filter(other => other !== id && compatible(id, other)), skipped.filter(other => compatible(id, other)));
            remaining = remaining.filter(other => other !== id);
            skipped = [...skipped, id];
        }
    };
    grow([], ids, []);
    return found;
}

function labelOf(choices: AddonChoices): string {
    const options = Object.entries(choices.options).map(([id, value]) => `${id}=${value}`);
    return `${choices.addons.join(' + ') || 'plain'}${options.length > 0 ? ` [${options.join(', ')}]` : ''}`;
}
