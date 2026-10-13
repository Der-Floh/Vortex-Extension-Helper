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

export interface GeneratedOutput {
    /** Path relative to the project folder, with forward slashes */
    readonly path: string;
    readonly content: string | Uint8Array;
}
