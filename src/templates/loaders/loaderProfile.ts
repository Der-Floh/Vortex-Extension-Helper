import * as path from 'path';
import type { ProjectValues } from '../../types/project';
import type { GeneratedFileSpec } from '../fileSpec';
import type { SlotTexts } from '../slots';

/** What one selection of mod loaders adds to and changes in the baseline */
export interface LoaderProfile {
    readonly files: readonly GeneratedFileSpec[];
    readonly slots: SlotTexts;
    /** The folder Vortex deploys a mod to unless its mod type says otherwise, relative to the game folder */
    modsPath(executable: string): string;
    /** The sentence in the doc comment of `main()` */
    readonly entryDescription: string;
    /** The sentence in the doc comment of `prepareForModding` */
    readonly setupDescription: string;
    readonly readme: {
        /** README bullets about installing mods */
        readonly features: string;
        /** The development note about where mods go */
        readonly modsNote: string;
        /** The README sections about the loader, ending with a blank line; empty for none */
        section(values: ProjectValues): string;
    };
}

interface LoaderEntryPoints {
    /** The folder below `src/` that holds `register.ts` and `setup.ts` */
    readonly folder: string;
    readonly register: string;
    readonly prepare: string;
}

/** The wiring of a loader into the baseline's `main()` and `prepareForModding`, the same for every loader */
export function loaderSlots({ folder, register, prepare }: LoaderEntryPoints): SlotTexts {
    return {
        'index-imports': importLines([
            ['GAME', './common/constants'],
            ['findGame', './detection/discovery'],
            [register, `./${folder}/register`],
        ]),
        'index-registrations': `${register}(context);`,
        'constants-plain-installer': '',
        'inspection-imports': '',
        'inspection-plain-installer': '',
        'setup-imports': importLines([
            ['GAME', '../common/constants'],
            ['ensureWritableDirOrWarn', '../common/notifications'],
            ['resolveGamePath', '../detection/discovery'],
            [prepare, `../${folder}/setup`],
        ]),
        'setup-steps': `await ${prepare}(discovery, api);`,
    };
}

/** A folder next to the game's executable, relative to the game folder and with forward slashes like the rest of `GAME` */
export function nextToExecutable(executable: string, folder: string): string {
    return path.posix.join(path.posix.dirname(executable), folder);
}

function importLines(imports: readonly (readonly [name: string, from: string])[]): string {
    return [...imports]
        .sort(([, left], [, right]) => left.localeCompare(right))
        .map(([name, from]) => `import { ${name} } from '${from}';`)
        .join('\n');
}
