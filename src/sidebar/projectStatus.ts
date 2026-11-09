import * as vscode from 'vscode';
import { CONSTANTS_PATH, PACKAGE_JSON_PATH } from '../constants';
import { readDeploymentState, type DeploymentState } from '../debug/packDeployment';
import { dependencyNames, externalsOf } from '../project/projectManifest';
import type { VortexProject } from '../types/project';
import { fileExists, readCurrentText } from '../utils/fileSystemUtils';
import { isRecord, parseLenientJson } from '../utils/jsonUtils';

const GAME_ID_IN_CONSTANTS = /\bGAME\b[^=]*=\s*\{[^}]*?\bid:\s*(['"`])([^'"`]+)\1/;
const NODE_MODULES = 'node_modules';

export interface ProblemCounts {
    readonly errors: number;
    readonly warnings: number;
    readonly notes: number;
}

/** Everything a project's rows show that has to be read from somewhere */
export interface ProjectStatus {
    readonly displayName?: string;
    readonly version?: string;
    /** `gameId` in package.json, undefined when it is missing or 0, like the build treats it */
    readonly nexusGameId?: number;
    /** `GAME.id` in the project's constants, which is its Nexus Mods domain */
    readonly gameDomain?: string;
    readonly dependencies: readonly string[];
    readonly missingDependencies: readonly string[];
    readonly externals: readonly string[];
    readonly problems: ProblemCounts;
    readonly deployment: DeploymentState;
}

export async function readProjectStatus(project: VortexProject, pluginsFolder: vscode.Uri | undefined): Promise<ProjectStatus> {
    const root = project.folder.uri;
    const [packageJsonText, constantsText] = await Promise.all([
        readCurrentText(vscode.Uri.joinPath(root, PACKAGE_JSON_PATH)),
        readCurrentText(vscode.Uri.joinPath(root, CONSTANTS_PATH)),
    ]);
    const manifest = parseLenientJson(packageJsonText ?? '');
    const dependencies = [...dependencyNames(manifest)];
    const [missingDependencies, deployment] = await Promise.all([
        notInstalled(root, dependencies),
        readDeploymentState(root, pluginsFolder),
    ]);
    return {
        displayName: stringField(manifest, 'displayName'),
        version: stringField(manifest, 'version'),
        nexusGameId: nexusGameIdOf(manifest),
        gameDomain: constantsText === undefined ? undefined : GAME_ID_IN_CONSTANTS.exec(constantsText)?.[2],
        dependencies,
        missingDependencies,
        externals: externalsOf(manifest),
        problems: countProblems(root),
        deployment,
    };
}

/** What the Problems panel lists for a folder, TypeScript's findings included, so the row agrees with the panel it opens */
export function countProblems(folder: vscode.Uri): ProblemCounts {
    const prefix = `${folder.toString().replace(/\/$/, '')}/`;
    const diagnostics = vscode.languages.getDiagnostics()
        .filter(([uri]) => uri.toString().startsWith(prefix))
        .flatMap(([, list]) => list);
    const count = (severity: vscode.DiagnosticSeverity) => diagnostics.filter(diagnostic => diagnostic.severity === severity).length;
    return {
        errors: count(vscode.DiagnosticSeverity.Error),
        warnings: count(vscode.DiagnosticSeverity.Warning),
        notes: count(vscode.DiagnosticSeverity.Information),
    };
}

async function notInstalled(root: vscode.Uri, names: readonly string[]): Promise<string[]> {
    const installed = await Promise.all(names.map(name => fileExists(vscode.Uri.joinPath(root, NODE_MODULES, name, PACKAGE_JSON_PATH))));
    return names.filter((_, index) => !installed[index]);
}

function stringField(manifest: unknown, field: string): string | undefined {
    const value = isRecord(manifest) ? manifest[field] : undefined;
    return typeof value === 'string' && value ? value : undefined;
}

function nexusGameIdOf(manifest: unknown): number | undefined {
    const raw = isRecord(manifest) ? manifest.gameId : undefined;
    const id = typeof raw === 'number' || typeof raw === 'string' ? Number(raw) : 0;
    return Number.isInteger(id) && id > 0 ? id : undefined;
}
