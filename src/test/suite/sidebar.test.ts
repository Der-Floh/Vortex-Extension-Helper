import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import {
    BUILTIN_OPEN,
    BUILTIN_SHOW_PROBLEMS,
    COMMAND_BUILD,
    COMMAND_DEBUG_IN_VORTEX,
    COMMAND_OPEN_PLUGINS_FOLDER,
    COMMAND_OPEN_VORTEX_LOG,
    COMMAND_PACKAGE_ZIP,
    MANIFEST,
    ROW_ATTACHABLE,
    ROW_DEPENDENCIES_MISSING,
    ROW_DEPLOYABLE,
    ROW_LIBRARY_ADDED,
    ROW_LIBRARY_AVAILABLE,
    ROW_LIBRARY_UNLISTED,
    ROW_SNIPPET,
    VORTEX_LIBRARIES,
} from '../../constants';
import type { CdpProbe, ProbeResult } from '../../debug/cdpProbe';
import type { DebugHost } from '../../debug/debugSessionWatcher';
import type { DeploymentState } from '../../debug/packDeployment';
import type { VortexLauncher } from '../../debug/vortexLauncher';
import { ACTIVITY_BUILD, ACTIVITY_DEPENDENCIES, ACTIVITY_DEPLOY, libraryActivity, ProjectActivity } from '../../project/projectActivity';
import type { FolderState } from '../../project/vortexWorkspaceTracker';
import { NexusGameLookup } from '../../sidebar/nexusGameLookup';
import { readProjectStatus, type ProjectStatus } from '../../sidebar/projectStatus';
import { SidebarProvider, type SidebarDeps, type SidebarTracker } from '../../sidebar/sidebarProvider';
import { buildSidebar, type ProjectRowState, type SidebarNode, type SidebarState } from '../../sidebar/sidebarRows';
import { VortexMonitor, type VortexPhase } from '../../sidebar/vortexMonitor';
import { SNIPPETS } from '../../snippets/snippets';
import type { VortexProject } from '../../types/project';
import { writeText } from '../../utils/fileSystemUtils';
import type { NexusGame } from '../../wizard/nexusGames';

const scratch = process.env.VORTEX_HELPER_SCRATCH ?? '';
const LIBRARY = VORTEX_LIBRARIES[0];
const GAMES: ReadonlyMap<number, NexusGame> = new Map([[9309, { id: 9309, name: 'Coal LLC', domainName: 'coalllc' }]]);
const SPINNER = 'sync~spin';

function project(name: string, parent = 'projects'): VortexProject {
    return { folder: { uri: vscode.Uri.file(path.join(path.sep, parent, name)), name, index: 0 } };
}

function status(overrides: Partial<ProjectStatus> = {}): ProjectStatus {
    return {
        displayName: 'Game: Coal LLC',
        version: '1.2.0',
        nexusGameId: 9309,
        gameDomain: 'coalllc',
        dependencies: ['vortex-api'],
        missingDependencies: [],
        externals: [],
        problems: { errors: 0, warnings: 0, notes: 0 },
        deployment: 'current',
        ...overrides,
    };
}

function rowState(overrides: Partial<ProjectRowState> = {}): ProjectRowState {
    return { project: project('coalllc-support'), status: status(), attached: false, restartNeeded: false, ...overrides };
}

function sidebarState(rows: ProjectRowState[] = [rowState()], overrides: Partial<SidebarState> = {}): SidebarState {
    return { projects: rows, vortex: 'ready', port: 9222, games: GAMES, ...overrides };
}

function flatten(nodes: readonly SidebarNode[]): SidebarNode[] {
    return nodes.flatMap(node => [node, ...flatten(node.children ?? [])]);
}

type StatusRow = 'dependencies' | 'problems' | 'nexus' | 'deployment' | 'vortex';

function findRow(nodes: readonly SidebarNode[], role: string): SidebarNode {
    const found = flatten(nodes).find(node => node.id.endsWith(`#${role}`));
    assert.ok(found, `no row ${role}`);
    return found;
}

function statusRow(role: StatusRow, row: Partial<ProjectRowState> = {}, state: Partial<SidebarState> = {}): SidebarNode {
    return findRow(buildSidebar(sidebarState([rowState(row)], state)), `status#${role}`);
}

function libraryRow(row: Partial<ProjectRowState>): SidebarNode {
    return findRow(buildSidebar(sidebarState([rowState(row)])), `libraries#${LIBRARY.name}`);
}

const iconOf = (node: SidebarNode): string | undefined => node.icon?.id;

async function waitUntil(condition: () => boolean, timeoutMs = 5_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (!condition() && Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 2));
    }
    assert.ok(condition(), 'condition was not met in time');
}

