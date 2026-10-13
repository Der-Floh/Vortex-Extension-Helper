import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import pkg from '../../../package.json';
import { COMMAND_CREATE_MISSING_FILES, COMMAND_RUN_WORKSPACE_CHECKS, DIAGNOSTIC_SOURCE, PENDING_INSTALL_KEY } from '../../constants';
import { renderProject } from '../../templates/registry';
import { resumePendingInstall, savePendingInstall, type PendingInstall } from '../../utils/pendingInstall';
import { TargetNotEmptyError, writeNewProject } from '../../utils/projectWriter';
import { runTask } from '../../utils/taskUtils';
import type { VortexDiagnostics } from '../../utils/vortexDiagnostics';
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

async function waitFor(condition: () => unknown, message: string, timeoutMs = 30_000): Promise<void> {
    const start = Date.now();
    while (!condition()) {
        if (Date.now() - start > timeoutMs) {
            throw new Error(message);
        }
        await new Promise(resolve => setTimeout(resolve, 100));
    }
}
