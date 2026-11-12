import * as path from 'path';
import { SOURCE_FOLDER, VORTEX_LIBRARIES } from '../../constants';
import type { AddonRecord } from '../../types/project';
import { spec, type GeneratedFileSpec } from '../fileSpec';
import type { PackageAdditions } from '../packageJson';
import { placeholderKeys, RESTORE_KEYS } from '../render';
import type { SlotTexts } from '../slots';
import { HOOK_MODULES, hookFunction, listing, type Addon, type AddonHooks } from './addon';
import { NO_ADDONS, type ResolvedAddons } from './resolveAddons';

export const PLAIN_MODS_PATH = 'mods';
const PLAIN_ENTRY_DESCRIPTION = 'Registers the game and the installer for its mods.';
const PLAIN_SETUP_DESCRIPTION = 'Ensures the mods folder exists and is writable.';
const PLAIN_FEATURE = 'Installs mods into the game\'s mods folder.';
const PLAIN_NOTE = '`GAME.modsPath` and `MOD_FILES.extensions` in `src/common/constants.ts` decide where mods are installed and which files count as mods. Check both for {{gameName}}.';
const PLAIN_REGISTRATION = 'context.registerInstaller(INSTALLERS.mods.id, INSTALLERS.mods.priority, testSupportedMods, installMods);';
const BULLET = '- ';

interface ImportLine {
    readonly names: string;
    readonly from: string;
}

interface HookCall {
    readonly name: string;
    /** Relative to `src`, without the extension */
    readonly module: string;
}

const ENTRY_IMPORTS: readonly ImportLine[] = [
    { names: 'GAME', from: './common/constants' },
    { names: 'findGame', from: './detection/discovery' },
];
const PLAIN_ENTRY_IMPORTS: readonly ImportLine[] = [
    { names: 'GAME, INSTALLERS', from: './common/constants' },
    { names: 'findGame', from: './detection/discovery' },
    { names: 'installMods, testSupportedMods', from: './installers/mods' },
];
const SETUP_IMPORTS: readonly ImportLine[] = [
    { names: 'GAME', from: '../common/constants' },
    { names: 'ensureWritableDirOrWarn', from: '../common/notifications' },
    { names: 'resolveGamePath', from: '../detection/discovery' },
];
const PLAIN_INSTALLER_REMOVED: SlotTexts = Object.freeze({ 'constants-plain-installer': '', 'inspection-imports': '', 'inspection-plain-installer': '' });

/** What a set of add-ons makes of the baseline */
export interface Composition {
    readonly keepsPlainInstaller: boolean;
    readonly slots: SlotTexts;
    /** The add-ons' files at their place in the project */
    readonly files: readonly GeneratedFileSpec[];
    /** The folder Vortex deploys a mod to unless its mod type says otherwise, relative to the game folder */
    modsPath(executable: string): string;
    /** The sentence in the doc comment of `main()` */
    readonly entryDescription: string;
    /** The sentence in the doc comment of `prepareForModding` */
    readonly setupDescription: string;
    /** The README texts, before their placeholders are filled */
    readonly readme: { readonly features: string; readonly notes: string; readonly sections: string };
    /** Every option's value and its choice's prose, before placeholders in the prose are filled */
    readonly optionValues: Readonly<Record<string, string>>;
    readonly packageJson: PackageAdditions;
    /** What the add-ons append to `.gitignore`; empty when they add nothing */
    readonly gitignore: string;
}

export function composeAddons(resolved: ResolvedAddons): Composition {
    const wired = resolved.addons.filter(addon => !resolved.superseded.has(addon.manifest.id));
    const keepsPlainInstaller = !resolved.addons.some(addon => addon.manifest.replacesPlainInstaller);
    const optionValues = optionPlaceholders(resolved);
    return {
        keepsPlainInstaller,
        slots: slotTexts(wired, keepsPlainInstaller),
        files: resolved.addons.flatMap(addon => addonFiles(addon, resolved.superseded.has(addon.manifest.id), Object.keys(optionValues))),
        modsPath: modsPathOf(wired),
        entryDescription: entryDescription(resolved.addons, keepsPlainInstaller),
        setupDescription: setupDescription(resolved.addons, wired),
        readme: readmeTexts(wired, keepsPlainInstaller),
        optionValues,
        packageJson: packageAdditions(resolved),
        gitignore: gitignoreText(resolved.addons),
    };
}