const VORTEX_WINDOW = { id: 'main', type: 'page', url: 'file:///C:/Vortex/resources/app.asar/index.html' };
const SPLASH_WINDOW = { id: 'splash', type: 'page', url: 'file:///C:/Vortex/resources/app.asar/splash.html' };
const OTHER_PAGE = { id: 'tab', type: 'page', url: 'https://example.com/' };

/** A debugging port the test answers for */
class StubPort implements CdpProbe {
    answer: ProbeResult<readonly { id: string; type: string; url: string }[]> = { status: 'closed' };
    calls = 0;

    async version(): Promise<never> {
        return assert.fail('the sidebar only asks for the windows');
    }

    async targets(): Promise<typeof this.answer> {
        this.calls += 1;
        return this.answer;
    }
}

function stubLauncher(running: () => boolean): VortexLauncher & { asked: () => number } {
    let asked = 0;
    return {
        asked: () => asked,
        launch: () => assert.fail('should not have launched Vortex'),
        requestClose: async () => assert.fail('should not have closed Vortex'),
        isVortexRunning: async () => {
            asked += 1;
            return running();
        },
    };
}

function stubDebug(): Pick<DebugHost, 'onDidStartDebugSession' | 'onDidTerminateDebugSession'> & { start(session: vscode.DebugSession): void; end(session: vscode.DebugSession): void } {
    const started = new vscode.EventEmitter<vscode.DebugSession>();
    const ended = new vscode.EventEmitter<vscode.DebugSession>();
    return {
        onDidStartDebugSession: started.event,
        onDidTerminateDebugSession: ended.event,
        start: session => started.fire(session),
        end: session => ended.fire(session),
    };
}

function vortexSession(id: string, folder: vscode.WorkspaceFolder, parentSession?: vscode.DebugSession): vscode.DebugSession {
    return {
        id,
        parentSession,
        workspaceFolder: folder,
        configuration: { type: 'chrome', name: 'Vortex', request: 'attach', port: 9222, sourceMapPathOverrides: { 'game:///*': 'F:/game/*' } },
    } as unknown as vscode.DebugSession;
}

