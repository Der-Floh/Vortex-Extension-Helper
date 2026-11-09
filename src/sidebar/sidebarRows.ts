import * as vscode from 'vscode';
import {
    BUILTIN_OPEN,
    BUILTIN_SHOW_PROBLEMS,
    COMMAND_BUILD,
    COMMAND_DEBUG_IN_VORTEX,
    COMMAND_OPEN_DOCUMENTATION,
    COMMAND_OPEN_PLUGINS_FOLDER,
    COMMAND_OPEN_VORTEX_LOG,
    COMMAND_PACKAGE_ZIP,
    CONSTANTS_PATH,
    MANIFEST,
    NEXUS_GAMES_URL,
    NEXUS_SITE_URL,
    PACK_DIR,
    PACKAGING_WIKI_URL,
    ROW_ATTACHABLE,
    ROW_DEPENDENCIES_MISSING,
    ROW_DEPLOYABLE,
    ROW_LIBRARY_ADDED,
    ROW_LIBRARY_AVAILABLE,
    ROW_LIBRARY_UNLISTED,
    ROW_SNIPPET,
    SETTING_DEBUG_PORT,
    SETTING_VORTEX_PLUGINS_FOLDER,
} from '../constants';
import type { DeploymentState } from '../debug/packDeployment';
import { ACTIVITY_BUILD, ACTIVITY_DEBUG, ACTIVITY_DEPENDENCIES, ACTIVITY_DEPLOY, ACTIVITY_PACKAGE, libraryActivityId, type Activity } from '../project/projectActivity';
import { VORTEX_LIBRARIES, type LibraryTarget, type VortexLibrary } from '../project/vortexLibraries';
import { SNIPPETS } from '../snippets/snippets';
import type { VortexProject } from '../types/project';
import type { SnippetTarget } from '../types/snippet';
import type { NexusGame } from '../wizard/nexusGames';
import type { ProjectStatus } from './projectStatus';
import type { VortexPhase } from './vortexMonitor';

/** One row of the tree, and what the row's command needs to know: which project, library or snippet it is about */
export interface SidebarNode extends LibraryTarget, SnippetTarget {
    readonly id: string;
    readonly label: string;
    readonly description?: string;
    readonly tooltip?: string | vscode.MarkdownString;
    readonly icon?: vscode.ThemeIcon;
    readonly contextValue?: string;
    readonly command?: vscode.Command;
    readonly children?: readonly SidebarNode[];
    readonly expanded?: boolean;
}

export interface ProjectRowState {
    readonly project: VortexProject;
    readonly status: ProjectStatus;
    readonly busy?: Activity;
    readonly attached: boolean;
    readonly restartNeeded: boolean;
}

export interface SidebarState {
    readonly projects: readonly ProjectRowState[];
    readonly vortex: VortexPhase;
    readonly port: number;
    readonly games?: ReadonlyMap<number, NexusGame>;
}

type RowContent = Pick<SidebarNode, 'label' | 'tooltip' | 'icon' | 'contextValue' | 'command'>;

const themeIcon = (id: string, color?: string): vscode.ThemeIcon => new vscode.ThemeIcon(id, color === undefined ? undefined : new vscode.ThemeColor(color));

const PASS = themeIcon('pass', 'testing.iconPassed');
const WARNING = themeIcon('warning', 'list.warningForeground');
const ERROR = themeIcon('error', 'list.errorForeground');
const INFO = themeIcon('info');
const SPINNER = themeIcon('sync~spin');
const RUNNING = themeIcon('circle-filled', 'testing.iconPassed');
const RUNNING_WITHOUT_PORT = themeIcon('circle-filled', 'list.warningForeground');
const NOT_RUNNING = themeIcon('circle-outline');
const ATTACHED = themeIcon('debug-alt', 'testing.iconPassed');

