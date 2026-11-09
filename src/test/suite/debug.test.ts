import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import { buildBlockers, validateProject, type ProjectSnapshot } from '../../checks/validation';
import { DEBUG_PORT_DEFAULT, DEBUG_SESSION_TYPE } from '../../constants';
import { topLevelBreakpointHint, vortexAttachConfiguration } from '../../debug/attachConfiguration';
import { CdpTimeoutError, ForeignPortError, pickPageTarget, waitForPageTarget, type CdpProbe, type CdpTarget } from '../../debug/cdpProbe';
import { runDebugFlow, type DebugFlowUi } from '../../debug/debugFlow';
import { watchVortexDebugSessions, type DebugHost } from '../../debug/debugSessionWatcher';
import { deployPack, InvalidPackIdError, isDeployedCurrent, PackMissingError, readPackId } from '../../debug/packDeployment';
import { defaultPluginsFolder, vortexExeCandidates, vortexUserDataFolder } from '../../debug/vortexInstall';
import { debugArguments, type LaunchedVortex, type VortexLauncher } from '../../debug/vortexLauncher';
import { renderProject, requiredFiles } from '../../templates/registry';
import type { Finding, VortexProject } from '../../types/project';
import { copyDirectoryContents, emptyDirectory, fileExists, writeText } from '../../utils/fileSystemUtils';
import { TS_FIXTURE_VALUES } from '../fixtures/createFixtureWorkspace';

const scratch = process.env.VORTEX_HELPER_SCRATCH ?? '';
const NEVER_ASKED: DebugFlowUi = {
    confirmPortInUse: () => assert.fail('should not have asked about the port'),
    confirmVortexRunning: () => assert.fail('should not have asked about a running Vortex'),
    confirmForceClose: () => assert.fail('should not have asked to force close'),
};
const NO_TOKEN = new vscode.CancellationTokenSource().token;

function snapshot(overrides: Partial<ProjectSnapshot> = {}): ProjectSnapshot {
    const output = renderProject(TS_FIXTURE_VALUES).find(candidate => candidate.path === 'package.json');
    return {
        packageJsonText: output?.content as string,
        existingFiles: new Set(requiredFiles().map(file => file.path)),
        gameartExists: true,
        ...overrides,
    };
}

function blockerRules(snapshotToCheck: ProjectSnapshot): string[] {
    return buildBlockers(validateProject(snapshotToCheck)).map((finding: Finding) => finding.rule);
}

const wait = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

async function waitUntil(condition: () => boolean, timeoutMs = 5_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (!condition() && Date.now() < deadline) {
        await wait(5);
    }
    assert.ok(condition(), 'condition was not met in time');
}

/** VS Code's debug sessions, driven by the test instead of by a running debugger */
class StubDebugHost implements DebugHost {
    private readonly started = new vscode.EventEmitter<vscode.DebugSession>();
    private readonly terminated = new vscode.EventEmitter<vscode.DebugSession>();
    private next = 0;
    readonly stopped: string[] = [];

    readonly onDidStartDebugSession = this.started.event;
    readonly onDidTerminateDebugSession = this.terminated.event;

    async stopDebugging(session: vscode.DebugSession): Promise<void> {
        this.stopped.push(session.id);
        this.terminated.fire(session);
    }

    start(configuration: vscode.DebugConfiguration & { id?: string }, parentSession?: vscode.DebugSession): vscode.DebugSession {
        const session = {
            id: configuration.id ?? `session-${this.next++}`,
            type: configuration.type,
            name: configuration.name,
            workspaceFolder: undefined,
            configuration,
            parentSession,
            customRequest: async () => undefined,
            getDebugProtocolBreakpoint: async () => undefined,
        } as unknown as vscode.DebugSession;
        this.started.fire(session);
        return session;
    }
}

function target(type: string, url: string): CdpTarget {
    return { id: `${type}-${url}`, type, url };
}

