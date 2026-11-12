import * as vscode from 'vscode';
import { CONFIG_SECTION, REVALIDATE_DEBOUNCE_MS, VIEW_SIDEBAR } from '../constants';
import { resolvePluginsFolder } from '../debug/vortexInstall';
import { ACTIVITY_DEPLOY, type ActivityChange, type ProjectActivity } from '../project/projectActivity';
import type { VortexWorkspaceTracker } from '../project/vortexWorkspaceTracker';
import type { AddonListing, AddonRecord, VortexProject } from '../types/project';
import { getConfiguration } from '../utils/configuration';
import { errorMessage } from '../utils/errors';
import { Logger } from '../utils/logger';
import { NexusGameLookup, type NexusGameLookupDeps } from './nexusGameLookup';
import { countProblems, readProjectStatus, type ProjectStatus } from './projectStatus';
import { buildSidebar, type ProjectRowState, type SidebarNode, type SidebarState } from './sidebarRows';
import { VortexMonitor, type VortexMonitorDeps } from './vortexMonitor';

export type SidebarTracker = Pick<VortexWorkspaceTracker, 'projects' | 'onDidRefresh' | 'refreshAll'>;

/** What a project's add-ons are, and which others it could add */
export type AddonLister = (engine: string | undefined, record: AddonRecord | undefined) => AddonListing;

const NO_ADDONS: AddonListing = Object.freeze({ added: [], available: [], blocked: [], grouped: false });

export interface SidebarDeps extends VortexMonitorDeps, NexusGameLookupDeps {
    readonly readStatus?: typeof readProjectStatus;
    /** From the catalogue, which this folder may not import */
    readonly addonListing?: AddonLister;
    readonly pluginsFolder?: () => Promise<vscode.Uri | undefined>;
    readonly debounceMs?: number;
}

/** Runs the action once things have been quiet for a moment */
function debounced(action: () => void, delayMs: number): { schedule(): void; cancel(): void } {
    let timer: ReturnType<typeof setTimeout> | undefined;
    return {
        schedule: () => {
            clearTimeout(timer);
            timer = setTimeout(action, delayMs);
        },
        cancel: () => clearTimeout(timer),
    };
}

export class SidebarProvider implements vscode.TreeDataProvider<SidebarNode>, vscode.Disposable {
    private readonly _onDidChangeTreeData = new vscode.EventEmitter<void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private readonly monitor: VortexMonitor;
    private readonly lookup: NexusGameLookup;
    private readonly readStatus: typeof readProjectStatus;
    private readonly addonListing: AddonLister;
    private readonly pluginsFolder: () => Promise<vscode.Uri | undefined>;
    private readonly scheduledReload: ReturnType<typeof debounced>;
    private readonly scheduledRecount: ReturnType<typeof debounced>;
    private readonly _disposables: vscode.Disposable[];

    private readonly _statuses = new Map<string, ProjectStatus>();
    /** Projects deployed while Vortex was running, which Vortex hasn't loaded */
    private readonly _restartNeeded = new Set<string>();

    private _visible = false;
    private _focused = false;
    /** Increases with every reload, so a slower, older one can't overwrite a newer one */
    private _generation = 0;
    private _firstLoad: Promise<void> | undefined;
    private _roots: readonly SidebarNode[] = [];
    private _renderedTree = '';

    constructor(private readonly tracker: SidebarTracker, private readonly activity: ProjectActivity, deps: SidebarDeps = {}) {
        this.monitor = new VortexMonitor(deps);
        this.lookup = new NexusGameLookup(() => this.render(), deps);
        this.readStatus = deps.readStatus ?? readProjectStatus;
        this.addonListing = deps.addonListing ?? (() => NO_ADDONS);
        this.pluginsFolder = deps.pluginsFolder ?? (() => resolvePluginsFolder(getConfiguration()).catch(() => undefined));
        this.scheduledReload = debounced(() => void this.reload(), deps.debounceMs ?? REVALIDATE_DEBOUNCE_MS);
        this.scheduledRecount = debounced(() => this.recountProblems(), deps.debounceMs ?? REVALIDATE_DEBOUNCE_MS);
        this._disposables = [
            this.monitor,
            this._onDidChangeTreeData,
            tracker.onDidRefresh(() => this.scheduleReload()),
            activity.onDidChange(change => this.onActivityChanged(change)),
            this.monitor.onDidChange(() => this.onVortexChanged()),
            this.monitor.onDidSlowTick(() => this.scheduleReload()),
            vscode.languages.onDidChangeDiagnostics(() => this.scheduleRecount()),
            vscode.workspace.onDidChangeConfiguration(event => this.onConfigurationChanged(event)),
        ];
    }

    getTreeItem(node: SidebarNode): vscode.TreeItem {
        const item = new vscode.TreeItem(node.label, collapsibleStateOf(node));
        item.id = node.id;
        item.description = node.description;
        item.tooltip = node.tooltip;
        // VS Code would otherwise read a text tooltip out instead of the row's own text
        item.accessibilityInformation = { label: node.description === undefined ? node.label : `${node.label}, ${node.description}` };
        item.iconPath = node.icon;
        item.contextValue = node.contextValue;
        item.command = node.command;
        return item;
    }