const ACTIONS = [
    { role: 'debug', label: 'Debug in Vortex', command: COMMAND_DEBUG_IN_VORTEX, icon: 'debug-alt', activity: ACTIVITY_DEBUG },
    { role: 'build', label: 'Build', command: COMMAND_BUILD, icon: 'tools', activity: ACTIVITY_BUILD },
    { role: 'package', label: 'Package zip', command: COMMAND_PACKAGE_ZIP, icon: 'package', activity: ACTIVITY_PACKAGE },
    { role: 'plugins', label: 'Open plugins folder', command: COMMAND_OPEN_PLUGINS_FOLDER, icon: 'folder-opened' },
    { role: 'log', label: 'Open Vortex log', command: COMMAND_OPEN_VORTEX_LOG, icon: 'output' },
];

const DEPLOYMENT_ROWS: Readonly<Record<DeploymentState, RowContent>> = {
    'not-built': { label: 'Not built yet', icon: INFO, tooltip: 'Deploying builds it first.' },
    'no-plugins-folder': { label: 'Vortex hasn\'t run on this machine', icon: WARNING, tooltip: `Start Vortex once, or set ${SETTING_VORTEX_PLUGINS_FOLDER} to the folder it loads extensions from.` },
    'not-deployed': { label: 'Not deployed', icon: INFO, tooltip: 'Vortex doesn\'t have this extension yet. Deploying builds it first.' },
    'out-of-date': { label: 'Deployed build is out of date', icon: WARNING, tooltip: `The sources changed since the last build, or Vortex has a different build than ${PACK_DIR}. Deploying builds it first.` },
    current: { label: 'Deployed build is current', icon: PASS, tooltip: 'Vortex only loads extensions when it starts, so a deployment made while it runs needs a restart.' },
};

/** The sidebar for a window: with one project its sections sit at the top, with several each game gets a group */
export function buildSidebar(state: SidebarState): SidebarNode[] {
    if (state.projects.length === 0) {
        return [];
    }
    if (state.projects.length === 1) {
        const [row] = state.projects;
        return [statusSection(row, state), actionsSection(row), librariesSection(row), snippetsSection(), addToProjectRow(row), helpSection()];
    }
    return [...state.projects.map(row => projectGroup(row, state)), snippetsSection(), helpSection()];
}

function projectGroup(row: ProjectRowState, state: SidebarState): SidebarNode {
    const section = statusSection(row, state);
    return { ...section, children: [...section.children ?? [], actionsSection(row), librariesSection(row), addToProjectRow(row)] };
}

function statusSection(row: ProjectRowState, state: SidebarState): SidebarNode {
    const { project, status } = row;
    return {
        id: rowId(row, 'status'),
        label: status.displayName ?? project.folder.name,
        description: status.version === undefined ? undefined : `v${status.version}`,
        tooltip: project.folder.uri.fsPath,
        icon: themeIcon('game'),
        project,
        expanded: true,
        children: [
            dependenciesRow(row),
            problemsRow(row),
            statusRow(row, 'nexus', nexusContent(row.status, state.games)),
            deploymentRow(row),
            statusRow(row, 'vortex', row.attached ? attachedContent() : vortexContent(state, row)),
        ],
    };
}

function statusRow(row: ProjectRowState, role: string, content: RowContent): SidebarNode {
    return { id: rowId(row, 'status', role), project: row.project, ...content };
}

function dependenciesRow(row: ProjectRowState): SidebarNode {
    const missing = row.status.missingDependencies;
    const installing = row.busy?.id === ACTIVITY_DEPENDENCIES.id;
    return statusRow(row, 'dependencies', {
        label: missing.length === 0 ? 'Dependencies installed' : `${counted(missing.length, 'dependency', 'dependencies')} not installed`,
        icon: installing ? SPINNER : missing.length === 0 ? PASS : WARNING,
        tooltip: missing.length === 0 ? undefined : `Not in node_modules: ${missing.join(', ')}`,
        contextValue: missing.length > 0 && !row.busy ? ROW_DEPENDENCIES_MISSING : undefined,
    });
}

