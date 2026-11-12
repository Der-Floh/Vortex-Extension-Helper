export const SLOT_NAMES = [
    'index-imports',
    'index-registrations',
    'constants-plain-installer',
    'inspection-imports',
    'inspection-plain-installer',
    'setup-imports',
    'setup-steps',
] as const;

/** The marked parts of the baseline's templates that a mod loader replaces */
export type SlotName = typeof SLOT_NAMES[number];

export type SlotTexts = Readonly<Partial<Record<SlotName, string>>>;

const SLOT = /^([ \t]*)\/\/ slot:(\S+)\n([\s\S]*?)^[ \t]*\/\/ endslot\n/gm;
const LEFTOVER_MARKER = /^[ \t]*\/\/ (?:slot:\S+|endslot)$/m;

/**
 * Resolves the marked parts of a template. A slot keeps its own lines unless `texts` has a replacement,
 * and the marker comments are always removed.
 *
 * @throws Error if a slot's name is unknown or a marker has no partner.
 */
export function fillSlots(template: string, texts: SlotTexts): string {
    const filled = template.replace(SLOT, (_match, indent: string, name: string, body: string) => {
        if (!isSlotName(name)) {
            throw new Error(`Unknown template slot ${name}`);
        }
        const text = texts[name];
        return text === undefined ? body : indented(text, indent);
    });
    const leftover = LEFTOVER_MARKER.exec(filled);
    if (leftover) {
        throw new Error(`Unbalanced template slot marker "${leftover[0].trim()}"`);
    }
    return filled;
}

function isSlotName(name: string): name is SlotName {
    return (SLOT_NAMES as readonly string[]).includes(name);
}

function indented(text: string, indent: string): string {
    return text ? `${text.split('\n').map(line => line && indent + line).join('\n')}\n` : '';
}
