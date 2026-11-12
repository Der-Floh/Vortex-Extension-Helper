import * as assert from 'assert';
import { VORTEX_LIBRARIES } from '../../constants';
import { addonRecordOf } from '../../project/projectManifest';
import { findAddon, HOOK_MODULES, selectableAddons, type Addon, type Catalogue } from '../../templates/addons/addon';
import { nextToExecutable } from '../../templates/addons/composeAddons';
import { DISCOVERED_CATALOGUE } from '../../templates/addons/discoveredCatalogue';
import { resolveAddons, type AddonChoices } from '../../templates/addons/resolveAddons';
import { compositionOf, GENERATED_FILES, independentOutputs, renderProject, restorableOutputs, restorationOf, unrestorablePaths } from '../../templates/registry';
import { placeholderKeys, restoreValues } from '../../templates/render';
import { fillSlots, SLOT_NAMES } from '../../templates/slots';
import type { GeneratedOutput, ProjectValues } from '../../types/project';
import { addonOutcomes } from '../fixtures/addonOutcomes';
import { TS_FIXTURE_VALUES } from '../fixtures/createFixtureWorkspace';
import { TEST_ADDON, TEST_CATALOGUE } from '../fixtures/testAddon';

const BASELINE_PATHS = ['package.json', ...GENERATED_FILES.map(file => file.path)];
const PLAIN_ONLY = GENERATED_FILES.filter(file => file.plainOnly).map(file => file.path);
const HOOK_FILES: readonly string[] = Object.values(HOOK_MODULES);
const NO_CHOICES: AddonChoices = { addons: [], options: {} };
const RESTORE_VALUES = restoreValues(`${TS_FIXTURE_VALUES.shortName}-support`, TS_FIXTURE_VALUES.gameName);

const byNpmOrder = (left: string, right: string) => left.localeCompare(right, 'en');

/** Where a file of an add-on's folder ends up in the project */
function projectPathOf(addon: Addon, file: string): string {
    const moved = addon.manifest.projectFiles;
    return moved && Object.hasOwn(moved, file) ? moved[file] : `src/${addon.manifest.id}/${file}`;
}

/** Everything the add-ons ask package.json for, each library with its source from the catalogue */
function expectedAdditions(addons: readonly Addon[]) {
    const libraries = [...new Set(addons.flatMap(addon => addon.manifest.vortexLibraries ?? []))];
    return {
        devDependencies: Object.assign({}, ...addons.map(addon => addon.manifest.packageJson?.devDependencies ?? {}),
            ...libraries.map(name => ({ [name]: VORTEX_LIBRARIES.find(library => library.name === name)?.source }))),
        scripts: Object.assign({}, ...addons.map(addon => addon.manifest.packageJson?.scripts ?? {})),
        externals: libraries,
    };
}

function textOf(outputs: readonly GeneratedOutput[], path: string): string {
    const output = outputs.find(candidate => candidate.path === path);
    assert.ok(output, `${path} is generated`);
    return output.content as string;
}

function textOutputs(outputs: readonly GeneratedOutput[]): readonly { path: string; content: string }[] {
    return outputs.flatMap(output => typeof output.content === 'string' ? [{ path: output.path, content: output.content }] : []);
}

function render(choices: AddonChoices, values: ProjectValues = TS_FIXTURE_VALUES, catalogue: Catalogue = DISCOVERED_CATALOGUE): readonly GeneratedOutput[] {
    return renderProject({ ...values, addons: choices.addons, addonOptions: choices.options }, catalogue);
}

