import * as assert from 'assert';
import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import * as vscode from 'vscode';
import { readProjectSnapshot } from '../../checks/projectSnapshot';
import { validateProject } from '../../checks/validation';
import { renderProject } from '../../templates/registry';
import type { ProjectValues } from '../../types/project';
import { TS_FIXTURE_VALUES, writeOutputs } from '../fixtures/createFixtureWorkspace';

const runShell = promisify(exec);
const BUILD_TIMEOUT_MS = 10 * 60_000;

// Installs from npm and GitHub, so it only runs when asked for: VORTEX_HELPER_BUILD_TEST=1 npm test
(process.env.VORTEX_HELPER_BUILD_TEST === '1' ? suite : suite.skip)('Generated projects build', () => {
    const scratch = process.env.VORTEX_HELPER_SCRATCH ?? '';

    test('installs, type checks, builds and packages', async function () {
        this.timeout(BUILD_TIMEOUT_MS);
        const folder = path.join(scratch, 'build-typescript');
        writeOutputs(folder, renderProject(TS_FIXTURE_VALUES));

        await npm(folder, 'run', 'install-deps');
        await npm(folder, 'run', 'package');

        assertPack(folder, TS_FIXTURE_VALUES);
        assertDebuggable(folder);
        await assertDeploys(folder, TS_FIXTURE_VALUES);
        assert.ok(fs.readFileSync(path.join(folder, 'package-lock.json'), 'utf8').includes('node_modules/@rollup/rollup-linux-x64-gnu'));
        const workspaceFolder: vscode.WorkspaceFolder = { uri: vscode.Uri.file(folder), name: path.basename(folder), index: 0 };
        const errors = validateProject(await readProjectSnapshot({ folder: workspaceFolder }))
            .filter(finding => finding.severity === 'error');
        assert.deepStrictEqual(errors, []);
    });
});

async function npm(cwd: string, ...args: string[]): Promise<void> {
    await runShell(['npm', ...args].join(' '), { cwd, maxBuffer: 64 * 1024 * 1024 });
}

/** The inline source map the debugger reads out of the built bundle */
function packSourceMap(folder: string): { sources: string[]; sourcesContent: (string | null)[] } {
    const bundle = fs.readFileSync(path.join(folder, '.pack', 'index.js'), 'utf8');
    const payload = bundle.split('sourceMappingURL=data:application/json;charset=utf-8;base64,')[1];
    assert.ok(payload, 'the bundle carries an inline source map');
    return JSON.parse(Buffer.from(payload.trim(), 'base64').toString('utf8'));
}

/** The debugger maps breakpoints back through `<project folder>:///`, which rollup has to write */
function assertDebuggable(folder: string): void {
    const scheme = path.basename(folder);
    const map = packSourceMap(folder);
    assert.ok(map.sources.includes(`${scheme}:///src/index.ts`), `sources are prefixed ${scheme}:/// (got ${map.sources[0]})`);
    assert.deepStrictEqual(map.sources.filter(source => !source.startsWith(`${scheme}:///`)), []);
    assert.deepStrictEqual(map.sourcesContent.filter(content => content === null), []);
}

async function assertDeploys(folder: string, values: ProjectValues): Promise<void> {
    const plugins = path.join(folder, '..', 'build-plugins');
    await runShell('npm run deploy', { cwd: folder, env: { ...process.env, VORTEX_PLUGINS: plugins }, maxBuffer: 64 * 1024 * 1024 });
    const deployed = path.join(plugins, `${values.shortName}-support`);
    for (const name of ['index.js', 'info.json', 'gameart.jpg']) {
        assert.ok(fs.existsSync(path.join(deployed, name)), `${name} was deployed`);
    }
}

function assertPack(folder: string, values: ProjectValues): void {
    const packageName = `${values.shortName}-support`;
    const info = JSON.parse(fs.readFileSync(path.join(folder, '.pack/info.json'), 'utf8'));
    assert.strictEqual(info.id, packageName);
    assert.strictEqual(info.name, `Game: ${values.gameName}`);
    assert.strictEqual(info.gameId, values.nexusGameId);
    assert.ok(fs.existsSync(path.join(folder, '.pack/index.js')));
    assert.ok(fs.existsSync(path.join(folder, '.pack/gameart.jpg')));
    assert.ok(fs.existsSync(path.join(folder, 'dist', `${packageName}-1.0.0.zip`)));
}
