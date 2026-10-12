import * as assert from 'assert';
import { buildPackageJson } from '../../templates/packageJson';
import { GENERATED_FILES, filesFor, renderProject, restorableOutputs, unrestorablePaths } from '../../templates/registry';
import { commentText, jsLiteral, renderTemplate, restoreValues } from '../../templates/render';
import type { GeneratedOutput, ProjectValues } from '../../types/project';
import { JS_FIXTURE_VALUES, TS_FIXTURE_VALUES } from '../fixtures/createFixtureWorkspace';

const COMMON_PATHS = [
    'package.json',
    'rollup.config.mjs',
    '.gitignore',
    'README.md',
    '.vscode/tasks.json',
    '.vscode/settings.json',
    '.vscode/build/populate-pack.mjs',
    '.vscode/build/package-zip.mjs',
    'assets/gameart.jpg',
];
const SOURCE_MODULES = [
    'src/index',
    'src/common/constants',
    'src/common/files',
    'src/common/notifications',
    'src/detection/discovery',
    'src/setup/prepareForModding',
    'src/installers/instructions',
    'src/installers/mods',
    'src/archive/inspection',
];

function textOf(outputs: readonly GeneratedOutput[], path: string): string {
    const output = outputs.find(candidate => candidate.path === path);
    assert.ok(output, `${path} is generated`);
    assert.strictEqual(typeof output.content, 'string', `${path} is text`);
    return output.content as string;
}

