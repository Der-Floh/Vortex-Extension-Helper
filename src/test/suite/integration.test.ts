import * as assert from 'assert';
import * as fs from 'fs';
import * as http from 'http';
import * as path from 'path';
import * as vscode from 'vscode';
import pkg from '../../../package.json';
import type { VortexDiagnostics } from '../../checks/vortexDiagnostics';
import { COMMAND_CREATE_MISSING_FILES, COMMAND_RUN_WORKSPACE_CHECKS, DIAGNOSTIC_SOURCE, PENDING_INSTALL_KEY } from '../../constants';
import { vortexAttachConfiguration } from '../../debug/attachConfiguration';
import { HTTP_CDP } from '../../debug/cdpProbe';
import { requestVortexClose } from '../../debug/vortexLauncher';
import { TargetNotEmptyError, writeNewProject } from '../../templates/projectWriter';
import { renderProject } from '../../templates/registry';
import { runTask } from '../../utils/taskUtils';
import { resumePendingInstall, savePendingInstall, type PendingInstall } from '../../wizard/pendingInstall';
import { FIXTURE_FOLDERS, TS_FIXTURE_VALUES } from '../fixtures/createFixtureWorkspace';

class MemoryState implements vscode.Memento {
    private readonly values = new Map<string, unknown>();

    keys(): readonly string[] {
        return [...this.values.keys()];
    }

    get<T>(key: string, defaultValue?: T): T | undefined {
        return this.values.has(key) ? this.values.get(key) as T : defaultValue;
    }

    async update(key: string, value: unknown): Promise<void> {
        if (value === undefined) {
            this.values.delete(key);
        } else {
            this.values.set(key, value);
        }
    }
}

const VORTEX_TEST_PORT = 9222;

