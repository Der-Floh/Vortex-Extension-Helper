import type * as vscode from 'vscode';

/** A workspace folder that holds a Vortex game extension */
export interface VortexProject {
    readonly folder: vscode.WorkspaceFolder;
}

/** What a sidebar row passes to the command it runs; the command palette passes nothing */
export interface ProjectTarget {
    readonly project?: VortexProject;
}

/** A library Vortex provides at runtime, which a game extension can require without bundling it */
export interface VortexLibrary {
    readonly name: string;
    readonly source: string;
    readonly description: string;
}

/** What a sidebar row passes to the commands that install or remove a library */
export interface LibraryTarget extends ProjectTarget {
    readonly library?: VortexLibrary;
}

/** The answers of the New Game Support Extension wizard */
export interface ProjectValues {
    readonly shortName: string;
    /** The Nexus Mods domain, which Vortex uses as the game id */
    readonly gameId: string;
    readonly gameName: string;
    /** The game's numerical Nexus Mods id; undefined leaves `gameId` out of package.json */
    readonly nexusGameId?: number;
    readonly author: string;
    /** Empty or undefined writes the placeholder */
    readonly steamAppId?: string;
    /** Empty or undefined writes the placeholder */
    readonly executable?: string;
    /** The id of the game's engine, from `catalogue/engines.json`, recorded so add-ons can be offered later */
    readonly engine?: string;
    /** The add-ons the user picked; what they depend on is added when the project is rendered */
    readonly addons?: readonly string[];
    /** The answers to the add-ons' options, by option id */
    readonly addonOptions?: Readonly<Record<string, string>>;
}

/** What a project's package.json records in `vortex.addons` and `vortex.addonOptions` */
export interface AddonRecord {
    /** Every add-on of the project, including the ones brought in by others, with its version */
    readonly addons: Readonly<Record<string, string>>;
    readonly options: Readonly<Record<string, string>>;
}

/** Names to add with their values, and names to take out while they still have the given values */
export interface EntryChange {
    readonly add: Readonly<Record<string, string>>;
    readonly remove: Readonly<Record<string, string>>;
}

/** What adding or removing add-ons changes in a project's package.json */
export interface AddonManifestChange {
    /** `vortex.addons` and `vortex.addonOptions` afterwards; undefined takes both out */
    readonly record?: AddonRecord;
    /** `vortex.engine`, for a project that doesn't record it yet */
    readonly engine?: string;
    readonly devDependencies: EntryChange;
    /** Plus every script name in the order a new project would list them, so a new one goes in at its place */
    readonly scripts: EntryChange & { readonly order: readonly string[] };
    readonly externals: { readonly add: readonly string[]; readonly remove: readonly string[] };
}

export type Severity = 'error' | 'warning' | 'information';

export interface Finding {
    readonly rule: string;
    readonly severity: Severity;
    readonly message: string;
    /** Path relative to the project folder, with forward slashes */
    readonly file: string;
    readonly offset?: number;
    readonly length?: number;
}

/** Everything the rules read from a project, so validation needs no IO */
export interface ProjectSnapshot {
    readonly packageJsonText: string;
    /** The required files that exist, relative to the project folder */
    readonly existingFiles: ReadonlySet<string>;
    readonly gameartExists: boolean;
    readonly packageLockText?: string;
    /** node_modules/vortex-api/package.json */
    readonly vortexApiManifestText?: string;
    /** The version in node_modules/typescript/package.json */
    readonly installedTypeScriptVersion?: string;
    /** src/common/constants.ts */
    readonly constants?: { readonly path: string; readonly text: string };
}

/** Checks a project again after something changed it */
export interface FolderValidator {
    validateFolder(folder: vscode.WorkspaceFolder): Promise<void>;
}

export interface GeneratedOutput {
    /** Path relative to the project folder, with forward slashes */
    readonly path: string;
    readonly content: string | Uint8Array;
}
