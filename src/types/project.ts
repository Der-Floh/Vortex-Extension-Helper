import type * as vscode from 'vscode';

/** A workspace folder that holds a Vortex game extension */
export interface VortexProject {
    readonly folder: vscode.WorkspaceFolder;
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
