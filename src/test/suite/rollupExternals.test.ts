import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { pathToFileURL } from 'url';
import { renderProject } from '../../templates/registry';
import { TS_FIXTURE_VALUES } from '../fixtures/createFixtureWorkspace';

interface RollupConfig {
    external: string[];
    output: { sourcemapPathTransform: (relativeSourcePath: string) => string };
}

// esbuild would turn a literal import() into require(), which can't load an .mjs config
const importModule = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<{ default: RollupConfig }>;

suite('Rollup externals', () => {
    let folder: string;

    suiteSetup(() => {
        folder = fs.mkdtempSync(path.join(os.tmpdir(), 'vortex-helper-rollup-'));
        const config = renderProject(TS_FIXTURE_VALUES).find(output => output.path === 'rollup.config.mjs');
        assert.ok(config);
        fs.writeFileSync(path.join(folder, 'rollup.config.mjs'), config.content);
        fs.writeFileSync(path.join(folder, 'package.json'), JSON.stringify({ name: 'tsgame-support', vortex: { externals: ['winapi-bindings'] } }));
        stubPluginTypescript(folder);
    });

    suiteTeardown(() => {
        fs.rmSync(folder, { recursive: true, force: true });
    });

    test('the generated config treats vortex.externals, Vortex modules and Node built-ins as external', async () => {
        const { default: config } = await importModule(pathToFileURL(path.join(folder, 'rollup.config.mjs')).href);
        for (const name of ['winapi-bindings', 'vortex-api', 'bluebird', 'fs', 'node:fs']) {
            assert.ok(config.external.includes(name), name);
        }
        assert.strictEqual(config.output.sourcemapPathTransform('..\\..\\src\\index.ts'), 'tsgame-support:///src/index.ts');
    });
});

/** The config is evaluated outside the project, so its only dependency has to resolve from the temporary folder */
function stubPluginTypescript(folder: string): void {
    const plugin = path.join(folder, 'node_modules/@rollup/plugin-typescript');
    fs.mkdirSync(plugin, { recursive: true });
    fs.writeFileSync(path.join(plugin, 'package.json'), JSON.stringify({ name: '@rollup/plugin-typescript', version: '0.0.0', type: 'module', exports: './index.js' }));
    fs.writeFileSync(path.join(plugin, 'index.js'), 'export default () => ({ name: \'typescript-stub\' });\n');
}