suite('Templates', () => {
    test('renderTemplate replaces known keys and rejects unknown ones', () => {
        assert.strictEqual(renderTemplate('a {{x}} b {{x}}', { x: '1' }), 'a 1 b 1');
        assert.throws(() => renderTemplate('{{missing}}', {}), /Unknown template placeholder \{\{missing\}\}/);
    });

    test('renderTemplate leaves GitHub expressions and template literals alone', () => {
        const text = 'name: ${{ vars.X }} and ${{x}} and `${pkg.name}`';
        assert.strictEqual(renderTemplate(text, { x: 'value' }), text);
    });

    test('values are inserted literally', () => {
        assert.strictEqual(renderTemplate('{{x}}', { x: '$& $1 $$' }), '$& $1 $$');
    });

    test('jsLiteral and commentText escape what would break the code', () => {
        assert.strictEqual(jsLiteral('Baldur\'s \\ Gate'), '\'Baldur\\\'s \\\\ Gate\'');
        assert.ok(!commentText('a */ b').includes('*/'));
    });

    for (const values of [TS_FIXTURE_VALUES, JS_FIXTURE_VALUES]) {
        const extension = values.language === 'typescript' ? '.ts' : '.js';
        const config = values.language === 'typescript' ? 'tsconfig.json' : 'jsconfig.json';
        const outputs = renderProject(values);

        test(`${values.language}: generates the 19 files of the standard`, () => {
            const expected = [...COMMON_PATHS, config, ...SOURCE_MODULES.map(module => `${module}${extension}`)];
            assert.deepStrictEqual([...outputs.map(output => output.path)].sort(), expected.sort());
        });

        test(`${values.language}: leaves no placeholder and no reference to coalllc-support`, () => {
            for (const output of outputs) {
                if (typeof output.content !== 'string') {
                    continue;
                }
                assert.ok(!output.content.includes('{{'), `${output.path} has a leftover placeholder`);
                assert.ok(!/Coal|coalllc|Godot|GML|typedoc/i.test(output.content), `${output.path} mentions coalllc-support`);
            }
        });

        test(`${values.language}: package.json has the coalllc-support key order and 4 spaces`, () => {
            const text = textOf(outputs, 'package.json');
            const manifest = JSON.parse(text);
            assert.deepStrictEqual(Object.keys(manifest), ['name', 'displayName', 'version', 'description', 'author', 'gameart', 'private', 'devDependencies', 'scripts']);
            assert.ok(text.startsWith('{\n    "name"'));
            assert.ok(text.endsWith('}\n'));
            assert.strictEqual(manifest.name, `${values.shortName}-support`);
            assert.strictEqual(manifest.displayName, `Game: ${values.gameName}`);
            assert.strictEqual(manifest.version, '1.0.0');
            assert.strictEqual(manifest.gameart, 'assets/gameart.jpg');
            assert.strictEqual(manifest.devDependencies['@types/bluebird'], '3.5.20');
            assert.deepStrictEqual(Object.keys(manifest.devDependencies), [...Object.keys(manifest.devDependencies)].sort());
            assert.ok(!('docs' in manifest.scripts));
        });

        test(`${values.language}: .vscode json files are indented with tabs`, () => {
            for (const path of ['.vscode/tasks.json', '.vscode/settings.json']) {
                assert.ok(textOf(outputs, path).split('\n').slice(1, -2).every(line => line === '' || line.startsWith('\t')), path);
            }
        });

        test(`${values.language}: the game art is a JPEG`, () => {
            const gameart = outputs.find(output => output.path === 'assets/gameart.jpg')?.content;
            assert.ok(gameart instanceof Uint8Array);
            assert.deepStrictEqual([...gameart.subarray(0, 3)], [0xFF, 0xD8, 0xFF]);
        });

        test(`${values.language}: verbatim files are written byte for byte`, () => {
            for (const file of filesFor(values.language).filter(candidate => !candidate.templated)) {
                assert.deepStrictEqual(outputs.find(output => output.path === file.path)?.content, file.source, file.path);
            }
        });

        test(`${values.language}: constants hold the answers`, () => {
            const constants = textOf(outputs, `src/common/constants${extension}`);
            assert.ok(constants.includes(`id: '${values.gameId}'`));
            assert.ok(constants.includes(`steamAppId: '${values.steamAppId}'`));
            assert.ok(constants.includes(`'${values.shortName}-mods'`));
        });

        test(`${values.language}: every restorable file renders from package.json values alone`, () => {
            const restored = restorableOutputs(values.language, restoreValues(`${values.shortName}-support`, values.gameName));
            assert.ok(restored.some(output => output.path === `src/index${extension}`));
            assert.ok(restored.some(output => output.path === 'assets/gameart.jpg'));
            assert.deepStrictEqual(unrestorablePaths(values.language), ['package.json', 'README.md', `src/common/constants${extension}`]);
        });
    }

    test('skipped questions write the placeholders', () => {
        const values: ProjectValues = { ...TS_FIXTURE_VALUES, steamAppId: '', executable: undefined };
        const constants = textOf(renderProject(values), 'src/common/constants.ts');
        assert.ok(constants.includes('steamAppId: \'STEAM_APP_ID\''));
        assert.ok(constants.includes('exe: \'GAME_EXECUTABLE.exe\''));
    });

    test('names with quotes stay valid code', () => {
        const constants = textOf(renderProject({ ...TS_FIXTURE_VALUES, gameName: 'Baldur\'s Gate 3' }), 'src/common/constants.ts');
        assert.ok(constants.includes('name: \'Baldur\\\'s Gate 3\''));
    });

    test('the JavaScript variant has no TypeScript tooling and no @type on async functions', () => {
        const outputs = renderProject(JS_FIXTURE_VALUES);
        const manifest = JSON.parse(textOf(outputs, 'package.json'));
        for (const name of ['typescript', 'tslib', '@rollup/plugin-typescript']) {
            assert.ok(!(name in manifest.devDependencies), name);
        }
        assert.ok(!('typecheck' in manifest.scripts));
        assert.ok(!textOf(outputs, 'rollup.config.mjs').includes('typescript'));
        const jsconfig = JSON.parse(textOf(outputs, 'jsconfig.json'));
        assert.strictEqual(jsconfig.compilerOptions.strict, false);
        assert.strictEqual(jsconfig.compilerOptions.maxNodeModuleJsDepth, 0);
        for (const output of outputs.filter(candidate => candidate.path.endsWith('.js'))) {
            assert.ok(!/@type \{types\.(TestSupported|InstallFunc)\}/.test(output.content as string), output.path);
        }
    });

    test('both rollup configs read the externals and the source map prefix from package.json', () => {
        const ts = textOf(renderProject(TS_FIXTURE_VALUES), 'rollup.config.mjs');
        const js = textOf(renderProject(JS_FIXTURE_VALUES), 'rollup.config.mjs');
        for (const config of [ts, js]) {
            assert.ok(config.includes('...(pkg.vortex?.externals ?? [])'));
            assert.ok(config.includes('const SOURCE_URL_PREFIX = `${pkg.name}:///`;'));
        }
        assert.strictEqual(ts.replace(/^import typescript.*\n/, '').split('export default')[0], js.split('export default')[0]);
    });

    test('the .gitignore ignores .pack but none of the reference project\'s personal folders', () => {
        const gitignore = textOf(renderProject(TS_FIXTURE_VALUES), '.gitignore');
        assert.ok(gitignore.trimEnd().endsWith('# Custom\n.pack'));
        assert.ok(!/^(docs\/|Vortex\/|CLAUDE\.md)$/m.test(gitignore));
    });

    test('the registry is frozen and renders are independent', () => {
        assert.ok(Object.isFrozen(GENERATED_FILES));
        assert.ok(GENERATED_FILES.every(file => Object.isFrozen(file)));
        const first = textOf(renderProject(TS_FIXTURE_VALUES), 'src/common/constants.ts');
        renderProject({ ...TS_FIXTURE_VALUES, gameId: 'other' });
        assert.strictEqual(textOf(renderProject(TS_FIXTURE_VALUES), 'src/common/constants.ts'), first);
    });

    test('buildPackageJson ends with a newline', () => {
        assert.ok(buildPackageJson(TS_FIXTURE_VALUES).endsWith('}\n'));
    });
});