export const PLAIN_COMPOSITION: Composition = composeAddons(NO_ADDONS);

/** A folder next to the game's executable, relative to the game folder and with forward slashes like the rest of `GAME` */
export function nextToExecutable(executable: string, folder: string): string {
    return path.posix.join(path.posix.dirname(executable), folder);
}

function slotTexts(wired: readonly Addon[], keepsPlainInstaller: boolean): SlotTexts {
    const registers = hookCalls(wired, 'register');
    const games = hookCalls(wired, 'game');
    const setups = hookCalls(wired, 'setup');
    return {
        ...entrySlots(registers, games, keepsPlainInstaller),
        ...(keepsPlainInstaller ? {} : PLAIN_INSTALLER_REMOVED),
        ...(games.length > 0 ? { 'game-fields': games.map(call => `...${call.name}(context),`).join('\n') } : {}),
        ...(setups.length > 0 ? setupSlots(setups) : {}),
    };
}

function entrySlots(registers: readonly HookCall[], games: readonly HookCall[], keepsPlainInstaller: boolean): SlotTexts {
    if (keepsPlainInstaller && registers.length === 0 && games.length === 0) {
        return {};
    }
    const baseline = keepsPlainInstaller ? PLAIN_ENTRY_IMPORTS : ENTRY_IMPORTS;
    return {
        'index-imports': importLines([...baseline, ...[...registers, ...games].map(call => ({ names: call.name, from: `./${call.module}` }))]),
        'index-registrations': [...(keepsPlainInstaller ? [PLAIN_REGISTRATION] : []), ...registers.map(call => `${call.name}(context);`)].join('\n'),
    };
}

function setupSlots(setups: readonly HookCall[]): SlotTexts {
    return {
        'setup-imports': importLines([...SETUP_IMPORTS, ...setups.map(call => ({ names: call.name, from: `../${call.module}` }))]),
        'setup-steps': setups.map(call => `await ${call.name}(discovery, api);`).join('\n'),
    };
}

function hookCalls(wired: readonly Addon[], hook: keyof AddonHooks): readonly HookCall[] {
    return wired.flatMap(addon => {
        const name = hookFunction(addon.manifest.hooks, hook);
        return name ? [{ name, module: `${addon.manifest.id}/${path.posix.parse(HOOK_MODULES[hook]).name}` }] : [];
    });
}

/** Sorted by module, compared by code unit so the order doesn't depend on the machine's locale */
function importLines(imports: readonly ImportLine[]): string {
    return [...imports]
        .sort((left, right) => left.from < right.from ? -1 : left.from > right.from ? 1 : 0)
        .map(({ names, from }) => `import { ${names} } from '${from}';`)
        .join('\n');
}

/** A superseded add-on keeps its files, except the hook modules whose wiring the superseding add-on took over */
function addonFiles(addon: Addon, superseded: boolean, optionKeys: readonly string[]): GeneratedFileSpec[] {
    const hookModules: readonly string[] = Object.values(HOOK_MODULES);
    const restoreKeys = new Set([...RESTORE_KEYS, ...optionKeys]);
    return addon.files
        .filter(file => !(superseded && hookModules.includes(file.path)))
        .map(file => {
            const keys = file.text === undefined ? [] : placeholderKeys(file.text);
            return spec(outputPathOf(addon, file.path), file.text ?? new Uint8Array(Buffer.from(file.base64 ?? '', 'base64')), {
                templated: keys.length > 0,
                restorable: keys.every(key => restoreKeys.has(key)),
            });
        });
}

/** Where a file of an add-on's folder is written: in `src/<id>/`, unless `projectFiles` puts it elsewhere */
export function outputPathOf(addon: Addon, file: string): string {
    const moved = addon.manifest.projectFiles;
    return moved && Object.hasOwn(moved, file) ? moved[file] : `${SOURCE_FOLDER}/${addon.manifest.id}/${file}`;
}