suite('Vortex Extension Helper integration', () => {
    const scratch = process.env.VORTEX_HELPER_SCRATCH ?? '';

    suiteSetup(async () => {
        assert.ok(scratch, 'VORTEX_HELPER_SCRATCH is not set');
        const extension = vscode.extensions.getExtension(`${pkg.publisher}.${pkg.name}`);
        assert.ok(extension, 'The extension under test is missing');
        await extension.activate();
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    });

    suiteTeardown(async () => {
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    });

    test('writes a new project', async () => {
        const target = path.join(scratch, 'new-typescript');
        const outputs = renderProject(TS_FIXTURE_VALUES);
        await writeNewProject(vscode.Uri.file(target), outputs);
        assert.deepStrictEqual(listFiles(target).sort(), outputs.map(output => output.path).sort());
        assert.strictEqual(fs.readFileSync(path.join(target, 'package.json'), 'utf8'), outputs[0].content);
        assert.deepStrictEqual([...fs.readFileSync(path.join(target, 'assets/gameart.jpg')).subarray(0, 3)], [0xFF, 0xD8, 0xFF]);
    });

    test('refuses a folder that has content and leaves it untouched', async () => {
        const target = path.join(scratch, 'occupied');
        fs.mkdirSync(target);
        fs.writeFileSync(path.join(target, 'keep.txt'), 'keep');
        await assert.rejects(writeNewProject(vscode.Uri.file(target), renderProject(TS_FIXTURE_VALUES)), TargetNotEmptyError);
        assert.deepStrictEqual(fs.readdirSync(target), ['keep.txt']);
    });

    test('a failed write removes only what it created', async () => {
        const base = path.join(scratch, 'rollback-base');
        const target = path.join(base, 'project');
        fs.mkdirSync(target, { recursive: true });
        fs.writeFileSync(path.join(base, 'sibling.txt'), 'sibling');
        const outputs = [
            { path: 'a.txt', content: 'a' },
            { path: 'dir/b.txt', content: 'b' },
            { path: 'a.txt/c.txt', content: 'a file is in the way' },
        ];

        await assert.rejects(writeNewProject(vscode.Uri.file(target), outputs));
        assert.deepStrictEqual(fs.readdirSync(target), []);
        assert.deepStrictEqual(fs.readdirSync(base).sort(), ['project', 'sibling.txt']);
    });

    test('detects the projects without prompts and reports their findings', async () => {
        const tsPackageJson = fixtureUri(FIXTURE_FOLDERS.typescript, 'package.json');
        await waitFor(() => codes(tsPackageJson).includes('vortex-api-not-installed'), 'ts-project got no diagnostics');
        assert.deepStrictEqual(codes(fixtureUri(FIXTURE_FOLDERS.legacy, 'package.json')), []);
        assert.deepStrictEqual(codes(fixtureUri(FIXTURE_FOLDERS.plain, 'package.json')), []);
        assert.ok(!codes(tsPackageJson).some(code => code === 'required-field' || code === 'required-file'));
    });

    test('Run Workspace Checks runs without asking for a project', async () => {
        await vscode.commands.executeCommand(COMMAND_RUN_WORKSPACE_CHECKS);
    });

    test('validates package.json while it is edited', async () => {
        const uri = fixtureUri(FIXTURE_FOLDERS.typescript, 'package.json');
        const document = await vscode.workspace.openTextDocument(uri);
        const editor = await vscode.window.showTextDocument(document);
        const valueStart = document.getText().indexOf('"Game: TS Game"');
        const range = new vscode.Range(document.positionAt(valueStart), document.positionAt(valueStart + '"Game: TS Game"'.length));
        try {
            await editor.edit(builder => builder.replace(range, '""'));
            await waitFor(() => codes(uri).includes('required-field'), 'the edit produced no required-field diagnostic');
            const diagnostic = vscode.languages.getDiagnostics(uri).find(candidate => candidate.code === 'required-field');
            assert.strictEqual(diagnostic?.source, DIAGNOSTIC_SOURCE);
            assert.strictEqual(diagnostic?.severity, vscode.DiagnosticSeverity.Error);
            assert.deepStrictEqual(diagnostic?.range, new vscode.Range(range.start, range.start.translate(0, 2)));
        } finally {
            await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
        }
        await waitFor(() => !codes(uri).includes('required-field'), 'reverting did not clear the diagnostic');
    });

    test('offers the snippets only in the src folder of a project', async () => {
        assert.ok((await completionLabels(fixtureUri(FIXTURE_FOLDERS.typescript, 'src/index.ts'))).includes('tregisterGame'));
        assert.ok(!(await completionLabels(fixtureUri(FIXTURE_FOLDERS.plain, 'index.ts'))).includes('tregisterGame'));
        assert.ok(!(await completionLabels(fixtureUri(FIXTURE_FOLDERS.legacy, 'src/index.ts'))).includes('tregisterGame'));
    });

    test('Create Missing Files restores a deleted file of the active project', async () => {
        const rollupConfig = fixtureUri(FIXTURE_FOLDERS.typescript, 'rollup.config.mjs');
        const original = fs.readFileSync(rollupConfig.fsPath, 'utf8');
        fs.rmSync(rollupConfig.fsPath);
        await waitFor(() => codes(fixtureUri(FIXTURE_FOLDERS.typescript, 'package.json')).includes('required-file'), 'the deletion produced no required-file diagnostic');

        await vscode.window.showTextDocument(fixtureUri(FIXTURE_FOLDERS.typescript, 'src/index.ts'));
        await vscode.commands.executeCommand(COMMAND_CREATE_MISSING_FILES);
        assert.strictEqual(fs.readFileSync(rollupConfig.fsPath, 'utf8'), original);
        await waitFor(() => !codes(fixtureUri(FIXTURE_FOLDERS.typescript, 'package.json')).includes('required-file'), 'the restore did not clear the diagnostic');
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    });

    test('runTask waits for the exit code', async () => {
        const folder = vscode.workspace.workspaceFolders?.find(candidate => candidate.name === FIXTURE_FOLDERS.plain);
        assert.ok(folder);
        const failing = path.join(scratch, 'exit-3.js');
        fs.writeFileSync(failing, 'process.exit(3);\n');
        assert.strictEqual(await runTask(folder, 'probe', new vscode.ShellExecution('node', ['--version'])), 0);
        // PowerShell reports any failed command as 1
        assert.ok(![0, undefined].includes(await runTask(folder, 'probe', new vscode.ShellExecution('node', [failing]))));
    });

    // Whether VS Code substitutes variables inside sourceMapPathOverrides keys decides whether the
    // source map prefix can be derived instead of written into the generated launch.json.
    test('variables are resolved inside a sourceMapPathOverrides key', async function () {
        this.timeout(60_000);
        if ((await HTTP_CDP.version(VORTEX_TEST_PORT)).status !== 'ok') {
            this.skip();
        }
        const folder = vscode.workspace.workspaceFolders?.find(candidate => candidate.name === FIXTURE_FOLDERS.typescript);
        assert.ok(folder);
        const sessions: vscode.DebugSession[] = [];
        const subscription = vscode.debug.onDidStartDebugSession(session => sessions.push(session));
        try {
            await vscode.debug.startDebugging(folder, {
                name: 'variable probe',
                type: 'chrome',
                request: 'attach',
                address: '127.0.0.1',
                port: VORTEX_TEST_PORT,
                urlFilter: '*index.html',
                webRoot: '${workspaceFolder}',
                sourceMaps: true,
                sourceMapPathOverrides: { '${workspaceFolderBasename}:///*': '${workspaceFolder}/*' },
            });
            await waitFor(() => sessions.length > 0, 'no session started', 20_000);
            const overrides = sessions[0].configuration.sourceMapPathOverrides as Record<string, string>;
            console.log(`VARIABLE IN KEY => ${JSON.stringify(overrides)}`);
        } finally {
            subscription.dispose();
            await vscode.debug.stopDebugging();
            await waitFor(() => vscode.debug.activeDebugSession === undefined, 'session left running', 15_000).catch(() => undefined);
        }
    });

    // The point of the whole feature: a breakpoint in the author's TypeScript, hit while the code
    // runs in Vortex, reported by VS Code. Needs a Vortex started with --remote-debugging-port=9222
    // that has the project of VORTEX_DEBUG_E2E_PROJECT deployed, so it is skipped by default.
    test('a breakpoint in the project is hit inside Vortex and reported by VS Code', async function () {
        this.timeout(120_000);
        const project = process.env.VORTEX_DEBUG_E2E_PROJECT;
        if (project === undefined || (await HTTP_CDP.version(VORTEX_TEST_PORT)).status !== 'ok') {
            this.skip();
        }
        const projectUri = vscode.Uri.file(project);
        const packId = JSON.parse(fs.readFileSync(path.join(project, '.pack', 'info.json'), 'utf8')).id as string;
        const entry = vscode.Uri.joinPath(projectUri, 'src/index.ts');
        const line = fs.readFileSync(entry.fsPath, 'utf8').split('\n').findIndex(text => text.includes('context.registerGame('));
        assert.ok(line > 0, 'found the registerGame call to break on');

        const folder = vscode.workspace.workspaceFolders?.[0];
        assert.ok(folder);
        const breakpoint = new vscode.SourceBreakpoint(new vscode.Location(entry, new vscode.Position(line, 0)));
        vscode.debug.addBreakpoints([breakpoint]);
        try {
            assert.ok(await vscode.debug.startDebugging(folder, vortexAttachConfiguration({ packId, folder: projectUri, port: VORTEX_TEST_PORT })), 'attached');
            await waitFor(() => vscode.debug.activeDebugSession !== undefined, 'no active session', 20_000);
            // give js-debug time to create the per-target child session and bind the breakpoint
            await new Promise(resolve => setTimeout(resolve, 5_000));

            await callExtensionMain(VORTEX_TEST_PORT, packId);
            await waitFor(() => vscode.debug.activeStackItem !== undefined, 'VS Code never reported a paused stack', 30_000);

            const stack = vscode.debug.activeStackItem;
            assert.ok(stack, 'a stack item is active');
            const frames = await stack.session.customRequest('stackTrace', { threadId: stack.threadId, levels: 1 }) as { stackFrames: { name: string; line: number; source?: { path?: string } }[] };
            const top = frames.stackFrames[0];
            console.log(`BREAKPOINT => ${top.source?.path}:${top.line} in ${top.name}`);
            assert.strictEqual(top.source?.path?.toLowerCase(), entry.fsPath.toLowerCase(), 'the paused frame is the workspace TypeScript file');
            assert.strictEqual(top.line, line + 1, 'it is the line the breakpoint was set on');
        } finally {
            // a renderer left paused would make the next attach hang, so it is resumed whatever happened
            vscode.debug.removeBreakpoints([breakpoint]);
            await vscode.debug.stopDebugging();
            await waitFor(() => vscode.debug.activeDebugSession === undefined, 'a session was left running', 15_000).catch(() => undefined);
            await resumeRenderer(VORTEX_TEST_PORT);
        }
    });

    // js-debug refuses to attach to a port nothing answers on, so this needs a real Vortex:
    // start one with --remote-debugging-port=9222 first. It is closed by the test.
    test('a real attach session is ended once Vortex goes away', async function () {
        this.timeout(120_000);
        if ((await HTTP_CDP.version(VORTEX_TEST_PORT)).status !== 'ok') {
            this.skip();
        }
        const folder = vscode.workspace.workspaceFolders?.find(candidate => candidate.name === FIXTURE_FOLDERS.typescript);
        assert.ok(folder);
        const configuration = vortexAttachConfiguration({ packId: 'tsgame-support', folder: folder.uri, port: VORTEX_TEST_PORT });

        await waitFor(() => vscode.debug.activeDebugSession === undefined, 'a previous session is still running', 15_000);
        const started: vscode.DebugSession[] = [];
        const terminated: vscode.DebugSession[] = [];
        const subscriptions = [
            vscode.debug.onDidStartDebugSession(session => started.push(session)),
            vscode.debug.onDidTerminateDebugSession(session => terminated.push(session)),
        ];
        try {
            // a urlFilter that matches nothing makes js-debug wait forever instead of failing,
            // which looks exactly like a session that will not go away
            const ok = await Promise.race([
                vscode.debug.startDebugging(folder, configuration),
                new Promise<boolean>(resolve => setTimeout(() => resolve(false), 20_000)),
            ]);
            console.log(`REAL SESSION => startDebugging returned ${ok}`);
            assert.ok(ok, `the attach configuration never attached, check its urlFilter ${JSON.stringify(configuration.urlFilter)}`);
            await waitFor(() => started.length > 0, 'no debug session was reported', 15_000);
            // what VS Code actually hands an extension, which is what the watcher has to match
            for (const session of started) {
                console.log(`REAL SESSION => type=${session.type} request=${session.configuration.request} port=${JSON.stringify(session.configuration.port)} parent=${session.parentSession === undefined ? 'none' : session.parentSession.type} overrides=${JSON.stringify(Object.keys(session.configuration.sourceMapPathOverrides ?? {}))}`);
            }

            await requestVortexClose(true);
            console.log('REAL SESSION => Vortex closed, waiting for the watcher');
            await waitFor(() => terminated.length >= started.length, `the watcher never ended the session after Vortex closed (started ${started.length}, terminated ${terminated.length})`, 60_000);
            console.log(`REAL SESSION => ended, started=${started.length} terminated=${terminated.length}`);
            assert.strictEqual(vscode.debug.activeDebugSession, undefined, 'no session is left running');
        } finally {
            subscriptions.forEach(subscription => subscription.dispose());
            await vscode.debug.stopDebugging();
        }
    });

    test('a pending install waits for the window that opens its folder, and expires', async () => {
        const diagnostics = {} as VortexDiagnostics;
        const state = new MemoryState();
        await savePendingInstall(state, vscode.Uri.file(path.join(scratch, 'not-open')));
        await resumePendingInstall(state, diagnostics);
        assert.ok(state.get(PENDING_INSTALL_KEY));

        const expired: PendingInstall = { targetUri: vscode.Uri.file(path.join(scratch, 'not-open')).toString(), createdAt: 0 };
        await state.update(PENDING_INSTALL_KEY, expired);
        await resumePendingInstall(state, diagnostics);
        assert.strictEqual(state.get(PENDING_INSTALL_KEY), undefined);
    });
});

