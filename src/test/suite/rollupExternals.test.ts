import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { pathToFileURL } from 'url';
import { renderProject } from '../../templates/registry';
import { JS_FIXTURE_VALUES } from '../fixtures/createFixtureWorkspace';

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
        const config = renderProject(JS_FIXTURE_VALUES).find(output => output.path === 'rollup.config.mjs');
        assert.ok(config);
        fs.writeFileSync(path.join(folder, 'rollup.config.mjs'), config.content);
        fs.writeFileSync(path.join(folder, 'package.json'), JSON.stringify({ name: 'jsgame-support', vortex: { externals: ['winapi-bindings'] } }));
    });

    suiteTeardown(() => {
        fs.rmSync(folder, { recursive: true, force: true });
    });

    test('the generated config treats vortex.externals, Vortex modules and Node built-ins as external', async () => {
        const { default: config } = await importModule(pathToFileURL(path.join(folder, 'rollup.config.mjs')).href);
        for (const name of ['winapi-bindings', 'vortex-api', 'bluebird', 'fs', 'node:fs']) {
            assert.ok(config.external.includes(name), name);
        }
        assert.strictEqual(config.output.sourcemapPathTransform('..\\..\\src\\index.js'), 'jsgame-support:///src/index.js');
    });
});