suite('Template slots', () => {
    const template = 'before\n    // slot:index-imports\n    own line\n    // endslot\nafter\n';

    test('a slot keeps its own lines and loses its markers', () => {
        assert.strictEqual(fillSlots(template, {}), 'before\n    own line\nafter\n');
    });

    test('a replacement takes the indentation of the marker', () => {
        assert.strictEqual(fillSlots(template, { 'index-imports': 'first\n\nsecond' }), 'before\n    first\n\n    second\nafter\n');
    });

    test('an empty replacement removes the slot', () => {
        assert.strictEqual(fillSlots(template, { 'index-imports': '' }), 'before\nafter\n');
    });

    test('an unknown slot throws', () => {
        assert.throws(() => fillSlots('// slot:nope\n// endslot\n', {}), /Unknown template slot nope/);
    });

    test('a marker without its partner throws', () => {
        assert.throws(() => fillSlots('// slot:index-imports\nnever closed\n', {}), /Unbalanced/);
        assert.throws(() => fillSlots('stray\n// endslot\n', {}), /Unbalanced/);
    });

    test('every slot is used by a template of the baseline', () => {
        const templates = GENERATED_FILES.flatMap(file => typeof file.source === 'string' ? [file.source] : []).join('\n');
        for (const name of SLOT_NAMES) {
            assert.ok(templates.includes(`// slot:${name}\n`), name);
        }
    });
});

suite('Every add-on outcome', () => {
    const plainManifest = JSON.parse(textOf(render(NO_CHOICES), 'package.json'));

    for (const { label, choices } of addonOutcomes(TEST_CATALOGUE)) {
        suite(label, () => {
            const outputs = render(choices, TS_FIXTURE_VALUES, TEST_CATALOGUE);
            const resolution = resolveAddons(choices, TEST_CATALOGUE);
            assert.ok(resolution.ok, label);
            const { addons, superseded } = resolution.resolved;
            const replaced = addons.some(addon => addon.manifest.replacesPlainInstaller);

            test('generates the baseline and each add-on\'s files, nothing else', () => {
                const expected = [
                    ...BASELINE_PATHS.filter(path => !replaced || !PLAIN_ONLY.includes(path)),
                    ...addons.flatMap(addon => addon.files
                        .filter(file => !superseded.has(addon.manifest.id) || !HOOK_FILES.includes(file.path))
                        .map(file => projectPathOf(addon, file.path))),
                ];
                assert.deepStrictEqual(outputs.map(output => output.path).sort(), expected.sort());
            });

            test('leaves no placeholder and no slot marker', () => {
                for (const output of textOutputs(outputs)) {
                    assert.deepStrictEqual(placeholderKeys(output.content), [], `${output.path} has a leftover placeholder`);
                    assert.ok(!/\/\/ (slot:|endslot)/.test(output.content), `${output.path} has a leftover slot marker`);
                }
            });

            test('records exactly its add-ons and adds to package.json only what they ask for', () => {
                const manifest = JSON.parse(textOf(outputs, 'package.json'));
                const { vortex, devDependencies, scripts, ...rest } = manifest;
                const { devDependencies: plainDependencies, scripts: plainScripts, ...plainRest } = plainManifest;
                const additions = expectedAdditions(addons);
                assert.deepStrictEqual(rest, plainRest);
                assert.deepStrictEqual(devDependencies, { ...plainDependencies, ...additions.devDependencies });
                assert.deepStrictEqual(Object.keys(devDependencies), Object.keys(devDependencies).sort(byNpmOrder));
                assert.deepStrictEqual(Object.entries(scripts), [...Object.entries(plainScripts), ...Object.entries(additions.scripts)]);
                if (addons.length === 0) {
                    assert.strictEqual(vortex, undefined);
                    return;
                }
                const record = addonRecordOf(manifest);
                assert.deepStrictEqual(record?.addons, Object.fromEntries(addons.map(addon => [addon.manifest.id, addon.manifest.version])));
                assert.deepStrictEqual(record?.options, resolution.resolved.options);
                assert.deepStrictEqual(vortex.externals, additions.externals.length > 0 ? additions.externals : undefined);
            });

            test('Create Missing Files restores exactly what was generated', () => {
                const restoration = restorationOf(addonRecordOf(JSON.parse(textOf(outputs, 'package.json'))), TEST_CATALOGUE);
                assert.ok(restoration.ok);
                const composition = compositionOf(restoration);
                const restored = restorableOutputs(RESTORE_VALUES, composition);
                for (const output of restored) {
                    assert.deepStrictEqual(output.content, outputs.find(candidate => candidate.path === output.path)?.content, output.path);
                }
                assert.deepStrictEqual([...restored.map(output => output.path), ...unrestorablePaths(composition)].sort(), outputs.map(output => output.path).sort());
            });
        });
    }
});