function stubProbe(versions: readonly ('ok' | 'closed' | 'foreign')[], targetLists: readonly (readonly CdpTarget[])[]): CdpProbe {
    let versionCall = 0;
    let targetCall = 0;
    return {
        async version() {
            const status = versions[Math.min(versionCall++, versions.length - 1)];
            return status === 'ok' ? { status, value: { browser: 'Vortex/2.8.2 Chrome/152' } } : status === 'closed' ? { status } : { status, detail: 'a web server' };
        },
        async targets() {
            const list = targetLists[Math.min(targetCall++, targetLists.length - 1)] ?? [];
            return { status: 'ok', value: list };
        },
    };
}

function stubLauncher(overrides: Partial<VortexLauncher> = {}): VortexLauncher & { launches: string[][] } {
    const launches: string[][] = [];
    return {
        launches,
        launch(exe, args): LaunchedVortex {
            launches.push([exe, ...args]);
            return { pid: 1, exited: new Promise<number | null>(() => { }), release: () => { } };
        },
        isVortexRunning: async () => false,
        ...overrides,
    };
}

suite('Debug in Vortex', () => {
    test('vortexExeCandidates covers per-machine and per-user installs', () => {
        const windows = vortexExeCandidates('win32', { PROGRAMFILES: 'C:\\Program Files', LOCALAPPDATA: 'C:\\Users\\x\\AppData\\Local' });
        assert.deepStrictEqual(windows, [
            path.join('C:\\Program Files', 'Black Tree Gaming Ltd', 'Vortex', 'Vortex.exe'),
            path.join('C:\\Program Files', 'Vortex', 'Vortex.exe'),
            path.join('C:\\Users\\x\\AppData\\Local', 'Programs', 'Black Tree Gaming Ltd', 'Vortex', 'Vortex.exe'),
            path.join('C:\\Users\\x\\AppData\\Local', 'Programs', 'Vortex', 'Vortex.exe'),
        ]);
    });

    test('vortexExeCandidates drops only the candidates whose environment variable is missing', () => {
        assert.deepStrictEqual(vortexExeCandidates('win32', {}), []);
        assert.strictEqual(vortexExeCandidates('win32', { PROGRAMFILES: 'C:\\Program Files' }).length, 2);
        assert.deepStrictEqual(vortexExeCandidates('linux', {}), ['/usr/bin/vortex', '/usr/local/bin/vortex']);
        assert.deepStrictEqual(vortexExeCandidates('darwin', {}), ['/Applications/Vortex.app/Contents/MacOS/Vortex']);
        assert.deepStrictEqual(vortexExeCandidates('aix', { HOME: '/home/x' }), []);
    });

    test('the plugins folder follows each platform\'s user data folder', () => {
        assert.strictEqual(defaultPluginsFolder('win32', { APPDATA: 'C:\\Users\\x\\AppData\\Roaming' }), path.join('C:\\Users\\x\\AppData\\Roaming', 'Vortex', 'plugins'));
        assert.strictEqual(defaultPluginsFolder('darwin', { HOME: '/Users/x' }), path.join('/Users/x', 'Library', 'Application Support', 'Vortex', 'plugins'));
        assert.strictEqual(defaultPluginsFolder('linux', { HOME: '/home/x' }), path.join('/home/x', '.config', 'Vortex', 'plugins'));
        assert.strictEqual(defaultPluginsFolder('linux', { HOME: '/home/x', XDG_CONFIG_HOME: '/tmp/cfg' }), path.join('/tmp/cfg', 'Vortex', 'plugins'));
        assert.strictEqual(vortexUserDataFolder('win32', {}), undefined);
    });

    test('buildBlockers reports what would fail the build and nothing else', () => {
        assert.deepStrictEqual(blockerRules(snapshot()), []);
        const withoutGameId = JSON.parse(snapshot().packageJsonText);
        delete withoutGameId.gameId;
        assert.deepStrictEqual(blockerRules(snapshot({ packageJsonText: JSON.stringify(withoutGameId, null, 4) })), ['required-field']);
        assert.deepStrictEqual(blockerRules(snapshot({ gameartExists: false })), ['gameart-missing']);
        assert.deepStrictEqual(blockerRules(snapshot({ existingFiles: new Set() })), requiredFiles().map(() => 'required-file'));
        assert.deepStrictEqual([...new Set(blockerRules(snapshot({ packageJsonText: '{ "name": ' })))], ['package-json-syntax']);
    });

    test('buildBlockers ignores findings the build tolerates, even errors', () => {
        const manifest = JSON.parse(snapshot().packageJsonText);
        manifest.displayName = 'No prefix';
        const findings = validateProject(snapshot({
            packageJsonText: JSON.stringify(manifest, null, 4),
            vortexApiManifestText: JSON.stringify({ name: 'vortex-api', version: '2.3.0', peerDependencies: { '@types/bluebird': '3.5.99' } }),
        }));
        assert.ok(findings.some(finding => finding.rule === 'display-name-prefix'));
        assert.ok(findings.some(finding => finding.rule === 'bluebird-peer' && finding.severity === 'error'));
        assert.deepStrictEqual(buildBlockers(findings), []);
    });

    test('pickPageTarget takes the attachable renderer', () => {
        assert.strictEqual(pickPageTarget([]), undefined);
        assert.strictEqual(pickPageTarget([target('service_worker', 'https://x'), target('other', 'about:blank')]), undefined);
        assert.strictEqual(pickPageTarget([target('page', 'devtools://devtools/x')]), undefined);
        assert.strictEqual(pickPageTarget([target('worker', 'file:///w.js'), target('page', 'file:///app.asar/index.html')])?.url, 'file:///app.asar/index.html');
        assert.strictEqual(pickPageTarget([target('iframe', 'file:///i.html')])?.type, 'iframe');
    });

    test('pickPageTarget waits for the splash to close, which is when the renderer is up', () => {
        const splash = target('page', 'file:///C:/Program%20Files/Vortex/resources/app.asar/splash.html?disableGPU=0');
        const main = target('page', 'file:///C:/Program%20Files/Vortex/resources/app.asar/index.html');
        assert.strictEqual(pickPageTarget([splash]), undefined, 'the splash alone is not attachable');
        // the main window target exists from the moment it loads, well before Vortex has finished
        // starting, and attaching then pauses a startup breakpoint with no session to report it
        assert.strictEqual(pickPageTarget([splash, main]), undefined, 'still starting while the splash is up');
        assert.strictEqual(pickPageTarget([main])?.url, main.url);
    });

    test('debugArguments passes only what a release Vortex needs', () => {
        assert.deepStrictEqual(debugArguments(9333), ['--remote-debugging-port=9333', '--remote-allow-origins=*']);
    });

    test('waitForPageTarget waits for the window, not just the port', async () => {
        const probe = stubProbe(['closed', 'ok', 'ok'], [[], [target('page', 'file:///app.asar/index.html')]]);
        const phases: string[] = [];
        const page = await waitForPageTarget(probe, 9222, { timeoutMs: 5_000, intervalMs: 1, onProgress: phase => phases.push(phase) });
        assert.strictEqual(page.type, 'page');
        assert.deepStrictEqual([...new Set(phases)], ['waiting', 'browser']);
    });

    test('waitForPageTarget separates a dead port from a window that never appears', async () => {
        await assert.rejects(
            () => waitForPageTarget(stubProbe(['closed'], [[]]), 9222, { timeoutMs: 30, intervalMs: 1 }),
            (e: unknown) => e instanceof CdpTimeoutError && e.reached === 'nothing'
        );
        await assert.rejects(
            () => waitForPageTarget(stubProbe(['ok'], [[]]), 9222, { timeoutMs: 30, intervalMs: 1 }),
            (e: unknown) => e instanceof CdpTimeoutError && e.reached === 'browser-only'
        );
    });

    test('waitForPageTarget fails fast when something else owns the port', async () => {
        await assert.rejects(
            () => waitForPageTarget(stubProbe(['foreign'], [[]]), 9222, { timeoutMs: 10_000, intervalMs: 1 }),
            (e: unknown) => e instanceof ForeignPortError
        );
    });

    test('waitForPageTarget honours cancellation', async () => {
        const source = new vscode.CancellationTokenSource();
        source.cancel();
        await assert.rejects(() => waitForPageTarget(stubProbe(['closed'], [[]]), 9222, { token: source.token, intervalMs: 1 }), vscode.CancellationError);
    });

    test('the attach configuration maps the bundle\'s sources back to the workspace', () => {
        const folder = vscode.Uri.file('F:\\projects\\tsgame-support');
        // Uri.file normalizes the drive letter, so the expectation follows fsPath rather than the input
        const workspace = folder.fsPath.replace(/\\/g, '/');
        const configuration = vortexAttachConfiguration({ packId: 'tsgame-support', folder, port: 9222 });
        assert.deepStrictEqual(configuration, {
            type: DEBUG_SESSION_TYPE,
            request: 'attach',
            name: 'Vortex: tsgame-support',
            address: '127.0.0.1',
            port: 9222,
            timeout: 30_000,
            // measured against a live Vortex: "*/index.html" matches nothing and the attach hangs
            urlFilter: '*index.html',
            webRoot: workspace,
            sourceMaps: true,
            sourceMapPathOverrides: { 'tsgame-support:///*': `${workspace}/*` },
        });
        assert.ok(!workspace.includes('\\'), 'the override value has to be posix, because fsPath is not');
    });

    test('the attach configuration leaves out what the bare script url would break', () => {
        const configuration = vortexAttachConfiguration({ packId: 'x-support', folder: vscode.Uri.file('/p'), port: 1 });
        // the renderer reports the bundle as a bare path, so these would exclude it instead of helping
        assert.ok(!('outFiles' in configuration));
        assert.ok(!('resolveSourceMapLocations' in configuration));
        assert.ok(!('preLaunchTask' in configuration));
        const keys = Object.keys(configuration.sourceMapPathOverrides as Record<string, string>);
        assert.strictEqual(keys.length, 1);
        // js-debug substitutes a single capturing * per pattern
        assert.strictEqual(keys[0].split('*').length - 1, 1);
    });

    test('a breakpoint in the entry file is reported, one in a callback file is not', () => {
        const folder = vscode.Uri.file(path.join(scratch, 'hint-project'));
        const at = (relative: string): vscode.Breakpoint =>
            new vscode.SourceBreakpoint(new vscode.Location(vscode.Uri.joinPath(folder, relative), new vscode.Position(1, 0)));
        assert.ok(topLevelBreakpointHint(folder, [at('src/index.ts')])?.includes('main()'));
        assert.strictEqual(topLevelBreakpointHint(folder, [at('src/installers/mods.ts')]), undefined);
        assert.strictEqual(topLevelBreakpointHint(folder, []), undefined);
        assert.strictEqual(topLevelBreakpointHint(folder, [new vscode.FunctionBreakpoint('main')]), undefined);
        assert.strictEqual(topLevelBreakpointHint(vscode.Uri.file(path.join(scratch, 'other')), [at('src/index.ts')]), undefined);
    });

    test('a session attached to a Vortex that is gone is ended, since js-debug keeps retrying forever', async () => {
        const host = new StubDebugHost();
        let alive = true;
        const probe: CdpProbe = {
            version: async () => (alive ? { status: 'ok', value: { browser: 'Vortex/2.8.2' } } : { status: 'closed' }),
            targets: async () => ({ status: 'ok', value: [] }),
        };
        const watcher = watchVortexDebugSessions({ probe, host, intervalMs: 5, misses: 3 });
        try {
            // js-debug resolves the contributed "chrome" type to its own "pwa-chrome"
            const configuration = { ...vortexAttachConfiguration({ packId: 'watched-support', folder: vscode.Uri.file(path.join(scratch, 'watched')), port: 9299 }), type: 'pwa-chrome' };
            const child = host.start({ ...configuration, id: 'child' }, host.start(configuration));
            await wait(40);
            assert.deepStrictEqual(host.stopped, [], 'a live Vortex keeps the session');
            alive = false;
            await waitUntil(() => host.stopped.length > 0);
            // the child is watched by nobody, so the session that holds the configuration is stopped once
            assert.deepStrictEqual(host.stopped, ['session-0'], 'the outer session is stopped, exactly once');
            assert.strictEqual(child.id, 'child');
        } finally {
            watcher.dispose();
        }
    });

    test('the session is watched whichever name js-debug resolves the chrome type to', async () => {
        const configuration = vortexAttachConfiguration({ packId: 'either-support', folder: vscode.Uri.file(path.join(scratch, 'either')), port: 9298 });
        for (const type of [DEBUG_SESSION_TYPE, 'pwa-chrome']) {
            const host = new StubDebugHost();
            const watcher = watchVortexDebugSessions({
                probe: { version: async () => ({ status: 'closed' }), targets: async () => ({ status: 'closed' }) },
                host,
                intervalMs: 5,
                misses: 2,
            });
            try {
                host.start({ ...configuration, type });
                await waitUntil(() => host.stopped.length > 0);
                assert.strictEqual(host.stopped.length, 1, type);
            } finally {
                watcher.dispose();
            }
        }
    });

    test('a debug session that is not a Vortex attach is left alone', async () => {
        const host = new StubDebugHost();
        const probe: CdpProbe = { version: async () => ({ status: 'closed' }), targets: async () => ({ status: 'closed' }) };
        const watcher = watchVortexDebugSessions({ probe, host, intervalMs: 5, misses: 2 });
        try {
            host.start({ type: 'chrome', request: 'attach', name: 'Other', port: 9222, sourceMapPathOverrides: { 'webpack://*/*': '*' } });
            host.start({ type: 'node', request: 'attach', name: 'Node', port: 9229 });
            await wait(60);
            assert.deepStrictEqual(host.stopped, [], 'only a Vortex attach is ours to end');
        } finally {
            watcher.dispose();
        }
    });

    test('the port default is the one the manifest contributes', () => {
        assert.strictEqual(DEBUG_PORT_DEFAULT, 9222);
    });

    suite('deploy', () => {
        const projectFolder = (name: string): vscode.Uri => vscode.Uri.file(path.join(scratch, name));

        test('readPackId refuses an id that would escape the plugins folder', async () => {
            const folder = projectFolder('pack-id');
            for (const id of ['../../..', 'a/b', 'C:\\x', '', '.hidden']) {
                await writeText(vscode.Uri.joinPath(folder, '.pack', 'info.json'), JSON.stringify({ id }));
                await assert.rejects(() => readPackId(folder), InvalidPackIdError, `accepted ${JSON.stringify(id)}`);
            }
            await writeText(vscode.Uri.joinPath(folder, '.pack', 'info.json'), JSON.stringify({ id: 'tsgame-support' }));
            assert.strictEqual(await readPackId(folder), 'tsgame-support');
        });

        test('readPackId reports a project that was never built', async () => {
            await assert.rejects(() => readPackId(projectFolder('never-built')), PackMissingError);
        });

        test('deployPack replaces the deployed copy and keeps the folder itself', async () => {
            const folder = projectFolder('deploy-source');
            const plugins = projectFolder('deploy-plugins');
            await writeText(vscode.Uri.joinPath(folder, '.pack', 'index.js'), 'module.exports = 1;');
            await writeText(vscode.Uri.joinPath(folder, '.pack', 'info.json'), JSON.stringify({ id: 'deployed-support' }));
            await writeText(vscode.Uri.joinPath(folder, '.pack', 'nested', 'extra.txt'), 'kept');
            const deployed = vscode.Uri.joinPath(plugins, 'deployed-support');
            await writeText(vscode.Uri.joinPath(deployed, 'stale.js'), 'old');

            const files = await deployPack(folder.with({ path: folder.path }), plugins, 'deployed-support');

            assert.strictEqual(files, 3);
            assert.ok(await fileExists(vscode.Uri.joinPath(deployed, 'index.js')));
            assert.ok(await fileExists(vscode.Uri.joinPath(deployed, 'nested', 'extra.txt')));
            assert.ok(!await fileExists(vscode.Uri.joinPath(deployed, 'stale.js')));
            assert.ok(await isDeployedCurrent(folder, plugins, 'deployed-support'));
        });

        test('isDeployedCurrent sees a build that was never deployed', async () => {
            const folder = projectFolder('stale-source');
            const plugins = projectFolder('stale-plugins');
            await writeText(vscode.Uri.joinPath(folder, '.pack', 'index.js'), 'module.exports = 2;');
            assert.strictEqual(await isDeployedCurrent(folder, plugins, 'missing-support'), false);
            await writeText(vscode.Uri.joinPath(plugins, 'missing-support', 'index.js'), 'module.exports = 3;');
            assert.strictEqual(await isDeployedCurrent(folder, plugins, 'missing-support'), false);
        });

        test('emptyDirectory and copyDirectoryContents keep the target directory', async () => {
            const source = projectFolder('copy-source');
            const destination = projectFolder('copy-target');
            await writeText(vscode.Uri.joinPath(source, 'a.txt'), 'a');
            await writeText(vscode.Uri.joinPath(source, 'deep', 'b.txt'), 'b');
            await writeText(vscode.Uri.joinPath(destination, 'old.txt'), 'old');

            await emptyDirectory(destination);
            assert.ok(await fileExists(destination));
            assert.ok(!await fileExists(vscode.Uri.joinPath(destination, 'old.txt')));
            assert.strictEqual(await copyDirectoryContents(source, destination), 2);
            assert.ok(await fileExists(vscode.Uri.joinPath(destination, 'deep', 'b.txt')));
        });
    });

    suite('flow', () => {
        function project(name: string): VortexProject {
            const uri = vscode.Uri.file(path.join(scratch, name));
            return { folder: { uri, name, index: 0 } };
        }

        async function buildablePack(folder: vscode.Uri, id: string): Promise<void> {
            await writeText(vscode.Uri.joinPath(folder, '.pack', 'index.js'), 'module.exports = 1;');
            await writeText(vscode.Uri.joinPath(folder, '.pack', 'info.json'), JSON.stringify({ id }));
        }

        test('builds, deploys, starts Vortex and attaches, in that order', async () => {
            const flowProject = project('flow-happy');
            const plugins = vscode.Uri.file(path.join(scratch, 'flow-happy-plugins'));
            const calls: string[] = [];
            const launcher = stubLauncher();
            const outcome = await runDebugFlow(
                {
                    project: flowProject,
                    install: { exe: 'C:\\Vortex\\Vortex.exe', pluginsFolder: plugins },
                    port: 9222,
                    ui: NEVER_ASKED,
                    report: () => { },
                    token: NO_TOKEN,
                },
                {
                    launcher: { ...launcher, launch: (exe, args) => {
                        calls.push('launch'); return launcher.launch(exe, args); 
                    } },
                    cdp: stubProbe(['closed', 'ok'], [[target('page', 'file:///index.html')]]),
                    build: async folder => {
                        calls.push('build'); await buildablePack(folder.uri, 'flow-support'); 
                    },
                    startDebugging: async (_folder, configuration) => {
                        calls.push(`attach:${Object.keys(configuration.sourceMapPathOverrides as Record<string, string>)[0]}`); return true; 
                    },
                }
            );

            assert.deepStrictEqual(outcome, { kind: 'attached', packId: 'flow-support', reused: false });
            // the override key follows the project folder, not the extension id in .pack/info.json
            assert.deepStrictEqual(calls, ['build', 'launch', 'attach:flow-happy:///*']);
            assert.ok(await fileExists(vscode.Uri.joinPath(plugins, 'flow-support', 'index.js')));
        });

        test('attaching to a running Vortex skips the build and the launch', async () => {
            const flowProject = project('flow-attach');
            await buildablePack(flowProject.folder.uri, 'attach-support');
            const calls: string[] = [];
            const outcome = await runDebugFlow(
                {
                    project: flowProject,
                    install: { exe: 'x', pluginsFolder: vscode.Uri.file(path.join(scratch, 'flow-attach-plugins')) },
                    port: 9222,
                    ui: { ...NEVER_ASKED, confirmPortInUse: async stale => {
                        calls.push(`asked:stale=${stale}`); return 'attach'; 
                    } },
                    report: () => { },
                    token: NO_TOKEN,
                },
                {
                    cdp: stubProbe(['ok'], [[target('page', 'file:///index.html')]]),
                    launcher: stubLauncher({ launch: () => assert.fail('should not have launched Vortex') }),
                    build: async () => assert.fail('should not have built'),
                    startDebugging: async () => {
                        calls.push('attach'); return true; 
                    },
                }
            );

            assert.deepStrictEqual(outcome, { kind: 'attached', packId: 'attach-support', reused: true });
            assert.deepStrictEqual(calls, ['asked:stale=true', 'attach']);
        });

        test('a Vortex that quits is reported as the single instance lock', async () => {
            const flowProject = project('flow-locked');
            const outcome = await runDebugFlow(
                {
                    project: flowProject,
                    install: { exe: 'x', pluginsFolder: vscode.Uri.file(path.join(scratch, 'flow-locked-plugins')) },
                    port: 9222,
                    ui: NEVER_ASKED,
                    report: () => { },
                    token: NO_TOKEN,
                },
                {
                    cdp: stubProbe(['closed'], [[]]),
                    launcher: stubLauncher({ launch: () => ({ pid: 2, exited: Promise.resolve(0), release: () => { } }) }),
                    build: async folder => buildablePack(folder.uri, 'locked-support'),
                    startDebugging: async () => assert.fail('should not have attached'),
                }
            );

            assert.strictEqual(outcome.kind, 'failed');
            assert.ok(outcome.kind === 'failed' && outcome.reason.includes('single instance lock'));
        });

        test('an extension Vortex deleted while starting is reported instead of attached to', async () => {
            const flowProject = project('flow-removed');
            const plugins = vscode.Uri.file(path.join(scratch, 'flow-removed-plugins'));
            let versionCalls = 0;
            const outcome = await runDebugFlow(
                {
                    project: flowProject,
                    install: { exe: 'x', pluginsFolder: plugins },
                    port: 9222,
                    ui: NEVER_ASKED,
                    report: () => { },
                    token: NO_TOKEN,
                },
                {
                    // Vortex deletes the folder while it starts, so the delete lands before the window does
                    cdp: {
                        version: async () => (versionCalls++ === 0
                            ? { status: 'closed' }
                            : { status: 'ok', value: { browser: 'Vortex/2.8.2' } }),
                        targets: async () => {
                            await emptyDirectory(vscode.Uri.joinPath(plugins, 'removed-support'));
                            return { status: 'ok', value: [target('page', 'file:///app.asar/index.html')] };
                        },
                    },
                    launcher: stubLauncher(),
                    build: async folder => buildablePack(folder.uri, 'removed-support'),
                    startDebugging: async () => assert.fail('should not have attached'),
                }
            );

            assert.deepStrictEqual(outcome, { kind: 'removed', packId: 'removed-support' });
        });

        test('declining the port question attaches nothing', async () => {
            const flowProject = project('flow-declined');
            await buildablePack(flowProject.folder.uri, 'declined-support');
            const outcome = await runDebugFlow(
                {
                    project: flowProject,
                    install: { exe: 'x', pluginsFolder: vscode.Uri.file(path.join(scratch, 'flow-declined-plugins')) },
                    port: 9222,
                    ui: { ...NEVER_ASKED, confirmPortInUse: async () => 'cancel' },
                    report: () => { },
                    token: NO_TOKEN,
                },
                {
                    cdp: stubProbe(['ok'], [[]]),
                    launcher: stubLauncher(),
                    build: async () => assert.fail('should not have built'),
                    startDebugging: async () => assert.fail('should not have attached'),
                }
            );

            assert.deepStrictEqual(outcome, { kind: 'declined' });
        });

        test('a running Vortex without the port is reported before anything is built', async () => {
            const flowProject = project('flow-running');
            const outcome = await runDebugFlow(
                {
                    project: flowProject,
                    install: { exe: 'x', pluginsFolder: vscode.Uri.file(path.join(scratch, 'flow-running-plugins')) },
                    port: 9222,
                    ui: { ...NEVER_ASKED, confirmVortexRunning: async () => 'cancel' },
                    report: () => { },
                    token: NO_TOKEN,
                },
                {
                    cdp: stubProbe(['closed'], [[]]),
                    launcher: stubLauncher({ isVortexRunning: async () => true }),
                    build: async () => assert.fail('should not have built'),
                    startDebugging: async () => assert.fail('should not have attached'),
                }
            );

            assert.deepStrictEqual(outcome, { kind: 'declined' });
        });
    });
});
