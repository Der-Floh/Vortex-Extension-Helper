export interface EngineEntry {
    readonly id: string;
    readonly label: string;
    /** Known games on the engine, shown next to its name */
    readonly examples: string;
}

export interface CategoryEntry {
    readonly id: string;
    readonly label: string;
    readonly description: string;
}

export interface AddonChoice {
    /** What `{{optionId}}` becomes in the add-on's files */
    readonly value: string;
    readonly label: string;
    readonly detail?: string;
    /** Prose for the add-on's README texts, each used as `{{key}}` */
    readonly placeholders?: Readonly<Record<string, string>>;
}

export interface AddonOption {
    readonly title: string;
    readonly placeholder?: string;
    readonly choices: readonly AddonChoice[];
}

export interface ModsPath {
    /** What `path` is relative to: the game folder, or the folder of the game's executable */
    readonly base: 'game' | 'executable';
    readonly path: string;
}

export interface GameHook {
    /** The function `game.ts` exports; `main()` spreads what it returns into `registerGame` */
    readonly export: string;
    /** The `registerGame` fields the function returns, none of which the baseline sets */
    readonly fields: readonly string[];
}

export interface AddonHooks {
    /** Exported by `register.ts` and called with the extension context in `main()` */
    readonly register?: string;
    /** Exported by `setup.ts` and awaited with the discovery and the api in `prepareForModding` */
    readonly setup?: string;
    /** Called with the extension context inside `registerGame` */
    readonly game?: GameHook;
}

export interface AddonPackageJson {
    readonly devDependencies?: Readonly<Record<string, string>>;
    /** Added after the baseline's scripts */
    readonly scripts?: Readonly<Record<string, string>>;
}

/** The contents of an add-on's `addon.json`, described for contributors by `catalogue/addon.schema.json` */
export interface AddonManifest {
    readonly id: string;
    readonly version: string;
    readonly name: string;
    readonly description: string;
    readonly category: string;
    /** Ids from `catalogue/engines.json`; without it the add-on is offered for every engine */
    readonly engines?: readonly string[];
    /** Never offered; only comes in through `dependsOn` or `when` */
    readonly hidden?: boolean;
    readonly dependsOn?: readonly string[];
    readonly conflicts?: readonly string[];
    /** Included automatically once all of these take part */
    readonly when?: readonly string[];
    /** Add-ons whose hooks, README texts and mods folder this one takes over */
    readonly supersedes?: readonly string[];
    readonly replacesPlainInstaller?: boolean;
    readonly modsPath?: ModsPath;
    readonly hooks?: AddonHooks;
    readonly options?: Readonly<Record<string, AddonOption>>;
    readonly readme?: { readonly features?: readonly string[]; readonly notes?: readonly string[] };
    /** Files of the add-on's folder that are written elsewhere in the project, keyed by their path in the folder */
    readonly projectFiles?: Readonly<Record<string, string>>;
    readonly packageJson?: AddonPackageJson;
    /** Names from `VORTEX_LIBRARIES`, added as dev dependencies and to `vortex.externals` */
    readonly vortexLibraries?: readonly string[];
    /** Lines appended to the project's `.gitignore` */
    readonly gitignore?: readonly string[];
}

/** One file of an add-on, relative to its folder with `/` separators; a binary file is carried as base64 */
export interface AddonFile {
    readonly path: string;
    readonly text?: string;
    readonly base64?: string;
}

export interface Addon {
    readonly manifest: AddonManifest;
    /** `addon.md`, the section the add-on adds to the generated README */
    readonly readme?: string;
    readonly files: readonly AddonFile[];
    /** Of everything in the add-on's folder, so `catalogue/addons.lock.json` notices a change */
    readonly hash: string;
}

export interface Catalogue {
    readonly engines: readonly EngineEntry[];
    readonly categories: readonly CategoryEntry[];
    readonly addons: readonly Addon[];
}

/** The modules a hook's function has to be exported from, relative to the add-on's folder */
export const HOOK_MODULES: Readonly<Record<keyof AddonHooks, string>> = Object.freeze({
    register: 'register.ts',
    setup: 'setup.ts',
    game: 'game.ts',
});

/** The fields the baseline's `registerGame` sets, which no game hook may return */
export const BASELINE_GAME_FIELDS: readonly string[] = Object.freeze([
    'id', 'name', 'mergeMods', 'queryPath', 'supportedTools', 'queryModPath', 'logo', 'executable', 'requiredFiles', 'setup', 'environment', 'details',
]);

/** The function a hook calls, which its module has to export */
export function hookFunction(hooks: AddonHooks | undefined, hook: keyof AddonHooks): string | undefined {
    return hook === 'game' ? hooks?.game?.export : hooks?.[hook];
}

export function findAddon(catalogue: Catalogue, id: string): Addon | undefined {
    return catalogue.addons.find(addon => addon.manifest.id === id);
}

export function supportsEngine(addon: Addon, engineId: string): boolean {
    return addon.manifest.engines === undefined || addon.manifest.engines.includes(engineId);
}

/** The add-ons and everything they depend on, through `dependsOn` */
export function dependencyClosure(ids: readonly string[], catalogue: Catalogue): Set<string> {
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

/** The add-ons the wizard offers for an engine, in catalogue order */
export function selectableAddons(catalogue: Catalogue, engineId: string): readonly Addon[] {
    return catalogue.addons.filter(addon => !addon.manifest.hidden && supportsEngine(addon, engineId));
}

/** Names joined the way a sentence lists them: "A", "A and B", "A, B and C" */
export function listing(names: readonly string[]): string {
    return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}