    async getChildren(node?: SidebarNode): Promise<SidebarNode[]> {
        if (node) {
            return [...node.children ?? []];
        }
        this._firstLoad ??= this.reload();
        await this._firstLoad;
        return [...this._roots];
    }

    /** Nothing is read or polled while nobody can see the result, and polling also waits for VS Code to have focus */
    setVisibility(visible: boolean, focused: boolean): void {
        const wasWatching = this._visible && this._focused;
        this._visible = visible;
        this._focused = focused;
        this.monitor.setActive(visible && focused);
        if (visible && (focused ? !wasWatching : this._firstLoad === undefined)) {
            void this.lookup.load();
            this.reloadOnShow();
        }
    }

    /** Detects the projects again and gives a failed game list download another chance */
    async refresh(): Promise<void> {
        await this.tracker.refreshAll();
        await Promise.all([this.lookup.retry(), this.reload()]);
    }

    dispose(): void {
        this.scheduledReload.cancel();
        this.scheduledRecount.cancel();
        this._disposables.forEach(disposable => disposable.dispose());
    }

    private reloadOnShow(): void {
        if (this._firstLoad === undefined) {
            this._firstLoad = this.reload();
        } else {
            void this.reload();
        }
    }

    private scheduleReload(): void {
        if (this._visible) {
            this.scheduledReload.schedule();
        }
    }

    private scheduleRecount(): void {
        if (this._visible) {
            this.scheduledRecount.schedule();
        }
    }

    private async reload(): Promise<void> {
        const generation = ++this._generation;
        try {
            const pluginsFolder = await this.pluginsFolder();
            const projects = this.tracker.projects;
            const statuses = await Promise.all(projects.map(project => this.readStatus(project, pluginsFolder)));
            if (generation !== this._generation) {
                return;
            }
            this._statuses.clear();
            projects.forEach((project, index) => this._statuses.set(keyOf(project), statuses[index]));
            this.render();
        } catch (e) {
            Logger.error(`Failed to read the status for the sidebar: ${errorMessage(e)}`);
        }
    }

    /** Diagnostics change on every pause in typing, so this only touches what is already in memory */
    private recountProblems(): void {
        for (const project of this.tracker.projects) {
            const status = this._statuses.get(keyOf(project));
            if (status) {
                this._statuses.set(keyOf(project), { ...status, problems: countProblems(project.folder.uri) });
            }
        }
        this.render();
    }

    private onActivityChanged({ folder, activity, running }: ActivityChange): void {
        if (!running && activity.id === ACTIVITY_DEPLOY.id && this.monitor.isVortexRunning) {
            this._restartNeeded.add(folder.uri.toString());
        }
        this.render();
        if (!running) {
            this.scheduleReload();
        }
    }

    private onVortexChanged(): void {
        if (this.monitor.phase !== 'unknown' && !this.monitor.isVortexRunning) {
            this._restartNeeded.clear();
        }
        this.render();
    }

    private onConfigurationChanged(event: vscode.ConfigurationChangeEvent): void {
        if (event.affectsConfiguration(CONFIG_SECTION) && this._visible) {
            void this.lookup.load();
            this.scheduleReload();
        }
    }

    private render(): void {
        const roots = buildSidebar(this.state());
        const renderedTree = JSON.stringify(roots);
        if (renderedTree !== this._renderedTree) {
            this._roots = roots;
            this._renderedTree = renderedTree;
            this._onDidChangeTreeData.fire();
        }
    }

    private state(): SidebarState {
        return {
            projects: this.tracker.projects.flatMap(project => this.rowStateOf(project)),
            vortex: this.monitor.phase,
            port: this.monitor.currentPort,
            games: this.lookup.games,
        };
    }

    private rowStateOf(project: VortexProject): ProjectRowState[] {
        const status = this._statuses.get(keyOf(project));
        return status === undefined ? [] : [{
            project,
            status,
            busy: this.activity.current(project.folder),
            attached: this.monitor.isAttached(project.folder),
            restartNeeded: this._restartNeeded.has(keyOf(project)),
            addons: this.addonListing(status.engine, status.addonRecord),
        }];
    }
}

/** Creates the tree view and keeps the provider told whether anybody can see it */
export function createSidebarView(provider: SidebarProvider): vscode.Disposable {
    const view = vscode.window.createTreeView(VIEW_SIDEBAR, { treeDataProvider: provider });
    const update = () => provider.setVisibility(view.visible, vscode.window.state.focused);
    const subscriptions = [view, view.onDidChangeVisibility(update), vscode.window.onDidChangeWindowState(update)];
    update();
    return vscode.Disposable.from(...subscriptions);
}

function keyOf(project: VortexProject): string {
    return project.folder.uri.toString();
}

function collapsibleStateOf(node: SidebarNode): vscode.TreeItemCollapsibleState {
    if (node.children === undefined) {
        return vscode.TreeItemCollapsibleState.None;
    }
    return node.expanded ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed;
}
