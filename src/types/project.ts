import type * as vscode from 'vscode';

export type ProjectLanguage = 'typescript' | 'javascript';

/** A workspace folder that holds a Vortex game extension */
export interface VortexProject {
    readonly folder: vscode.WorkspaceFolder;
    readonly language: ProjectLanguage;
}

/** The answers of the New Game Support Extension wizard */
export interface ProjectValues {
    readonly language: ProjectLanguage;
    readonly shortName: string;
    readonly gameId: string;
    readonly gameName: string;
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
