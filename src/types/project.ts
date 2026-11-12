import type * as vscode from 'vscode';
import type { BEPINEX_BUILD_IL2CPP, BEPINEX_BUILD_MONO, MOD_LOADER_BEPINEX, MOD_LOADER_GML, MOD_LOADER_MELON_LOADER } from '../constants';

export type ModLoaderId = typeof MOD_LOADER_GML | typeof MOD_LOADER_MELON_LOADER | typeof MOD_LOADER_BEPINEX;

export type BepInExBuild = typeof BEPINEX_BUILD_MONO | typeof BEPINEX_BUILD_IL2CPP;

/** A workspace folder that holds a Vortex game extension */
export interface VortexProject {
    readonly folder: vscode.WorkspaceFolder;
}

/** What a sidebar row passes to the command it runs; the command palette passes nothing */
export interface ProjectTarget {
    readonly project?: VortexProject;
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
    /** Empty or undefined keeps the plain installer */
    readonly modLoaders?: readonly ModLoaderId[];
    /** Answered when `modLoaders` has BepInEx */
    readonly bepInExBuild?: BepInExBuild;
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
