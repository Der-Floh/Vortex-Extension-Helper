import * as assert from 'assert';
import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import * as vscode from 'vscode';
import { readProjectSnapshot } from '../../checks/projectSnapshot';
import { validateProject } from '../../checks/validation';
import { PACKAGE_LOCK_PATH } from '../../constants';
import { DISCOVERED_CATALOGUE } from '../../templates/addons/discoveredCatalogue';
import { renderProject } from '../../templates/registry';
import type { ProjectValues } from '../../types/project';
import { addonOutcomes } from '../fixtures/addonOutcomes';
import { TS_FIXTURE_VALUES, writeOutputs } from '../fixtures/createFixtureWorkspace';

const runShell = promisify(exec);
const BUILD_TIMEOUT_MS = 10 * 60_000;
const NODE_MODULES = 'node_modules';

// Installs from npm and GitHub, so it only runs when asked for: VORTEX_HELPER_BUILD_TEST=1 npm test
(process.env.VORTEX_HELPER_BUILD_TEST === '1' ? suite : suite.skip)('Generated projects build', () => {
    const scratch = process.env.VORTEX_HELPER_SCRATCH ?? '';
    let installedFolder: string | undefined;

    /** Every outcome has the same dependencies, so only the first one installs them */
    async function installDependencies(folder: string): Promise<void> {
        if (installedFolder) {
            fs.symlinkSync(path.join(installedFolder, NODE_MODULES), path.join(folder, NODE_MODULES), 'junction');
            fs.copyFileSync(path.join(installedFolder, PACKAGE_LOCK_PATH), path.join(folder, PACKAGE_LOCK_PATH));
            return;
        }
        await npm(folder, 'run', 'install-deps');
        installedFolder = folder;
    }

    addonOutcomes(DISCOVERED_CATALOGUE).forEach(({ label, choices }, index) => {
        test(`${label}: installs, type checks, builds and packages`, async function () {
            this.timeout(BUILD_TIMEOUT_MS);
            const folder = path.join(scratch, `build-${index}`);
            const values: ProjectValues = { ...TS_FIXTURE_VALUES, addons: choices.addons, addonOptions: choices.options };
            writeOutputs(folder, renderProject(values));

            await installDependencies(folder);
            await npm(folder, 'run', 'package');

            assertPack(folder, values);
            assertDebuggable(folder);
            await assertDeploys(folder, values);
            assert.ok(fs.readFileSync(path.join(folder, PACKAGE_LOCK_PATH), 'utf8').includes('node_modules/@rollup/rollup-linux-x64-gnu'));
            const workspaceFolder: vscode.WorkspaceFolder = { uri: vscode.Uri.file(folder), name: path.basename(folder), index: 0 };
            const errors = validateProject(await readProjectSnapshot({ folder: workspaceFolder }))
                .filter(finding => finding.severity === 'error');
            assert.deepStrictEqual(errors, []);
        });
    });

    test('the Godot Mod Loader release the template pins exists', async () => {
        const constants = renderProject({ ...TS_FIXTURE_VALUES, addons: ['gml'] }).find(output => output.path === 'src/gml/constants.ts')?.content as string;
        const url = /apiUrl: '([^']+)'/.exec(constants)?.[1];
        const assetName = /assetName: '([^']+)'/.exec(constants)?.[1];
        assert.ok(url && assetName);
        const release = await (await fetch(url, { headers: { 'User-Agent': 'vortex-extension-helper-tests' } })).json() as { assets: { name: string }[] };
        assert.ok(release.assets.some(asset => asset.name === assetName), `${assetName} is not in ${url}`);
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
