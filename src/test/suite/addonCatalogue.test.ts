import * as assert from 'assert';
import * as path from 'path';
import { pathToFileURL } from 'url';
import { PACKAGE_JSON_PATH, VORTEX_LIBRARIES } from '../../constants';
import { BASELINE_GAME_FIELDS, HOOK_MODULES, type Catalogue } from '../../templates/addons/addon';
import { DISCOVERED_CATALOGUE } from '../../templates/addons/discoveredCatalogue';
import { MANIFEST_FIELDS, validateCatalogue, type RawAddon } from '../../templates/addons/validateCatalogue';
import schema from '../../templates/catalogue/addon.schema.json';
import lock from '../../templates/catalogue/addons.lock.json';
import { GENERATED_FILES } from '../../templates/registry';
import { TEST_CATALOGUE } from '../fixtures/testAddon';

const REPO_ROOT = path.resolve(__dirname, '../../..');
const ENGINES = [{ id: 'unity', label: 'Unity', examples: 'A game' }, { id: 'godot', label: 'Godot', examples: 'Another game' }];
const CATEGORIES = [{ id: 'tools', label: 'Tools', description: 'Things' }];
const REGISTER = { path: 'register.ts', text: 'export function registerTool(context) {}\n' };
const WORKFLOW = { path: 'release.yml', text: 'name: Release\n' };

/** The baseline's folders below src, which no add-on may take */
const RESERVED_FOLDERS = [...new Set(GENERATED_FILES.map(file => file.path.split('/')).filter(parts => parts[0] === 'src' && parts.length > 2).map(parts => parts[1]))];
const BASELINE_FILES = [PACKAGE_JSON_PATH, ...GENERATED_FILES.map(file => file.path)];

function addon(manifest: Record<string, unknown>, files: RawAddon['files'] = []): RawAddon {
    return { folder: String(manifest.id), manifest: { version: '1.0.0', name: String(manifest.id), description: 'A test add-on', category: 'tools', ...manifest }, files };
}

function gameAddon(id: string, extra: Record<string, unknown> = {}): RawAddon {
    return addon({ id, hooks: { game: { export: `${id}Game`, fields: ['requiresCleanup'] } }, ...extra }, [{ path: 'game.ts', text: `export function ${id}Game(context) { return {}; }\n` }]);
}

function problemsOf(...addons: RawAddon[]): string[] {
    return validateCatalogue({ engines: ENGINES, categories: CATEGORIES, addons, reservedFolders: RESERVED_FOLDERS, baselineFiles: BASELINE_FILES })
        .map(problem => problem.message);
}

function problemsOfCatalogue(catalogue: Catalogue): unknown[] {
    const addons = catalogue.addons.map(found => ({ folder: found.manifest.id, manifest: found.manifest, files: found.files }));
    return validateCatalogue({ engines: catalogue.engines, categories: catalogue.categories, addons, reservedFolders: RESERVED_FOLDERS, baselineFiles: BASELINE_FILES });
}

function assertProblem(addons: readonly RawAddon[], pattern: RegExp): void {
    const problems = problemsOf(...addons);
    assert.ok(problems.some(problem => pattern.test(problem)), `expected ${pattern}, got ${JSON.stringify(problems)}`);
}