function fixtureUri(folderName: string, relativePath: string): vscode.Uri {
    const folder = vscode.workspace.workspaceFolders?.find(candidate => candidate.name === folderName);
    assert.ok(folder, `Workspace folder ${folderName} is missing`);
    return vscode.Uri.joinPath(folder.uri, relativePath);
}

function codes(uri: vscode.Uri): string[] {
    return vscode.languages.getDiagnostics(uri).filter(diagnostic => diagnostic.source === DIAGNOSTIC_SOURCE).map(diagnostic => String(diagnostic.code));
}

async function completionLabels(uri: vscode.Uri): Promise<string[]> {
    const list = await vscode.commands.executeCommand<vscode.CompletionList>('vscode.executeCompletionItemProvider', uri, new vscode.Position(0, 0));
    return list.items.map(item => typeof item.label === 'string' ? item.label : item.label.label);
}

function listFiles(root: string, relative = ''): string[] {
    return fs.readdirSync(path.join(root, relative), { withFileTypes: true }).flatMap(entry => {
        const entryPath = relative ? `${relative}/${entry.name}` : entry.name;
        return entry.isDirectory() ? listFiles(root, entryPath) : [entryPath];
    });
}

/**
 * Calls the deployed extension's `main()` in Vortex's renderer with a stub context, which is what
 * Vortex itself does while it installs one, so a breakpoint in it is reached on demand.
 */