function problemsRow(row: ProjectRowState): SidebarNode {
    const { errors, warnings, notes } = row.status.problems;
    const counts = [counted(errors, 'error'), counted(warnings, 'warning'), counted(notes, 'note')].filter(count => !count.startsWith('0 '));
    return statusRow(row, 'problems', {
        label: counts.length === 0 ? 'No problems' : counts.join(', '),
        icon: errors > 0 ? ERROR : warnings > 0 ? WARNING : notes > 0 ? INFO : PASS,
        tooltip: 'Open the Problems panel',
        command: { title: 'Show Problems', command: BUILTIN_SHOW_PROBLEMS },
    });
}

function nexusContent({ nexusGameId: id, gameDomain }: ProjectStatus, games: SidebarState['games']): RowContent {
    if (id === undefined) {
        return { label: 'No Nexus game id', icon: WARNING, tooltip: `package.json has no "gameId", and Vortex only lists an extension that has one. ${NEXUS_GAMES_URL} lists the ids.` };
    }
    if (games === undefined) {
        return { label: `Nexus game ${id}`, icon: INFO, tooltip: 'The Nexus Mods game list isn\'t available, so the id can\'t be checked.' };
    }
    const game = games.get(id);
    if (game === undefined) {
        return { label: `Nexus game ${id} isn't on Nexus Mods`, icon: WARNING, tooltip: 'No game on the Nexus Mods game list has this id. Check "gameId" in package.json.' };
    }
    const command = openUrl(`${NEXUS_SITE_URL}/${game.domainName}`, `Open ${game.name} on Nexus Mods`);
    if (gameDomain !== undefined && gameDomain !== game.domainName) {
        return { label: `Nexus game ${id} is ${game.name}`, icon: WARNING, tooltip: `"gameId" in package.json is ${game.name} (${game.domainName}), but GAME.id in ${CONSTANTS_PATH} is ${gameDomain}.`, command };
    }
    return { label: `Nexus game ${id} = ${game.name}`, icon: PASS, tooltip: command.title, command };
}

function deploymentRow(row: ProjectRowState): SidebarNode {
    const { deployment } = row.status;
    const needsRestart = deployment === 'current' && row.restartNeeded;
    const content = needsRestart
        ? { label: 'Deployed, restart Vortex to load it', icon: WARNING, tooltip: 'Vortex only loads extensions when it starts, and this one was deployed while it was running.' }
        : DEPLOYMENT_ROWS[deployment];
    return statusRow(row, 'deployment', {
        ...content,
        icon: row.busy?.id === ACTIVITY_DEPLOY.id ? SPINNER : content.icon,
        contextValue: deployment !== 'current' && !row.busy ? ROW_DEPLOYABLE : undefined,
    });
}

function attachedContent(): RowContent {
    return { label: 'Debugger attached', icon: ATTACHED, tooltip: 'A debug session is attached to Vortex.' };
}

function vortexContent({ vortex, port }: SidebarState, row: ProjectRowState): RowContent {
    switch (vortex) {
        case 'ready':
            return { label: 'Vortex running, debug port open', icon: RUNNING, tooltip: `Vortex is listening on port ${port}.`, contextValue: row.busy ? undefined : ROW_ATTACHABLE };
        case 'starting':
            return { label: 'Vortex is starting', icon: SPINNER, tooltip: 'Attaching has to wait until its main window is up.' };
        case 'running-without-port':
            return { label: 'Vortex running without its debug port', icon: RUNNING_WITHOUT_PORT, tooltip: 'Vortex only opens the port when it is started with it. Debug in Vortex offers to close and restart it.' };
        case 'foreign':
            return { label: `Port ${port} is used by something else`, icon: WARNING, tooltip: `Set ${SETTING_DEBUG_PORT} to a free port.` };
        case 'stopped':
            return { label: 'Vortex not running', icon: NOT_RUNNING };
        case 'unknown':
            return { label: 'Checking Vortex...', icon: NOT_RUNNING };
    }
}

