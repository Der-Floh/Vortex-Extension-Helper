import * as assert from 'assert';
import { exec, execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import * as vscode from 'vscode';
import { renderProject } from '../../templates/registry';
import type { ProjectValues } from '../../types/project';
import { readProjectSnapshot } from '../../utils/projectSnapshot';
import { validateProject } from '../../utils/validation';
import { JS_FIXTURE_VALUES, TS_FIXTURE_VALUES, writeOutputs } from '../fixtures/createFixtureWorkspace';

const run = promisify(execFile);
const runShell = promisify(exec);
const BUILD_TIMEOUT_MS = 10 * 60_000;
const HELPER_TSC = path.resolve(__dirname, '../../../node_modules/typescript/bin/tsc');

// Installs from npm and GitHub, so it only runs when asked for: VORTEX_HELPER_BUILD_TEST=1 npm test
(process.env.VORTEX_HELPER_BUILD_TEST === '1' ? suite : suite.skip)('Generated projects build', () => {
    const scratch = process.env.VORTEX_HELPER_SCRATCH ?? '';

    for (const values of [TS_FIXTURE_VALUES, JS_FIXTURE_VALUES]) {
        test(`${values.language}: installs, type checks, builds and packages`, async function () {
            this.timeout(BUILD_TIMEOUT_MS);
            const folder = path.join(scratch, `build-${values.language}`);
            writeOutputs(folder, renderProject(values));

            await npm(folder, 'run', 'install-deps');
            await npm(folder, 'run', 'package');
            if (values.language === 'javascript') {
                await run(process.execPath, [HELPER_TSC, '-p', 'jsconfig.json'], { cwd: folder });
            }

            assertPack(folder, values);
            assert.ok(fs.readFileSync(path.join(folder, 'package-lock.json'), 'utf8').includes('node_modules/@rollup/rollup-linux-x64-gnu'));
            const workspaceFolder: vscode.WorkspaceFolder = { uri: vscode.Uri.file(folder), name: path.basename(folder), index: 0 };
            const errors = validateProject(await readProjectSnapshot({ folder: workspaceFolder, language: values.language }))
                .filter(finding => finding.severity === 'error');
            assert.deepStrictEqual(errors, []);
        });
    }
});

async function npm(cwd: string, ...args: string[]): Promise<void> {
    await runShell(['npm', ...args].join(' '), { cwd, maxBuffer: 64 * 1024 * 1024 });
}

function assertPack(folder: string, values: ProjectValues): void {
    const packageName = `${values.shortName}-support`;
    const info = JSON.parse(fs.readFileSync(path.join(folder, '.pack/info.json'), 'utf8'));
    assert.strictEqual(info.id, packageName);
    assert.strictEqual(info.name, `Game: ${values.gameName}`);
    assert.ok(fs.existsSync(path.join(folder, '.pack/index.js')));
    assert.ok(fs.existsSync(path.join(folder, '.pack/gameart.jpg')));
    assert.ok(fs.existsSync(path.join(folder, 'dist', `${packageName}-1.0.0.zip`)));
}