suite('The hooks and fields of an add-on, through the test add-on', () => {
    const choices = { addons: [TEST_ADDON.manifest.id], options: { flavour: 'spicy' } };
    const outputs = render(choices, TS_FIXTURE_VALUES, TEST_CATALOGUE);
    const manifest = JSON.parse(textOf(outputs, 'package.json'));
    const withTestAddon = (changes: Partial<Addon['manifest']>): Catalogue => ({
        ...TEST_CATALOGUE,
        addons: TEST_CATALOGUE.addons.map(addon => addon === TEST_ADDON ? { ...addon, manifest: { ...addon.manifest, ...changes } } : addon),
    });

    test('main() spreads the game hook into registerGame, after the baseline\'s fields', () => {
        const entry = textOf(outputs, 'src/index.ts');
        assert.ok(entry.includes('import { everythingGameFields } from \'./everything/game\';'));
        assert.ok(entry.includes('        details: { steamAppId: GAME.steamAppId },\n        ...everythingGameFields(context),\n    });'));
        assert.ok(entry.includes('registerEverything(context);'));
        assert.ok(entry.includes('context.registerInstaller(INSTALLERS.mods.id'), 'the plain installer stays');
    });

    test('the setup hook runs in prepareForModding', () => {
        const setup = textOf(outputs, 'src/setup/prepareForModding.ts');
        assert.ok(setup.includes('import { prepareEverything } from \'../everything/setup\';'));
        assert.ok(setup.includes('    await prepareEverything(discovery, api);\n}'));
    });

    test('a project file is written where it belongs, and leaves its own ${{ }} expressions alone', () => {
        const workflow = textOf(outputs, '.github/workflows/release.yml');
        assert.ok(workflow.startsWith(`name: Release ${TS_FIXTURE_VALUES.shortName}-support\n`));
        assert.ok(workflow.includes('${{ github.ref_name }}'));
        assert.ok(!outputs.some(output => output.path.endsWith('release.yml') && output.path.startsWith('src/')));
    });

    test('package.json gets the dev dependencies in npm\'s order, the scripts after the baseline\'s and the libraries as externals', () => {
        assert.strictEqual(manifest.devDependencies.semver, '^7.6.0');
        assert.strictEqual(manifest.devDependencies['winapi-bindings'], VORTEX_LIBRARIES.find(library => library.name === 'winapi-bindings')?.source);
        assert.deepStrictEqual(Object.keys(manifest.scripts).at(-1), 'everything:check');
        assert.deepStrictEqual(Object.keys(manifest.vortex), ['addons', 'addonOptions', 'externals']);
        assert.deepStrictEqual(manifest.vortex.externals, ['winapi-bindings']);
    });

    test('.gitignore ends with the add-on\'s lines, below its name', () => {
        assert.ok(textOf(outputs, '.gitignore').endsWith('.pack\n\n# Everything\n*.everything\n'));
    });

    test('the option reaches the code, the README section and the README notes', () => {
        assert.ok(textOf(outputs, 'src/everything/flavour.ts').includes('\'spicy\''));
        const readme = textOf(outputs, 'README.md');
        assert.ok(readme.includes(`## Everything\n\nThe spicy flavour of everything for ${TS_FIXTURE_VALUES.gameName}.`));
        assert.ok(readme.includes(`- Spicy suits ${TS_FIXTURE_VALUES.gameName}.`));
        assert.ok(readme.includes('- Does everything at once.'));
    });

    test('without the add-ons, Create Missing Files leaves .gitignore alone, which they may have added to', () => {
        assert.ok(!independentOutputs(RESTORE_VALUES).some(output => output.path === '.gitignore'));
    });

    test('two files at one path are refused', () => {
        const clashing = withTestAddon({ projectFiles: { 'release.yml': 'rollup.config.mjs' } });
        assert.throws(() => render(choices, TS_FIXTURE_VALUES, clashing), /Two files would be written to rollup\.config\.mjs/);
    });
});