function actionsSection(row: ProjectRowState): SidebarNode {
    return {
        id: rowId(row, 'actions'),
        label: 'Actions',
        icon: themeIcon('zap'),
        expanded: true,
        children: ACTIONS.map(action => ({
            id: rowId(row, 'actions', action.role),
            label: action.label,
            icon: action.activity !== undefined && row.busy?.id === action.activity.id ? SPINNER : themeIcon(action.icon),
            project: row.project,
            command: { title: action.label, command: action.command, arguments: [{ project: row.project }] },
        })),
    };
}

function librariesSection(row: ProjectRowState): SidebarNode {
    return {
        id: rowId(row, 'libraries'),
        label: 'Vortex Libraries',
        icon: themeIcon('library'),
        expanded: true,
        children: VORTEX_LIBRARIES.map(library => libraryRow(row, library)),
    };
}

function libraryRow(row: ProjectRowState, library: VortexLibrary): SidebarNode {
    const declared = row.status.dependencies.includes(library.name);
    const listed = row.status.externals.includes(library.name);
    const unlisted = declared && !listed;
    const contextValue = !declared ? ROW_LIBRARY_AVAILABLE : listed ? ROW_LIBRARY_ADDED : ROW_LIBRARY_UNLISTED;
    return {
        id: rowId(row, 'libraries', library.name),
        label: library.name,
        description: unlisted ? 'not in vortex.externals' : library.description,
        tooltip: unlisted ? `${library.description}. It is installed, but rollup reports it as unresolved until it is in vortex.externals.` : library.description,
        icon: row.busy?.id === libraryActivityId(library.name) ? SPINNER : !declared ? themeIcon('add') : listed ? themeIcon('check') : WARNING,
        contextValue: row.busy ? undefined : contextValue,
        project: row.project,
        library,
    };
}

function snippetsSection(): SidebarNode {
    const snippets = Object.entries(SNIPPETS);
    return {
        id: 'snippets',
        label: `Snippets (${snippets.length})`,
        icon: themeIcon('symbol-snippet'),
        expanded: false,
        children: snippets.map(([name, snippet]) => ({
            id: `snippets#${name}`,
            label: name,
            description: snippet.description,
            tooltip: new vscode.MarkdownString().appendCodeblock(snippet.body, 'typescript'),
            icon: themeIcon('symbol-snippet'),
            contextValue: ROW_SNIPPET,
            snippet,
        })),
    };
}

/** A placeholder until the generators exist, so it deliberately has no command */
function addToProjectRow(row: ProjectRowState): SidebarNode {
    return {
        id: rowId(row, 'add'),
        label: 'Add to Project',
        description: 'coming soon',
        tooltip: 'Planned: adding state, tests, pages and dialogs to the project.',
        icon: themeIcon('wand'),
    };
}

function helpSection(): SidebarNode {
    const packaging = openUrl(PACKAGING_WIKI_URL, 'Packaging a game extension');
    const repository = openUrl(MANIFEST.repository.url, 'GitHub repository');
    const issues = openUrl(MANIFEST.bugs.url, 'Report an issue');
    return {
        id: 'help',
        label: 'Help',
        icon: themeIcon('question'),
        expanded: false,
        children: [
            { id: 'help#documentation', label: 'Creating a game extension', icon: themeIcon('book'), command: { title: 'Creating a game extension', command: COMMAND_OPEN_DOCUMENTATION } },
            { id: 'help#packaging', label: packaging.title, icon: themeIcon('package'), command: packaging },
            { id: 'help#repository', label: repository.title, icon: themeIcon('github'), command: repository },
            { id: 'help#issues', label: issues.title, icon: themeIcon('issues'), command: issues },
        ],
    };
}

/** The folder's URI keeps ids unique between same-named folders, and a role instead of a label keeps them stable */
function rowId(row: ProjectRowState, ...roles: string[]): string {
    return [row.project.folder.uri.toString(), ...roles].join('#');
}

function openUrl(url: string, title: string): vscode.Command {
    return { title, command: BUILTIN_OPEN, arguments: [vscode.Uri.parse(url)] };
}

function counted(count: number, singular: string, plural = `${singular}s`): string {
    return `${count} ${count === 1 ? singular : plural}`;
}
