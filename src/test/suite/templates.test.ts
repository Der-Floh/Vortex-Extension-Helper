import * as assert from 'assert';
import { buildPackageJson } from '../../templates/packageJson';
import { GENERATED_FILES, renderProject, restorableOutputs, unrestorablePaths } from '../../templates/registry';
import { commentText, jsStringBody, renderTemplate, restoreValues } from '../../templates/render';
import type { GeneratedOutput, ProjectValues } from '../../types/project';
import { TS_FIXTURE_VALUES } from '../fixtures/createFixtureWorkspace';

const ROOT_PATHS = [
    'package.json',
    'rollup.config.mjs',
    'tsconfig.json',
    '.gitignore',
    'README.md',
    '.vscode/tasks.json',
    '.vscode/settings.json',
    '.vscode/build/populate-pack.mjs',
    '.vscode/build/package-zip.mjs',
    'assets/gameart.jpg',
];
const SOURCE_MODULES = [
    'src/index.ts',
    'src/common/constants.ts',
    'src/common/files.ts',
    'src/common/notifications.ts',
    'src/detection/discovery.ts',
    'src/setup/prepareForModding.ts',
    'src/installers/instructions.ts',
    'src/installers/mods.ts',
    'src/archive/inspection.ts',
];

function textOf(outputs: readonly GeneratedOutput[], path: string): string {
    const output = outputs.find(candidate => candidate.path === path);
    assert.ok(output, `${path} is generated`);
    assert.strictEqual(typeof output.content, 'string', `${path} is text`);
    return output.content as string;
}

suite('Templates', () => {
    const outputs = renderProject(TS_FIXTURE_VALUES);

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

    test('jsStringBody and commentText escape what would break the code', () => {
        assert.strictEqual(jsStringBody('Baldur\'s \\ Gate'), 'Baldur\\\'s \\\\ Gate');
        assert.ok(!commentText('a */ b').includes('*/'));
    });

    test('generates the 19 files of the standard', () => {
        assert.deepStrictEqual([...outputs.map(output => output.path)].sort(), [...ROOT_PATHS, ...SOURCE_MODULES].sort());
    });

    test('leaves no placeholder and no reference to coalllc-support', () => {
        for (const output of outputs) {
            if (typeof output.content !== 'string') {
                continue;
            }
            assert.ok(!output.content.includes('{{'), `${output.path} has a leftover placeholder`);
            assert.ok(!/Coal|coalllc|Godot|GML|typedoc/i.test(output.content), `${output.path} mentions coalllc-support`);
        }
    });

    test('package.json has the coalllc-support key order and 4 spaces', () => {
        const text = textOf(outputs, 'package.json');
        const manifest = JSON.parse(text);
        assert.deepStrictEqual(Object.keys(manifest), ['name', 'displayName', 'version', 'description', 'author', 'gameart', 'private', 'devDependencies', 'scripts']);
        assert.ok(text.startsWith('{\n    "name"'));
        assert.ok(text.endsWith('}\n'));
        assert.strictEqual(manifest.name, `${TS_FIXTURE_VALUES.shortName}-support`);
        assert.strictEqual(manifest.displayName, `Game: ${TS_FIXTURE_VALUES.gameName}`);
        assert.strictEqual(manifest.version, '1.0.0');
        assert.strictEqual(manifest.gameart, 'assets/gameart.jpg');
        assert.strictEqual(manifest.devDependencies['@types/bluebird'], '3.5.20');
        assert.deepStrictEqual(Object.keys(manifest.devDependencies), [...Object.keys(manifest.devDependencies)].sort());
        assert.ok(!('docs' in manifest.scripts));
    });

    test('.vscode json files are indented with tabs', () => {
        for (const path of ['.vscode/tasks.json', '.vscode/settings.json']) {
            assert.ok(textOf(outputs, path).split('\n').slice(1, -2).every(line => line === '' || line.startsWith('\t')), path);
        }
    });

    test('the game art is a JPEG', () => {
        const gameart = outputs.find(output => output.path === 'assets/gameart.jpg')?.content;
        assert.ok(gameart instanceof Uint8Array);
        assert.deepStrictEqual([...gameart.subarray(0, 3)], [0xFF, 0xD8, 0xFF]);
    });

    test('verbatim files are written byte for byte', () => {
        for (const file of GENERATED_FILES.filter(candidate => !candidate.templated)) {
            assert.deepStrictEqual(outputs.find(output => output.path === file.path)?.content, file.source, file.path);
        }
    });

    test('constants hold the answers', () => {
        const constants = textOf(outputs, 'src/common/constants.ts');
        assert.ok(constants.includes(`id: '${TS_FIXTURE_VALUES.gameId}'`));
        assert.ok(constants.includes(`steamAppId: '${TS_FIXTURE_VALUES.steamAppId}'`));
        assert.ok(constants.includes(`'${TS_FIXTURE_VALUES.shortName}-mods'`));
    });

    test('every restorable file renders from package.json values alone', () => {
        const restored = restorableOutputs(restoreValues(`${TS_FIXTURE_VALUES.shortName}-support`, TS_FIXTURE_VALUES.gameName));
        assert.ok(restored.some(output => output.path === 'src/index.ts'));
        assert.ok(restored.some(output => output.path === 'assets/gameart.jpg'));
        assert.deepStrictEqual(unrestorablePaths(), ['package.json', 'README.md', 'src/common/constants.ts']);
    });

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

    test('the rollup config reads the externals and the source map prefix from package.json', () => {
        const config = textOf(outputs, 'rollup.config.mjs');
        assert.ok(config.includes('...(pkg.vortex?.externals ?? [])'));
        assert.ok(config.includes('const SOURCE_URL_PREFIX = `${pkg.name}:///`;'));
    });

    test('the .gitignore ignores .pack but none of the reference project\'s personal folders', () => {
        const gitignore = textOf(outputs, '.gitignore');
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