suite('The built-in add-ons', () => {
    const inFolder = (folder: string, names: readonly string[]) => names.map(name => `src/${folder}/${name}.ts`);
    const HELPERS = inFolder('loaderPackages', ['packages']);
    const MELON_LOADER_CORE = inFolder('melonloader', ['constants', 'detection', 'modsInstaller', 'packageInstaller']);
    const BEPINEX_CORE = inFolder('bepinex', ['constants', 'detection', 'modsInstaller', 'vortexSupport']);
    const SOLO = (folder: string) => inFolder(folder, ['setup', 'register']);
    const GML_FILES = inFolder('gml', [
        'constants', 'http', 'sevenZip', 'archive', 'detection', 'release', 'install', 'caches', 'deployment', 'gameLaunch',
        'loaderArchiveInstaller', 'modZipsInstaller', 'unpackedModsInstaller', 'setup', 'register',
    ]);
    const PLAIN_PATHS = render({ addons: [], options: {} }).map(output => output.path);
    const MONO = { unityBuild: 'unitymono' };
    const IL2CPP = { unityBuild: 'unityil2cpp' };
    const REFERENCE_PROJECTS = 'Coal|coalllc|Vampire|vs-support|NanobotZ';
    const CASES = [
        { addons: [], options: {}, added: [], foreign: 'MelonLoader|melon|BepInEx|Godot|GML' },
        { addons: ['gml'], options: {}, added: GML_FILES, foreign: 'MelonLoader|melon|BepInEx' },
        { addons: ['melonloader'], options: {}, added: [...HELPERS, ...MELON_LOADER_CORE, ...SOLO('melonloader')], foreign: 'BepInEx|Godot|GML' },
        { addons: ['bepinex'], options: MONO, added: [...HELPERS, ...BEPINEX_CORE, ...SOLO('bepinex')], foreign: 'MelonLoader|melon|Godot|GML' },
        { addons: ['bepinex'], options: IL2CPP, added: [...HELPERS, ...BEPINEX_CORE, ...SOLO('bepinex')], foreign: 'MelonLoader|melon|Godot|GML' },
        { addons: ['melonloader', 'bepinex'], options: MONO, added: [...HELPERS, ...MELON_LOADER_CORE, ...BEPINEX_CORE, ...inFolder('loaders', ['constants', 'routing', 'detection', 'setup', 'register'])], foreign: 'Godot|GML' },
    ];

    for (const { addons, options, added, foreign } of CASES) {
        const label = `${addons.join(' + ') || 'plain'} ${JSON.stringify(options)}`;
        const outputs = render({ addons, options });

        test(`${label}: exactly its files`, () => {
            const shared = addons.length > 0 ? PLAIN_PATHS.filter(path => path !== 'src/installers/mods.ts') : PLAIN_PATHS;
            assert.deepStrictEqual(outputs.map(output => output.path).sort(), [...shared, ...added].sort());
        });

        test(`${label}: names neither the reference projects nor a loader that wasn't picked`, () => {
            const forbidden = new RegExp(`${REFERENCE_PROJECTS}|${foreign}`, 'i');
            for (const output of textOutputs(outputs)) {
                assert.ok(!forbidden.test(output.content), `${output.path} has ${forbidden.exec(output.content)?.[0]}`);
            }
        });

        if (addons.length > 0) {
            test(`${label}: none of the plain installer is left`, () => {
                for (const output of textOutputs(outputs).filter(candidate => candidate.path.startsWith('src/'))) {
                    assert.ok(!/MOD_FILES|\bINSTALLERS\b|\binstallMods\b|\bfindModFiles\b/.test(output.content), output.path);
                }
                assert.ok(!textOf(outputs, 'README.md').includes('MOD_FILES'));
            });
        }
    }

    test('the agreed add-ons are there, for their engines', () => {
        const offered = (engine: string) => selectableAddons(DISCOVERED_CATALOGUE, engine).map(addon => addon.manifest.id);
        assert.ok(offered('godot').includes('gml'));
        assert.ok(['bepinex', 'melonloader'].every(id => offered('unity').includes(id)));
        assert.deepStrictEqual(findAddon(DISCOVERED_CATALOGUE, 'loaders')?.manifest.when, ['melonloader', 'bepinex']);
    });

    test('the mods folder depends on the add-on and on where the executable is', () => {
        const modsPath = (addons: readonly string[], executable: string) =>
            /modsPath: '([^']+)'/.exec(textOf(render({ addons, options: {} }, { ...TS_FIXTURE_VALUES, executable }), 'src/common/constants.ts'))?.[1];
        assert.strictEqual(modsPath([], 'Game/Game.exe'), 'mods');
        assert.strictEqual(modsPath(['gml'], 'Game.exe'), 'mods');
        assert.strictEqual(modsPath(['gml'], 'Game/Game.exe'), 'Game/mods');
        assert.strictEqual(modsPath(['gml'], ''), 'mods');
        assert.strictEqual(modsPath(['melonloader'], 'Game/Game.exe'), '.');
        assert.strictEqual(modsPath(['bepinex'], 'Game.exe'), 'BepInEx/plugins');
        assert.strictEqual(modsPath(['bepinex'], 'Game/Game.exe'), 'Game/BepInEx/plugins');
        assert.strictEqual(modsPath(['melonloader', 'bepinex'], 'Game/Game.exe'), 'Game/BepInEx/plugins');
    });

    test('nextToExecutable keeps forward slashes and handles no folder', () => {
        assert.strictEqual(nextToExecutable('Game.exe', 'a/b'), 'a/b');
        assert.strictEqual(nextToExecutable('Bin/x64/Game.exe', 'a'), 'Bin/x64/a');
    });

    test('the BepInEx build reaches the constants and the README', () => {
        const constants = (options: Record<string, string>) => textOf(render({ addons: ['bepinex'], options }), 'src/bepinex/constants.ts');
        const readme = (options: Record<string, string>) => textOf(render({ addons: ['bepinex'], options }), 'README.md');
        assert.ok(constants(MONO).includes('\'unitymono\''));
        assert.ok(constants(IL2CPP).includes('\'unityil2cpp\''));
        assert.ok(readme(MONO).includes('Vortex downloads and installs it'));
        assert.ok(readme(IL2CPP).includes('bleeding-edge builds'));
        assert.ok(readme(IL2CPP).includes(`${TS_FIXTURE_VALUES.gameName} mods need the IL2CPP build`));
    });

    test('an unknown add-on or option value is refused', () => {
        assert.throws(() => render({ addons: ['unknown'], options: {} }), /No add-on is called unknown/);
        assert.throws(() => render({ addons: ['bepinex'], options: { unityBuild: 'unityx' } }), /unityx isn't a choice/);
    });

    test('a record from another version restores only what no add-on changes', () => {
        const record = { addons: { melonloader: '0.9.0', loaderPackages: '1.0.0' }, options: {} };
        const restoration = restorationOf(record);
        assert.ok(!restoration.ok && /MelonLoader 0\.9\.0/.test(restoration.problem));
        const independent = independentOutputs(restoreValues('tsgame-support', 'TS Game')).map(output => output.path);
        assert.ok(independent.includes('rollup.config.mjs'));
        assert.ok(!independent.some(path => ['src/index.ts', 'src/setup/prepareForModding.ts', 'src/archive/inspection.ts', 'src/installers/mods.ts'].includes(path)));
    });

    test('addonRecordOf ignores what isn\'t a record of add-ons', () => {
        assert.strictEqual(addonRecordOf({}), undefined);
        assert.strictEqual(addonRecordOf({ vortex: { externals: [] } }), undefined);
        assert.deepStrictEqual(addonRecordOf({ vortex: { addons: { gml: '1.0.0', broken: 3 } } }), { addons: { gml: '1.0.0' }, options: {} });
    });
});