async function callExtensionMain(port: number, packId: string): Promise<void> {
    const socket = await openRendererSocket(port);
    const deployed = path.join(process.env.APPDATA ?? '', 'Vortex', 'plugins', packId, 'index.js');
    const expression = `(() => { const m = require.cache[${JSON.stringify(deployed)}]; if (!m) { return 'not loaded'; }
        const fn = m.exports.default ?? m.exports; const noop = () => {};
        fn({ registerGame: noop, registerInstaller: noop, registerStartHook: noop, registerAction: noop, once: noop }); return 'called'; })()`;
    // not awaited: the renderer pauses at the breakpoint, so this never answers until it continues
    socket.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression, returnByValue: true } }));
    await new Promise(resolve => setTimeout(resolve, 500));
    // the pause belongs to the debugger's own connection, so letting this one go does not resume it
    socket.close();
}

/** Attaches a throwaway debugger and resumes, in case a test left Vortex's renderer paused */
async function resumeRenderer(port: number): Promise<void> {
    const socket = await openRendererSocket(port).catch(() => undefined);
    if (socket === undefined) {
        return;
    }
    socket.send(JSON.stringify({ id: 1, method: 'Debugger.enable', params: {} }));
    await new Promise(resolve => setTimeout(resolve, 300));
    socket.send(JSON.stringify({ id: 2, method: 'Debugger.resume', params: {} }));
    await new Promise(resolve => setTimeout(resolve, 300));
    socket.send(JSON.stringify({ id: 3, method: 'Debugger.disable', params: {} }));
    await new Promise(resolve => setTimeout(resolve, 300));
    socket.close();
}

async function openRendererSocket(port: number): Promise<WebSocket> {
    const targets = await new Promise<{ type: string; url: string; webSocketDebuggerUrl?: string }[]>((resolve, reject) => {
        http.get({ host: '127.0.0.1', port, path: '/json/list' }, response => {
            let body = '';
            response.setEncoding('utf8');
            response.on('data', chunk => {
                body += chunk; 
            });
            response.on('end', () => resolve(JSON.parse(body)));
        }).on('error', reject);
    });
    const page = targets.find(target => target.type === 'page' && target.url.includes('index.html'));
    assert.ok(page?.webSocketDebuggerUrl, 'Vortex has an attachable window');
    const socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise<void>((resolve, reject) => {
        socket.addEventListener('open', () => resolve(), { once: true });
        socket.addEventListener('error', () => reject(new Error('could not open a CDP connection')), { once: true });
    });
    return socket;
}

async function waitFor(condition: () => unknown, message: string, timeoutMs = 30_000): Promise<void> {
    const start = Date.now();
    while (!condition()) {
        if (Date.now() - start > timeoutMs) {
            throw new Error(message);
        }
        await new Promise(resolve => setTimeout(resolve, 100));
    }
}