function modsPathOf(wired: readonly Addon[]): (executable: string) => string {
    const owned = wired.find(addon => addon.manifest.modsPath)?.manifest.modsPath;
    if (!owned) {
        return () => PLAIN_MODS_PATH;
    }
    return executable => owned.base === 'executable' ? nextToExecutable(executable, owned.path) : owned.path;
}

function visibleNames(addons: readonly Addon[]): string[] {
    return addons.filter(addon => !addon.manifest.hidden).map(addon => addon.manifest.name);
}

function entryDescription(addons: readonly Addon[], keepsPlainInstaller: boolean): string {
    const names = visibleNames(addons);
    if (names.length === 0) {
        return PLAIN_ENTRY_DESCRIPTION;
    }
    const parts = [...(keepsPlainInstaller ? ['the installer for its mods'] : []), `the support for ${listing(names)}`];
    return `Registers the game and ${listing(parts)}.`;
}

function setupDescription(addons: readonly Addon[], wired: readonly Addon[]): string {
    const prepared = visibleNames(addons.filter(addon => runsSetup(addon, wired)));
    return prepared.length === 0
        ? PLAIN_SETUP_DESCRIPTION
        : `Ensures the mods folder exists and is writable, then runs the setup for ${listing(prepared)}.`;
}

/** An add-on's setup runs through its own hook, or through the hook of the add-on that took it over */
function runsSetup(addon: Addon, wired: readonly Addon[]): boolean {
    return wired.some(candidate => candidate.manifest.hooks?.setup !== undefined
        && (candidate === addon || candidate.manifest.supersedes?.includes(addon.manifest.id)));
}

function readmeTexts(wired: readonly Addon[], keepsPlainInstaller: boolean): Composition['readme'] {
    const bullets = (lines: readonly string[]) => lines.map(line => BULLET + line).join('\n');
    return {
        features: bullets([...(keepsPlainInstaller ? [PLAIN_FEATURE] : []), ...wired.flatMap(addon => addon.manifest.readme?.features ?? [])]),
        notes: bullets([...(keepsPlainInstaller ? [PLAIN_NOTE] : []), ...wired.flatMap(addon => addon.manifest.readme?.notes ?? [])]),
        sections: wired.flatMap(addon => addon.readme === undefined ? [] : [`${addon.readme.trim()}\n\n`]).join(''),
    };
}

function optionPlaceholders(resolved: ResolvedAddons): Record<string, string> {
    return Object.fromEntries(resolved.addons.flatMap(addon => Object.entries(addon.manifest.options ?? {}).flatMap(([id, option]) => {
        const value = resolved.options[id];
        const choice = option.choices.find(candidate => candidate.value === value);
        return [[id, value], ...Object.entries(choice?.placeholders ?? {})];
    })));
}

/** Every add-on's additions, including a superseded one's, whose files stay in the project */
function packageAdditions(resolved: ResolvedAddons): PackageAdditions {
    const { addons } = resolved;
    const libraries = [...new Set(addons.flatMap(addon => addon.manifest.vortexLibraries ?? []))];
    return {
        record: addons.length > 0 ? recordOf(resolved) : undefined,
        devDependencies: Object.fromEntries([
            ...addons.flatMap(addon => Object.entries(addon.manifest.packageJson?.devDependencies ?? {})),
            ...libraries.map(name => [name, librarySource(name)]),
        ]),
        scripts: Object.fromEntries(addons.flatMap(addon => Object.entries(addon.manifest.packageJson?.scripts ?? {}))),
        externals: libraries,
    };
}

/** @throws Error if Vortex doesn't provide the library */
function librarySource(name: string): string {
    const library = VORTEX_LIBRARIES.find(candidate => candidate.name === name);
    if (!library) {
        throw new Error(`${name} isn't a library Vortex provides.`);
    }
    return library.source;
}

function gitignoreText(addons: readonly Addon[]): string {
    return addons.flatMap(addon => addon.manifest.gitignore ? [`\n# ${addon.manifest.name}\n${addon.manifest.gitignore.join('\n')}\n`] : []).join('');
}

function recordOf(resolved: ResolvedAddons): AddonRecord {
    return {
        addons: Object.fromEntries(resolved.addons.map(addon => [addon.manifest.id, addon.manifest.version])),
        options: { ...resolved.options },
    };
}
