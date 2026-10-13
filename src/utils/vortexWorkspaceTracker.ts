import * as vscode from 'vscode';
import { CONTEXT_IS_VORTEX_WORKSPACE, REVALIDATE_DEBOUNCE_MS } from '../constants';
import { CONSTANTS_PATH, PACKAGE_JSON_PATH } from '../templates/registry';
import type { VortexProject } from '../types/project';
import { isVortexManifest } from './detection';
import { errorMessage } from './errors';
import { fileExists, readTextIfExists } from './fileSystemUtils';
import { parseLenientJson } from './jsonUtils';
import { Logger } from './logger';

const LEGACY_INFO_JSON = 'info.json';

/** Root-level patterns only: a `**` pattern would fire for every file npm writes to node_modules */
const WATCHED_PATTERNS = [
    `{${PACKAGE_JSON_PATH},package-lock.json,${LEGACY_INFO_JSON},rollup.config.mjs,tsconfig.json}`,
    'src/index.ts',
    CONSTANTS_PATH,
    '.vscode/build/*.mjs',
    'assets/**',
];

export interface FolderState {
    readonly folder: vscode.WorkspaceFolder;
    /** Undefined when the folder is not, or no longer, a Vortex game extension */
    readonly project?: VortexProject;
}

interface Detection {
    readonly project?: VortexProject;
    readonly legacy: boolean;
}

/** Detects the Vortex game extensions among the workspace folders and keeps them up to date */
export class VortexWorkspaceTracker implements vscode.Disposable {
    private readonly _onDidRefresh = new vscode.EventEmitter<FolderState>();
    /** Fires after a folder was detected again, also when nothing changed, so its findings can be refreshed */
    readonly onDidRefresh = this._onDidRefresh.event;

    private readonly _projects = new Map<string, VortexProject>();
    private readonly _legacyFolders = new Map<string, vscode.WorkspaceFolder>();
    private readonly _watchers = new Map<string, vscode.Disposable[]>();
    private readonly _timers = new Map<string, ReturnType<typeof setTimeout>>();
    private readonly _disposables: vscode.Disposable[] = [];

    constructor() {
        this._disposables.push(
            this._onDidRefresh,
            vscode.workspace.onDidChangeWorkspaceFolders(event => void this.onFoldersChanged(event)),
        );
    }

    get projects(): readonly VortexProject[] {
        return [...this._projects.values()];
    }

    /** Folders with vortex-api and a root info.json, the layout before package.json held the metadata */
    get legacyFolders(): readonly vscode.WorkspaceFolder[] {
        return [...this._legacyFolders.values()];
    }

    find(uri: vscode.Uri): VortexProject | undefined {
        const folder = vscode.workspace.getWorkspaceFolder(uri);
        return folder ? this._projects.get(folder.uri.toString()) : undefined;
    }

    async initialize(): Promise<void> {
        for (const folder of vscode.workspace.workspaceFolders ?? []) {
            this.watch(folder);
        }
        await this.refreshAll();
    }

    async refreshAll(): Promise<void> {
        await Promise.all((vscode.workspace.workspaceFolders ?? []).map(folder => this.refresh(folder)));
    }

    async refresh(folder: vscode.WorkspaceFolder): Promise<void> {
        const key = folder.uri.toString();
        const detection = await detectFolder(folder);
        const wasProject = this._projects.has(key);

        if (detection.project) {
            this._projects.set(key, detection.project);
        } else {
            this._projects.delete(key);
        }
        if (detection.legacy) {
            this._legacyFolders.set(key, folder);
        } else {
            this._legacyFolders.delete(key);
        }

        if (wasProject !== !!detection.project) {
            Logger.info(detection.project
                ? `Detected a Vortex game extension in ${folder.uri.fsPath}.`
                : `${folder.uri.fsPath} is no longer a Vortex game extension.`);
        }
        await this.updateContextKey();
        this._onDidRefresh.fire({ folder, project: detection.project });
    }

    dispose(): void {
        for (const timer of this._timers.values()) {
            clearTimeout(timer);
        }
        for (const watchers of this._watchers.values()) {
            watchers.forEach(watcher => watcher.dispose());
        }
        this._disposables.forEach(disposable => disposable.dispose());
    }

    private watch(folder: vscode.WorkspaceFolder): void {
        const watchers = WATCHED_PATTERNS.map(pattern => {
            const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(folder, pattern));
            const schedule = () => this.scheduleRefresh(folder);
            watcher.onDidCreate(schedule);
            watcher.onDidChange(schedule);
            watcher.onDidDelete(schedule);
            return watcher;
        });
        this._watchers.set(folder.uri.toString(), watchers);
    }

    private scheduleRefresh(folder: vscode.WorkspaceFolder): void {
        const key = folder.uri.toString();
        clearTimeout(this._timers.get(key));
        this._timers.set(key, setTimeout(() => {
            this._timers.delete(key);
            this.refresh(folder).catch(e => Logger.error(`Failed to detect ${folder.uri.fsPath}: ${errorMessage(e)}`));
        }, REVALIDATE_DEBOUNCE_MS));
    }

    private async onFoldersChanged(event: vscode.WorkspaceFoldersChangeEvent): Promise<void> {
        for (const folder of event.removed) {
            const key = folder.uri.toString();
            clearTimeout(this._timers.get(key));
            this._timers.delete(key);
            this._watchers.get(key)?.forEach(watcher => watcher.dispose());
            this._watchers.delete(key);
            this._projects.delete(key);
            this._legacyFolders.delete(key);
            this._onDidRefresh.fire({ folder });
        }
        for (const folder of event.added) {
            this.watch(folder);
        }
        await Promise.all(event.added.map(folder => this.refresh(folder)));
        await this.updateContextKey();
    }

    private async updateContextKey(): Promise<void> {
        await vscode.commands.executeCommand('setContext', CONTEXT_IS_VORTEX_WORKSPACE, this._projects.size > 0);
    }
}

async function detectFolder(folder: vscode.WorkspaceFolder): Promise<Detection> {
    const at = (relativePath: string) => vscode.Uri.joinPath(folder.uri, relativePath);
    const packageJsonText = await readTextIfExists(at(PACKAGE_JSON_PATH));
    if (packageJsonText === undefined || !isVortexManifest(parseLenientJson(packageJsonText))) {
        return { legacy: false };
    }
    if (await fileExists(at(LEGACY_INFO_JSON))) {
        return { legacy: true };
    }

    return { project: { folder }, legacy: false };
}