suite('Sidebar', () => {
    suite('layout', () => {
        test('one project has its sections at the top, in the order of the mock-up', () => {
            const roots = buildSidebar(sidebarState());
            assert.deepStrictEqual(roots.map(node => node.label), ['Game: Coal LLC', 'Actions', 'Vortex Libraries', `Snippets (${Object.keys(SNIPPETS).length})`, 'Add to Project', 'Help']);
            assert.strictEqual(roots[0].description, 'v1.2.0');
            assert.deepStrictEqual(roots.map(node => node.expanded), [true, true, true, false, undefined, false]);
        });

        test('every section has an icon, because the text of a row without one starts further left', () => {
            assert.deepStrictEqual(buildSidebar(sidebarState()).map(iconOf), ['game', 'zap', 'library', 'symbol-snippet', 'wand', 'question']);

            const groups = buildSidebar(sidebarState([rowState({ project: project('one') }), rowState({ project: project('two') })]));
            assert.deepStrictEqual(groups.map(iconOf), ['game', 'game', 'symbol-snippet', 'question']);
            assert.deepStrictEqual(groups[0].children?.slice(-3).map(iconOf), ['zap', 'library', 'wand']);
        });

        test('no project leaves the tree empty, which is what shows the welcome text', () => {
            assert.deepStrictEqual(buildSidebar(sidebarState([])), []);
        });

        test('several projects get a group each, and Snippets and Help appear once at the end', () => {
            const first = rowState({ project: project('one'), status: status({ displayName: 'Game: One' }) });
            const second = rowState({ project: project('two'), status: status({ displayName: 'Game: Two' }) });
            const roots = buildSidebar(sidebarState([first, second]));
            assert.deepStrictEqual(roots.map(node => node.label), ['Game: One', 'Game: Two', `Snippets (${Object.keys(SNIPPETS).length})`, 'Help']);
            assert.deepStrictEqual(roots[0].children?.slice(-3).map(node => node.label), ['Actions', 'Vortex Libraries', 'Add to Project']);
        });

        test('a project without a display name or version falls back on its folder', () => {
            const [header] = buildSidebar(sidebarState([rowState({ status: status({ displayName: undefined, version: undefined }) })]));
            assert.strictEqual(header.label, 'coalllc-support');
            assert.strictEqual(header.description, undefined);
        });

        test('ids stay unique for same-named folders and for scoped library names', () => {
            const rows = [
                rowState({ project: project('same', 'one'), status: status({ displayName: 'Game: Same' }) }),
                rowState({ project: project('same', 'two'), status: status({ displayName: 'Game: Same' }) }),
            ];
            const ids = flatten(buildSidebar(sidebarState(rows))).map(node => node.id);
            assert.ok(ids.some(id => id.endsWith('#libraries#@nexusmods/nexus-api')));
            assert.strictEqual(new Set(ids).size, ids.length);
        });

        test('rows hold no reference to themselves, since a redraw compares them as JSON', () => {
            assert.doesNotThrow(() => JSON.stringify(buildSidebar(sidebarState())));
        });
    });

    suite('status rows', () => {
        test('dependencies', () => {
            const installed = statusRow('dependencies');
            assert.strictEqual(installed.label, 'Dependencies installed');
            assert.strictEqual(installed.contextValue, undefined);

            const missing = statusRow('dependencies', { status: status({ missingDependencies: ['rollup', 'typescript', 'tslib'] }) });
            assert.strictEqual(missing.label, '3 dependencies not installed');
            assert.strictEqual(missing.contextValue, ROW_DEPENDENCIES_MISSING);
            assert.ok(String(missing.tooltip).includes('rollup, typescript, tslib'));

            assert.strictEqual(statusRow('dependencies', { status: status({ missingDependencies: ['rollup'] }) }).label, '1 dependency not installed');
        });

        test('problems name each severity and open the panel they count', () => {
            const counts = (errors: number, warnings: number, notes: number) => statusRow('problems', { status: status({ problems: { errors, warnings, notes } }) });
            assert.strictEqual(counts(0, 0, 0).label, 'No problems');
            assert.strictEqual(iconOf(counts(0, 0, 0)), 'pass');
            assert.strictEqual(counts(1, 2, 0).label, '1 error, 2 warnings');
            assert.strictEqual(iconOf(counts(1, 2, 0)), 'error');
            assert.strictEqual(iconOf(counts(0, 2, 0)), 'warning');
            assert.strictEqual(counts(0, 0, 3).label, '3 notes');
            assert.strictEqual(iconOf(counts(0, 0, 3)), 'info');
            assert.strictEqual(counts(10, 0, 0).label, '10 errors');
            assert.strictEqual(counts(1, 2, 0).command?.command, BUILTIN_SHOW_PROBLEMS);
        });

        test('the Nexus game is matched by id and checked against GAME.id', () => {
            const match = statusRow('nexus');
            assert.strictEqual(match.label, 'Nexus game 9309 = Coal LLC');
            assert.strictEqual(iconOf(match), 'pass');
            assert.strictEqual(match.command?.command, BUILTIN_OPEN);
            assert.strictEqual(String(match.command?.arguments?.[0]), vscode.Uri.parse('https://www.nexusmods.com/coalllc').toString());

            const wrongDomain = statusRow('nexus', { status: status({ gameDomain: 'somethingelse' }) });
            assert.strictEqual(wrongDomain.label, 'Nexus game 9309 is Coal LLC');
            assert.strictEqual(iconOf(wrongDomain), 'warning');

            assert.strictEqual(iconOf(statusRow('nexus', { status: status({ gameDomain: undefined }) })), 'pass');
        });

        test('without the game list only the number is shown, and that is no warning', () => {
            const row = statusRow('nexus', {}, { games: undefined });
            assert.strictEqual(row.label, 'Nexus game 9309');
            assert.strictEqual(iconOf(row), 'info');
            assert.strictEqual(row.command, undefined);
        });

        test('an id that isn\'t on the list and a missing id are warnings', () => {
            const notListed = statusRow('nexus', { status: status({ nexusGameId: 1 }) });
            assert.strictEqual(notListed.label, 'Nexus game 1 isn\'t on Nexus Mods');
            assert.strictEqual(iconOf(notListed), 'warning');
            const missing = statusRow('nexus', { status: status({ nexusGameId: undefined }) });
            assert.strictEqual(missing.label, 'No Nexus game id');
            assert.strictEqual(iconOf(missing), 'warning');
        });

        test('every deployment state but current offers to deploy', () => {
            const expected: Record<DeploymentState, string> = {
                'not-built': 'Not built yet',
                'no-plugins-folder': 'Vortex hasn\'t run on this machine',
                'not-deployed': 'Not deployed',
                'out-of-date': 'Deployed build is out of date',
                current: 'Deployed build is current',
            };
            for (const [deployment, label] of Object.entries(expected) as [DeploymentState, string][]) {
                const row = statusRow('deployment', { status: status({ deployment }) });
                assert.strictEqual(row.label, label);
                assert.strictEqual(row.contextValue, deployment === 'current' ? undefined : ROW_DEPLOYABLE, deployment);
            }
        });

        test('the restart note only replaces a deployment that is otherwise current', () => {
            assert.strictEqual(statusRow('deployment', { restartNeeded: true }).label, 'Deployed, restart Vortex to load it');
            assert.strictEqual(statusRow('deployment', { restartNeeded: true, status: status({ deployment: 'out-of-date' }) }).label, 'Deployed build is out of date');
        });

        test('Vortex only offers to attach once its window is up', () => {
            const labels: Record<Exclude<VortexPhase, 'foreign'>, string> = {
                unknown: 'Checking Vortex...',
                stopped: 'Vortex not running',
                'running-without-port': 'Vortex running without its debug port',
                starting: 'Vortex is starting',
                ready: 'Vortex running, debug port open',
            };
            for (const [vortex, label] of Object.entries(labels) as [VortexPhase, string][]) {
                const row = statusRow('vortex', {}, { vortex });
                assert.strictEqual(row.label, label);
                assert.strictEqual(row.contextValue, vortex === 'ready' ? ROW_ATTACHABLE : undefined, vortex);
            }
            assert.strictEqual(statusRow('vortex', {}, { vortex: 'foreign', port: 1234 }).label, 'Port 1234 is used by something else');
        });

        test('an attached debugger replaces the attach button', () => {
            const row = statusRow('vortex', { attached: true });
            assert.strictEqual(row.label, 'Debugger attached');
            assert.strictEqual(row.contextValue, undefined);
        });
    });

    suite('other rows', () => {
        test('each action passes its project and has no button of its own', () => {
            const row = rowState();
            const actions = buildSidebar(sidebarState([row]))[1].children ?? [];
            assert.deepStrictEqual(actions.map(action => action.command?.command), [COMMAND_DEBUG_IN_VORTEX, COMMAND_BUILD, COMMAND_PACKAGE_ZIP, COMMAND_OPEN_PLUGINS_FOLDER, COMMAND_OPEN_VORTEX_LOG]);
            assert.deepStrictEqual(actions.map(action => action.command?.arguments), actions.map(() => [{ project: row.project }]));
            assert.ok(actions.every(action => action.contextValue === undefined));
        });

        test('a library is available, added, or installed but not listed', () => {
            const available = libraryRow({});
            assert.strictEqual(available.contextValue, ROW_LIBRARY_AVAILABLE);
            assert.strictEqual(available.description, LIBRARY.description);
            assert.strictEqual(available.tooltip, LIBRARY.description);
            assert.strictEqual(available.library, LIBRARY);

            const added = libraryRow({ status: status({ dependencies: [LIBRARY.name], externals: [LIBRARY.name] }) });
            assert.strictEqual(added.contextValue, ROW_LIBRARY_ADDED);
            assert.strictEqual(iconOf(added), 'check');

            const unlisted = libraryRow({ status: status({ dependencies: [LIBRARY.name] }) });
            assert.strictEqual(unlisted.contextValue, ROW_LIBRARY_UNLISTED);
            assert.strictEqual(unlisted.description, 'not in vortex.externals');
            assert.strictEqual(iconOf(unlisted), 'warning');
        });

        test('every library of the catalogue is listed', () => {
            const libraries = buildSidebar(sidebarState())[2].children ?? [];
            assert.deepStrictEqual(libraries.map(node => node.label), VORTEX_LIBRARIES.map(library => library.name));
        });

        test('a snippet row shows its code and only inserts through its button', () => {
            const [name, snippet] = Object.entries(SNIPPETS)[0];
            const row = findRow(buildSidebar(sidebarState()), name);
            assert.strictEqual(row.description, snippet.description);
            assert.strictEqual(row.contextValue, ROW_SNIPPET);
            assert.strictEqual(row.snippet, snippet);
            assert.strictEqual(row.command, undefined);
            assert.ok((row.tooltip as vscode.MarkdownString).value.includes(snippet.body));
        });

        test('Help links to the guides, the GitHub repository and the issue tracker', () => {
            const roots = buildSidebar(sidebarState());
            assert.deepStrictEqual(roots[roots.length - 1].children?.map(row => row.label), ['Creating a game extension', 'Packaging a game extension', 'GitHub repository', 'Report an issue']);
            const repository = findRow(roots, 'repository');
            assert.strictEqual(repository.command?.command, BUILTIN_OPEN);
            assert.strictEqual(String(repository.command?.arguments?.[0]), vscode.Uri.parse(MANIFEST.repository.url).toString());
        });

        test('Add to Project is a placeholder that does nothing yet', () => {
            const row = findRow(buildSidebar(sidebarState()), 'add');
            assert.strictEqual(row.description, 'coming soon');
            assert.strictEqual(row.command, undefined);
            assert.strictEqual(row.contextValue, undefined);
            assert.strictEqual(row.children, undefined);
        });
    });

    suite('while a project is busy', () => {
        test('no row offers a button, so nothing can start next to the running action', () => {
            const row = rowState({ busy: ACTIVITY_BUILD, status: status({ missingDependencies: ['rollup'], deployment: 'out-of-date' }) });
            const nodes = flatten(buildSidebar(sidebarState([row]))).filter(node => node.project !== undefined);
            assert.deepStrictEqual(nodes.filter(node => node.contextValue !== undefined).map(node => node.id), []);
        });

        test('only the row doing the work spins', () => {
            const spinning = (busy: ProjectRowState['busy']) => flatten(buildSidebar(sidebarState([rowState({ busy, status: status({ missingDependencies: ['rollup'] }) })], { vortex: 'stopped' })))
                .filter(node => iconOf(node) === SPINNER)
                .map(node => node.id.split('#').slice(1).join('#'));
            assert.deepStrictEqual(spinning(ACTIVITY_BUILD), ['actions#build']);
            assert.deepStrictEqual(spinning(ACTIVITY_DEPLOY), ['status#deployment']);
            assert.deepStrictEqual(spinning(ACTIVITY_DEPENDENCIES), ['status#dependencies']);
            assert.deepStrictEqual(spinning(libraryActivity('adding', LIBRARY.name)), [`libraries#${LIBRARY.name}`]);
        });
    });

    suite('Vortex monitor', () => {
        function monitorFor(port: StubPort, launcher = stubLauncher(() => false), probesPerSlowTick = 5): VortexMonitor {
            return new VortexMonitor({ cdp: port, launcher, debug: stubDebug(), port: () => 9222, intervalMs: 1, probesPerSlowTick });
        }

        test('reads the phase from the windows behind the port', async () => {
            const port = new StubPort();
            const monitor = monitorFor(port);
            monitor.setActive(true);
            await waitUntil(() => monitor.phase === 'stopped');

            port.answer = { status: 'ok', value: [SPLASH_WINDOW, VORTEX_WINDOW] };
            await waitUntil(() => monitor.phase === 'starting');
            assert.strictEqual(monitor.isVortexRunning, true);

            port.answer = { status: 'ok', value: [VORTEX_WINDOW] };
            await waitUntil(() => monitor.phase === 'ready');

            port.answer = { status: 'ok', value: [OTHER_PAGE] };
            await waitUntil(() => monitor.phase === 'foreign');
            assert.strictEqual(monitor.isVortexRunning, false);

            port.answer = { status: 'foreign', detail: 'a web server' };
            await new Promise(resolve => setTimeout(resolve, 20));
            assert.strictEqual(monitor.phase, 'foreign');
            monitor.dispose();
        });

        test('fires only when something changed', async () => {
            const port = new StubPort();
            const monitor = monitorFor(port);
            let changes = 0;
            monitor.onDidChange(() => changes += 1);
            monitor.setActive(true);
            await waitUntil(() => port.calls >= 20);
            assert.strictEqual(changes, 1);
            monitor.dispose();
        });

        test('stops when nobody can see it, and a probe under way doesn\'t restart it', async () => {
            const port = new StubPort();
            const monitor = monitorFor(port);
            monitor.setActive(true);
            await waitUntil(() => port.calls >= 3);
            monitor.setActive(false);
            await new Promise(resolve => setTimeout(resolve, 10));
            const calls = port.calls;
            await new Promise(resolve => setTimeout(resolve, 20));
            assert.strictEqual(port.calls, calls);
            monitor.dispose();
        });

        test('never probes twice at once, however slowly the port answers', async () => {
            let running = 0;
            let most = 0;
            let probes = 0;
            const slow: CdpProbe = {
                version: () => assert.fail('the sidebar only asks for the windows'),
                targets: async () => {
                    running += 1;
                    probes += 1;
                    most = Math.max(most, running);
                    await new Promise(resolve => setTimeout(resolve, 5));
                    running -= 1;
                    return { status: 'closed' };
                },
            };
            const monitor = new VortexMonitor({ cdp: slow, launcher: stubLauncher(() => false), debug: stubDebug(), port: () => 9222, intervalMs: 1 });
            monitor.setActive(true);
            await waitUntil(() => probes >= 5);
            monitor.dispose();
            assert.strictEqual(most, 1);
        });

        test('only looks at the process list while the port is closed, and not on every probe', async () => {
            const port = new StubPort();
            port.answer = { status: 'ok', value: [VORTEX_WINDOW] };
            const launcher = stubLauncher(() => true);
            const monitor = monitorFor(port, launcher);
            monitor.setActive(true);
            await waitUntil(() => port.calls >= 10);
            assert.strictEqual(launcher.asked(), 0);

            port.answer = { status: 'closed' };
            await waitUntil(() => monitor.phase === 'running-without-port');
            const callsThen = port.calls;
            const askedThen = launcher.asked();
            await waitUntil(() => port.calls >= callsThen + 20);
            const probes = port.calls - callsThen;
            const asked = launcher.asked() - askedThen;
            assert.ok(asked <= Math.ceil(probes / 5) + 1, `asked ${asked} times in ${probes} probes`);
            assert.ok(asked >= 1);
            monitor.dispose();
        });

        test('asks about the process at once when the port closes, so a closed Vortex isn\'t reported as running', async () => {
            const port = new StubPort();
            port.answer = { status: 'ok', value: [VORTEX_WINDOW] };
            const monitor = monitorFor(port, stubLauncher(() => false), 1_000);
            monitor.setActive(true);
            await waitUntil(() => monitor.phase === 'ready');
            port.answer = { status: 'closed' };
            await waitUntil(() => monitor.phase === 'stopped');
            monitor.dispose();
        });

        test('reports a slow tick every few probes', async () => {
            const port = new StubPort();
            const monitor = monitorFor(port, undefined, 4);
            let ticks = 0;
            monitor.onDidSlowTick(() => ticks += 1);
            monitor.setActive(true);
            await waitUntil(() => ticks >= 2);
            assert.ok(port.calls >= 8);
            monitor.dispose();
        });

        test('knows which folder a debug session is attached for, ignoring nested sessions', () => {
            const debug = stubDebug();
            const monitor = new VortexMonitor({ cdp: new StubPort(), launcher: stubLauncher(() => false), debug, port: () => 9222 });
            let changes = 0;
            monitor.onDidChange(() => changes += 1);
            const one = project('one').folder;
            const two = project('two').folder;
            const session = vortexSession('outer', one);

            debug.start(session);
            debug.start(vortexSession('nested', two, session));
            assert.strictEqual(monitor.isAttached(one), true);
            assert.strictEqual(monitor.isAttached(two), false);
            assert.strictEqual(changes, 1);

            debug.end(session);
            assert.strictEqual(monitor.isAttached(one), false);
            assert.strictEqual(changes, 2);
            monitor.dispose();
        });
    });

    suite('Nexus lookup', () => {
        const gamesOf = (lookup: NexusGameLookup) => lookup.games;
        const games: NexusGame[] = [{ id: 9309, name: 'Coal LLC', domainName: 'coalllc' }, { id: 0, name: 'No id', domainName: 'noid' }];

        test('downloads once and leaves out entries without an id', async () => {
            let downloads = 0;
            let loaded = 0;
            const lookup = new NexusGameLookup(() => loaded += 1, {
                isEnabled: () => true,
                fetchGames: async () => {
                    downloads += 1;
                    return games;
                },
            });
            assert.strictEqual(gamesOf(lookup), undefined);
            await Promise.all([lookup.load(), lookup.load()]);
            await lookup.load();
            assert.strictEqual(downloads, 1);
            assert.strictEqual(loaded, 1);
            assert.strictEqual(gamesOf(lookup)?.get(9309)?.name, 'Coal LLC');
            assert.strictEqual(gamesOf(lookup)?.has(0), false);
        });

        test('a failed download is only repeated on request', async () => {
            let downloads = 0;
            const lookup = new NexusGameLookup(() => { }, {
                isEnabled: () => true,
                fetchGames: async () => {
                    downloads += 1;
                    if (downloads === 1) {
                        throw new Error('offline');
                    }
                    return games;
                },
            });
            await lookup.load();
            assert.strictEqual(gamesOf(lookup), undefined);
            await lookup.load();
            assert.strictEqual(downloads, 1);
            await lookup.retry();
            assert.strictEqual(downloads, 2);
            assert.ok(gamesOf(lookup)?.has(9309));
        });

        test('with the setting off nothing is downloaded or shown', async () => {
            let enabled = false;
            const lookup = new NexusGameLookup(() => { }, { isEnabled: () => enabled, fetchGames: async () => games });
            await lookup.load();
            assert.strictEqual(gamesOf(lookup), undefined);
            enabled = true;
            await lookup.load();
            assert.ok(gamesOf(lookup)?.has(9309));
            enabled = false;
            assert.strictEqual(gamesOf(lookup), undefined);
        });
    });

    suite('status', () => {
        async function projectOnDisk(name: string, files: Record<string, string>): Promise<VortexProject> {
            const uri = vscode.Uri.file(path.join(scratch, name));
            await Promise.all(Object.entries(files).map(([file, text]) => writeText(vscode.Uri.joinPath(uri, file), text)));
            return { folder: { uri, name, index: 0 } };
        }

        const manifest = (fields: object) => JSON.stringify({ devDependencies: { 'vortex-api': 'x', '@types/bluebird': '3.5.20', rollup: '4' }, ...fields });

        test('reads what the rows show from the project', async () => {
            const onDisk = await projectOnDisk('status-read', {
                'package.json': manifest({ displayName: 'Game: Status', version: '2.0.0', gameId: 4187, vortex: { externals: ['turbowalk'] } }),
                'src/common/constants.ts': 'export const GAME = {\n    id: \'statusgame\',\n    name: \'Status\',\n};\n',
                'node_modules/vortex-api/package.json': '{}',
                'node_modules/@types/bluebird/package.json': '{}',
            });
            assert.deepStrictEqual(await readProjectStatus(onDisk, undefined), {
                displayName: 'Game: Status',
                version: '2.0.0',
                nexusGameId: 4187,
                gameDomain: 'statusgame',
                dependencies: ['vortex-api', '@types/bluebird', 'rollup'],
                missingDependencies: ['rollup'],
                externals: ['turbowalk'],
                problems: { errors: 0, warnings: 0, notes: 0 },
                deployment: 'not-built',
            });
        });

        test('a gameId of 0, or none at all, counts as missing like in the build', async () => {
            for (const [name, fields] of [['status-zero', { gameId: 0 }], ['status-none', {}], ['status-text', { gameId: 'abc' }]] as const) {
                const onDisk = await projectOnDisk(name, { 'package.json': manifest(fields) });
                assert.strictEqual((await readProjectStatus(onDisk, undefined)).nexusGameId, undefined, name);
            }
        });

        test('a broken package.json doesn\'t stop the rows', async () => {
            const onDisk = await projectOnDisk('status-broken', { 'package.json': '{ not json' });
            const read = await readProjectStatus(onDisk, undefined);
            assert.strictEqual(read.displayName, undefined);
            assert.deepStrictEqual(read.dependencies, []);
        });
    });

    suite('provider', () => {
        class StubTracker implements SidebarTracker {
            private readonly emitter = new vscode.EventEmitter<FolderState>();
            readonly onDidRefresh = this.emitter.event;
            refreshes = 0;

            constructor(public projects: readonly VortexProject[]) { }

            async refreshAll(): Promise<void> {
                this.refreshes += 1;
            }

            fire(): void {
                const [first] = this.projects;
                this.emitter.fire({ folder: first.folder, project: first });
            }
        }

        function providerFor(tracker: StubTracker, overrides: Partial<SidebarDeps> = {}, activity = new ProjectActivity()) {
            const reads = { count: 0 };
            const port = new StubPort();
            const provider = new SidebarProvider(tracker, activity, {
                cdp: port,
                launcher: stubLauncher(() => false),
                debug: stubDebug(),
                port: () => 9222,
                intervalMs: 1,
                debounceMs: 1,
                pluginsFolder: async () => undefined,
                isEnabled: () => false,
                readStatus: async () => {
                    reads.count += 1;
                    return status();
                },
                ...overrides,
            });
            return { provider, reads, port, activity };
        }

        const labelsOf = async (provider: SidebarProvider): Promise<string[]> => flatten(await provider.getChildren()).map(node => node.label);

        test('the first request waits for the projects to be read', async () => {
            const { provider } = providerFor(new StubTracker([project('one')]));
            assert.strictEqual((await provider.getChildren())[0].label, 'Game: Coal LLC');
            provider.dispose();
        });

        test('rows become tree items that keep their id, state and command', async () => {
            const { provider } = providerFor(new StubTracker([project('one')]));
            const [header, actions, , snippets, addToProject] = await provider.getChildren();
            assert.strictEqual(provider.getTreeItem(header).collapsibleState, vscode.TreeItemCollapsibleState.Expanded);
            assert.strictEqual(provider.getTreeItem(snippets).collapsibleState, vscode.TreeItemCollapsibleState.Collapsed);
            assert.strictEqual(provider.getTreeItem(addToProject).collapsibleState, vscode.TreeItemCollapsibleState.None);
            const [debug] = await provider.getChildren(actions);
            const item = provider.getTreeItem(debug);
            assert.strictEqual(item.id, debug.id);
            assert.strictEqual(item.command?.command, COMMAND_DEBUG_IN_VORTEX);
            provider.dispose();
        });

        test('a screen reader gets the row\'s text, not its tooltip', async () => {
            const { provider } = providerFor(new StubTracker([project('one')]));
            const [header] = await provider.getChildren();
            assert.strictEqual(provider.getTreeItem(header).accessibilityInformation?.label, 'Game: Coal LLC, v1.2.0');
            const [dependencies, problems] = await provider.getChildren(header);
            assert.strictEqual(provider.getTreeItem(dependencies).accessibilityInformation?.label, 'Dependencies installed');
            assert.strictEqual(provider.getTreeItem(problems).accessibilityInformation?.label, 'No problems');
            provider.dispose();
        });

        test('nothing is read while the view is hidden', async () => {
            const tracker = new StubTracker([project('one')]);
            const { provider, reads, port } = providerFor(tracker);
            provider.setVisibility(false, true);
            tracker.fire();
            await new Promise(resolve => setTimeout(resolve, 20));
            assert.strictEqual(reads.count, 0);
            assert.strictEqual(port.calls, 0);
            provider.dispose();
        });

        test('polling waits for VS Code to have focus, but a visible view still shows what it knows', async () => {
            const tracker = new StubTracker([project('one')]);
            const { provider, reads, port } = providerFor(tracker);
            provider.setVisibility(true, false);
            await waitUntil(() => reads.count >= 1);
            assert.strictEqual(port.calls, 0);
            provider.setVisibility(true, true);
            await waitUntil(() => port.calls >= 1);
            provider.dispose();
        });

        test('the tree redraws only when something differs', async () => {
            const tracker = new StubTracker([project('one')]);
            let current = status();
            let reads = 0;
            const { provider } = providerFor(tracker, { readStatus: async () => {
                reads += 1;
                return current;
            } });
            await provider.getChildren();
            provider.setVisibility(true, false);
            let redraws = 0;
            provider.onDidChangeTreeData(() => redraws += 1);

            tracker.fire();
            await waitUntil(() => reads >= 2);
            await new Promise(resolve => setTimeout(resolve, 10));
            assert.strictEqual(redraws, 0);

            current = status({ version: '9.9.9' });
            tracker.fire();
            await waitUntil(() => redraws === 1);
            assert.strictEqual((await provider.getChildren())[0].description, 'v9.9.9');
            provider.dispose();
        });

        test('a slower, older read can\'t overwrite a newer one', async () => {
            const tracker = new StubTracker([project('one')]);
            const finishes: (() => void)[] = [];
            const answers = [status({ version: 'old' }), status({ version: 'new' })];
            const { provider } = providerFor(tracker, {
                readStatus: () => new Promise(resolve => {
                    const answer = answers.shift() ?? status({ version: 'later' });
                    finishes.push(() => resolve(answer));
                }),
            });
            provider.setVisibility(true, false);
            await waitUntil(() => finishes.length === 1);
            const first = provider.getChildren();
            tracker.fire();
            await waitUntil(() => finishes.length === 2);
            let redraws = 0;
            provider.onDidChangeTreeData(() => redraws += 1);
            finishes[1]();
            await waitUntil(() => redraws === 1);
            finishes[0]();
            await new Promise(resolve => setTimeout(resolve, 10));
            assert.strictEqual((await provider.getChildren())[0].description, 'vnew');
            await first;
            provider.dispose();
        });

        test('a project that is busy shows it straight away', async () => {
            const one = project('one');
            const { provider, activity } = providerFor(new StubTracker([one]));
            await provider.getChildren();
            let finish = () => { };
            const running = activity.run(one.folder, ACTIVITY_BUILD, () => new Promise<void>(resolve => {
                finish = resolve;
            }));
            assert.strictEqual(iconOf(findRow(await provider.getChildren(), 'actions#build')), SPINNER);
            finish();
            await running;
            assert.notStrictEqual(iconOf(findRow(await provider.getChildren(), 'actions#build')), SPINNER);
            provider.dispose();
        });

        test('a deploy while Vortex runs asks for a restart until Vortex stops', async () => {
            const one = project('one');
            const { provider, activity, port } = providerFor(new StubTracker([one]));
            port.answer = { status: 'ok', value: [VORTEX_WINDOW] };
            await provider.getChildren();
            provider.setVisibility(true, true);
            await waitUntil(() => port.calls >= 1);
            assert.ok((await waitForLabel(provider, 'Vortex running, debug port open')));

            await activity.run(one.folder, ACTIVITY_DEPLOY, async () => undefined);
            assert.ok(await waitForLabel(provider, 'Deployed, restart Vortex to load it'));

            port.answer = { status: 'closed' };
            assert.ok(await waitForLabel(provider, 'Deployed build is current'));
            provider.dispose();
        });

        test('a deploy without a running Vortex needs no restart', async () => {
            const one = project('one');
            const { provider, activity, port } = providerFor(new StubTracker([one]));
            await provider.getChildren();
            provider.setVisibility(true, true);
            await waitUntil(() => port.calls >= 2);
            await activity.run(one.folder, ACTIVITY_DEPLOY, async () => undefined);
            assert.ok((await labelsOf(provider)).includes('Deployed build is current'));
            provider.dispose();
        });

        test('Refresh detects the projects again and retries the game list', async () => {
            const tracker = new StubTracker([project('one')]);
            let downloads = 0;
            const { provider } = providerFor(tracker, {
                isEnabled: () => true,
                fetchGames: async () => {
                    downloads += 1;
                    throw new Error('offline');
                },
            });
            provider.setVisibility(true, false);
            await provider.getChildren();
            await provider.refresh();
            assert.strictEqual(tracker.refreshes, 1);
            assert.ok(downloads >= 1);
            provider.dispose();
        });

        async function waitForLabel(provider: SidebarProvider, label: string): Promise<boolean> {
            const deadline = Date.now() + 5_000;
            while (Date.now() < deadline) {
                if ((await labelsOf(provider)).includes(label)) {
                    return true;
                }
                await new Promise(resolve => setTimeout(resolve, 2));
            }
            return false;
        }
    });
});