suite('Add-on catalogue', () => {
    test('the add-on folders are valid, and so is the test add-on', () => {
        assert.deepStrictEqual(problemsOfCatalogue(DISCOVERED_CATALOGUE), []);
        assert.deepStrictEqual(problemsOfCatalogue(TEST_CATALOGUE), []);
        assert.deepStrictEqual([...RESERVED_FOLDERS].sort(), ['archive', 'common', 'detection', 'installers', 'setup']);
    });

    test('the build sees the same baseline as the registry', async () => {
        const plugin: { discoverAddons(): { reservedFolders: string[]; baselineFiles: string[] } } = await import(pathToFileURL(path.join(REPO_ROOT, 'esbuild.addons.mjs')).href);
        const { reservedFolders, baselineFiles } = plugin.discoverAddons();
        assert.deepStrictEqual([...reservedFolders].sort(), [...RESERVED_FOLDERS].sort());
        assert.deepStrictEqual([...baselineFiles].sort(), [...BASELINE_FILES].sort());
    });

    test('the lock has every add-on at its version and content', () => {
        const locked = lock as Record<string, { version: string; hash: string }>;
        for (const { manifest, hash } of DISCOVERED_CATALOGUE.addons) {
            const entry = locked[manifest.id];
            assert.ok(entry, `${manifest.id} isn't locked yet: run npm run lock-addons`);
            if (entry.version === manifest.version) {
                assert.strictEqual(hash, entry.hash, `${manifest.id} changed: give it a new "version" in its addon.json, then run npm run lock-addons`);
            } else {
                assert.fail(`${manifest.id} is ${manifest.version} but locked as ${entry.version}: run npm run lock-addons`);
            }
        }
        const ids = DISCOVERED_CATALOGUE.addons.map(found => found.manifest.id);
        assert.deepStrictEqual(Object.keys(locked).filter(id => !ids.includes(id)), [], 'the lock lists add-ons that are gone: run npm run lock-addons');
    });

    test('the schema for addon.json knows every field, hook, engine, category, library and reserved name', () => {
        const { properties } = schema;
        assert.deepStrictEqual(Object.keys(properties).sort(), [...MANIFEST_FIELDS].sort());
        assert.deepStrictEqual(Object.keys(properties.hooks.properties), Object.keys(HOOK_MODULES));
        assert.deepStrictEqual(properties.engines.items.enum, DISCOVERED_CATALOGUE.engines.map(engine => engine.id));
        assert.deepStrictEqual(properties.category.enum, DISCOVERED_CATALOGUE.categories.map(category => category.id));
        assert.deepStrictEqual(properties.vortexLibraries.items.enum, VORTEX_LIBRARIES.map(library => library.name));
        assert.deepStrictEqual(properties.hooks.properties.game.properties.fields.items.not.enum, BASELINE_GAME_FIELDS);
        assert.deepStrictEqual([...properties.id.not.enum].sort(), [...RESERVED_FOLDERS].sort());
    });

    test('a minimal add-on is valid', () => {
        assert.deepStrictEqual(problemsOf(addon({ id: 'tool' })), []);
        assert.deepStrictEqual(problemsOf(addon({ id: 'tool', hooks: { register: 'registerTool' } }, [REGISTER])), []);
    });

    test('the manifest\'s own fields are checked', () => {
        assertProblem([{ folder: 'tool', manifest: [], files: [] }], /must hold an object/);
        assertProblem([addon({ id: 'tool', colour: 'red' })], /unknown field "colour"/);
        assertProblem([{ ...addon({ id: 'tool' }), folder: 'other' }], /must be the folder's name, other/);
        assertProblem([addon({ id: 'Tool' })], /lower-case letter/);
        assertProblem([addon({ id: 'common' })], /folder of the baseline project/);
        assertProblem([addon({ id: 'tool', version: '1.0' })], /"version" must be a version/);
        assertProblem([addon({ id: 'tool', name: ' ' })], /"name" must be text/);
        assertProblem([addon({ id: 'tool', description: 'Two\nlines' })], /"description" must be text on one line/);
        assertProblem([addon({ id: 'tool', category: 'games' })], /"category" must be one of tools/);
        assertProblem([addon({ id: 'tool', engines: ['unreal'] })], /"engines" must list some of unity, godot/);
        assertProblem([addon({ id: 'tool', hidden: 'yes' })], /"hidden" must be true or false/);
        assertProblem([addon({ id: 'tool', modsPath: { base: 'game', path: '../outside' } })], /"modsPath" must be/);
        assertProblem([addon({ id: 'tool', readme: { features: 'one' } })], /"readme" may hold/);
    });

    test('the catalogue files are checked', () => {
        const problems = validateCatalogue({ engines: {}, categories: [{ id: 'tools' }], addons: [], reservedFolders: [], baselineFiles: [] }).map(problem => problem.message);
        assert.ok(problems.some(problem => /engines\.json must hold a list/.test(problem)));
        assert.ok(problems.some(problem => /categories\.json needs id, label, description/.test(problem)));
    });

    test('references, cycles and reachability are checked', () => {
        assertProblem([addon({ id: 'tool', dependsOn: ['missing'] })], /names missing, which isn't an add-on/);
        assertProblem([addon({ id: 'tool', dependsOn: ['tool'] })], /can't name the add-on itself/);
        assertProblem([addon({ id: 'first', dependsOn: ['second'] }), addon({ id: 'second', dependsOn: ['first'] })], /leads back to itself/);
        assertProblem([addon({ id: 'helper', hidden: true })], /Nothing depends on this hidden add-on/);
        assertProblem([addon({ id: 'first' }), addon({ id: 'glue', when: ['first'] })], /with "when" .* must be hidden/);
    });

    test('hooks must name a function their module exports, and nothing else may import a hook module', () => {
        assertProblem([addon({ id: 'tool', hooks: { register: 'registerTool' } })], /needs register\.ts/);
        assertProblem([addon({ id: 'tool', hooks: { register: 'registerOther' } }, [REGISTER])], /register\.ts doesn't export registerOther/);
        assertProblem([addon({ id: 'tool', hooks: { install: 'install' } })], /unknown hook "install"/);
        const importer = { path: 'helper.ts', text: 'import { registerTool } from \'./register\';\n' };
        assertProblem([addon({ id: 'tool', hooks: { register: 'registerTool' } }, [REGISTER, importer])], /helper\.ts imports \.\/register, a hook module/);
        const neighbour = addon({ id: 'other' }, [{ path: 'uses.ts', text: 'import { registerTool } from "../tool/register";\n' }]);
        assertProblem([addon({ id: 'tool', hooks: { register: 'registerTool' } }, [REGISTER]), neighbour], /uses\.ts imports \.\.\/tool\/register/);
    });

    test('a game hook names its function and the fields it returns, none of them the baseline\'s', () => {
        const file = { path: 'game.ts', text: 'export function toolGame(context) { return {}; }\n' };
        const withGame = (game: unknown, files = [file]) => addon({ id: 'tool', hooks: { game } }, files);
        assert.deepStrictEqual(problemsOf(withGame({ export: 'toolGame', fields: ['requiresCleanup', 'getGameVersion'] })), []);
        assertProblem([withGame('toolGame')], /"hooks\.game" must be \{ "export"/);
        assertProblem([withGame({ export: 'toolGame', fields: [] })], /"hooks\.game\.fields" must name each registerGame field/);
        assertProblem([withGame({ export: 'toolGame', fields: ['requiresCleanup', 'requiresCleanup'] })], /"hooks\.game\.fields" must name each registerGame field/);
        assertProblem([withGame({ export: 'tool-game', fields: ['requiresCleanup'] })], /"hooks\.game\.export" must be the name of a function/);
        assertProblem([withGame({ export: 'toolGame', fields: ['queryModPath', 'details'] })], /registerGame sets queryModPath, details already/);
        assertProblem([withGame({ export: 'otherGame', fields: ['requiresCleanup'] })], /game\.ts doesn't export otherGame/);
        assertProblem([withGame({ export: 'toolGame', fields: ['requiresCleanup'] }, [])], /"hooks\.game" needs game\.ts/);
    });

    test('two add-ons that meet may not return the same registerGame field unless one takes the other over', () => {
        assertProblem([gameAddon('first'), gameAddon('second')], /first and second both return requiresCleanup for registerGame/);
        assert.deepStrictEqual(problemsOf(gameAddon('first', { engines: ['unity'] }), gameAddon('second', { engines: ['godot'] })), []);
        assert.deepStrictEqual(problemsOf(gameAddon('first'), gameAddon('second', { hidden: true, when: ['first'], supersedes: ['first'] })), []);
    });

    test('options are checked, and their names are shared by all add-ons and the baseline', () => {
        const choices = [{ value: 'a', label: 'A', placeholders: { prose: 'Text A' } }, { value: 'b', label: 'B', placeholders: { prose: 'Text B' } }];
        assert.deepStrictEqual(problemsOf(addon({ id: 'tool', options: { flavour: { title: 'Flavour', choices } } })), []);
        assertProblem([addon({ id: 'tool', options: { 'my-flavour': { title: 'Flavour', choices } } })], /letters only/);
        assertProblem([addon({ id: 'tool', options: { gameName: { title: 'Name', choices } } })], /already used by the baseline/);
        assertProblem([addon({ id: 'first', options: { flavour: { title: 'Flavour', choices } } }), addon({ id: 'second', options: { flavour: { title: 'Flavour', choices } } })], /already used by first/);
        assertProblem([addon({ id: 'tool', options: { flavour: { title: 'Flavour', choices: [{ value: 'a b', label: 'A' }] } } })], /needs a "value" of letters/);
        assertProblem([addon({ id: 'tool', options: { flavour: { title: 'Flavour', choices: [{ value: 'a', label: 'A', placeholders: { prose: 'x' } }, { value: 'b', label: 'B' }] } } })], /must define the same placeholders/);
        assertProblem([addon({ id: 'tool', options: { flavour: { title: 'Flavour', choices: [{ value: 'a', label: 'A' }, { value: 'a', label: 'B' }] } } })], /has a value twice/);
        assertProblem([addon({ id: 'helper', hidden: true, options: { flavour: { title: 'Flavour', choices } } }), addon({ id: 'user', dependsOn: ['helper'] })], /can't ask anything/);
    });

    test('project files go outside src, and nowhere the baseline or another add-on writes', () => {
        const writing = (target: string, file = WORKFLOW, id = 'tool') => addon({ id, projectFiles: { [file.path]: target } }, [file]);
        assert.deepStrictEqual(problemsOf(writing('.github/workflows/release.yml')), []);
        assertProblem([addon({ id: 'tool', projectFiles: { 'missing.yml': 'a.yml' } })], /names missing\.yml, which isn't in the add-on's folder/);
        assertProblem([writing('helper.ts', { path: 'helper.ts', text: 'export {};\n' })], /can't move helper\.ts: TypeScript stays/);
        for (const target of ['../outside.yml', '/absolute.yml', 'C:/drive.yml', './here.yml', 'a/../b.yml', 'back\\slash.yml', 'folder/']) {
            assertProblem([writing(target)], /a path in the project, relative and with \//);
        }
        assertProblem([writing('src/release.yml')], /can't write release\.yml into src/);
        assertProblem([writing('.vscode/tasks.json')], /to \.vscode\/tasks\.json, which the baseline project writes/);
        assertProblem([writing(PACKAGE_JSON_PATH)], /which the baseline project writes/);
        const twice = addon({ id: 'tool', projectFiles: { 'a.yml': 'same.yml', 'b.yml': 'same.yml' } }, [{ path: 'a.yml', text: '' }, { path: 'b.yml', text: '' }]);
        assertProblem([twice], /writes two files to the same path/);
        assertProblem([writing('.github/workflows/release.yml'), writing('.github/workflows/release.yml', WORKFLOW, 'other')], /tool and other both write \.github\/workflows\/release\.yml/);
    });

    test('package.json additions have names of their own, and add-ons that meet agree on them', () => {
        assert.deepStrictEqual(problemsOf(addon({ id: 'tool', packageJson: { devDependencies: { semver: '^7.6.0' }, scripts: { 'tool:check': 'node check.mjs' } } })), []);
        assertProblem([addon({ id: 'tool', packageJson: { dependencies: { semver: '^7.6.0' } } })], /"packageJson" may hold "devDependencies", "scripts"/);
        assertProblem([addon({ id: 'tool', packageJson: { devDependencies: { semver: '' } } })], /"packageJson\.devDependencies" must map names to text/);
        assertProblem([addon({ id: 'tool', packageJson: { devDependencies: { rollup: '^4.0.0' } } })], /has rollup in "devDependencies" already/);
        assertProblem([addon({ id: 'tool', packageJson: { scripts: { build: 'make' } } })], /has build in "scripts" already/);
        assertProblem([addon({ id: 'tool', packageJson: { devDependencies: { 'winapi-bindings': '^2.0.0' } } })], /list it in "vortexLibraries" instead/);
        const pinning = (id: string, version: string) => addon({ id, packageJson: { devDependencies: { semver: version } } });
        assert.deepStrictEqual(problemsOf(pinning('first', '^7.6.0'), pinning('second', '^7.6.0')), []);
        assertProblem([pinning('first', '^7.6.0'), pinning('second', '^6.0.0')], /first and second give semver different values in "packageJson\.devDependencies"/);
    });

    test('Vortex libraries come from the catalogue, and .gitignore takes single lines', () => {
        assert.deepStrictEqual(problemsOf(addon({ id: 'tool', vortexLibraries: ['winapi-bindings', 'turbowalk'], gitignore: ['*.cache', 'out/'] })), []);
        assertProblem([addon({ id: 'tool', vortexLibraries: ['left-pad'] })], /"vortexLibraries" must list some of winapi-bindings/);
        assertProblem([addon({ id: 'tool', vortexLibraries: ['turbowalk', 'turbowalk'] })], /each once/);
        assertProblem([addon({ id: 'tool', gitignore: [] })], /"gitignore" must list lines/);
        assertProblem([addon({ id: 'tool', gitignore: ['first\nsecond'] })], /"gitignore" must list lines/);
    });

    test('two add-ons that meet may not both own the mods folder', () => {
        const owner = (id: string, extra: Record<string, unknown> = {}) => addon({ id, engines: ['unity'], modsPath: { base: 'game', path: '.' }, ...extra });
        assertProblem([owner('first'), owner('second')], /first and second both set "modsPath"/);
        assert.deepStrictEqual(problemsOf(owner('first'), owner('second', { engines: ['godot'] })), []);
        assert.deepStrictEqual(problemsOf(owner('first'), owner('second', { conflicts: ['first'] })), []);
        const glue = addon({ id: 'glue', engines: ['unity'], hidden: true, when: ['first', 'second'], supersedes: ['first', 'second'], modsPath: { base: 'game', path: 'mods' } });
        assert.deepStrictEqual(problemsOf(owner('first'), owner('second'), glue), []);
    });

    test('two add-ons that meet may not take over the same add-on unless one takes over the other', () => {
        const part = (id: string) => addon({ id, engines: ['unity'] });
        const glue = (id: string, members: string[], supersedes = members) => addon({ id, engines: ['unity'], hidden: true, when: members, supersedes });
        assertProblem([part('first'), part('second'), part('third'), glue('glueA', ['first', 'second']), glue('glueB', ['second', 'third'])], /glueA and glueB both take over second/);
        const all = glue('glueAll', ['first', 'second', 'third'], ['first', 'second', 'third', 'glueA', 'glueB']);
        assert.deepStrictEqual(problemsOf(part('first'), part('second'), part('third'), glue('glueA', ['first', 'second']), glue('glueB', ['second', 'third']), all), []);
    });
});
