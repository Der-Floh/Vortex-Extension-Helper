import * as assert from 'assert';
import { BEPINEX_BUILD_IL2CPP, BEPINEX_BUILD_MONO, MOD_LOADER_BEPINEX, MOD_LOADER_GML, MOD_LOADER_MELON_LOADER } from '../../constants';
import { modLoadersOf } from '../../project/projectManifest';
import { nextToExecutable } from '../../templates/loaders/loaderProfile';
import { profileFor } from '../../templates/loaders/profiles';
import { GENERATED_FILES, renderProject, restorableOutputs, unrestorablePaths } from '../../templates/registry';
import { restoreValues } from '../../templates/render';
import { fillSlots, SLOT_NAMES } from '../../templates/slots';
import type { BepInExBuild, GeneratedOutput, ModLoaderId, ProjectValues } from '../../types/project';
import { GAME_ENGINES, type GameEngine } from '../../wizard/engines';
import { askModLoaders, type LoaderPromptUi } from '../../wizard/loaderPrompts';
import { TS_FIXTURE_VALUES } from '../fixtures/createFixtureWorkspace';
import { LOADER_OUTCOMES } from '../fixtures/loaderOutcomes';

const PLAIN_PATHS = renderProject(TS_FIXTURE_VALUES).map(output => output.path);
const PLAIN_INSTALLER = 'src/installers/mods.ts';
const ARCHIVE_HELPERS = 'src/archive/loaderFiles.ts';

const inFolder = (folder: string, names: readonly string[]) => names.map(name => `src/${folder}/${name}.ts`);
const MELON_LOADER_CORE = inFolder('melonloader', ['constants', 'detection', 'modsInstaller', 'packageInstaller']);
const MELON_LOADER_SOLO = inFolder('melonloader', ['setup', 'register']);
const BEPINEX_CORE = inFolder('bepinex', ['constants', 'detection', 'modsInstaller', 'vortexSupport']);
const BEPINEX_SOLO = inFolder('bepinex', ['setup', 'register']);
const COMBINED = inFolder('loaders', ['constants', 'routing', 'detection', 'setup', 'register']);
const GML_FILES = inFolder('gml', [
    'constants', 'http', 'sevenZip', 'archive', 'detection', 'release', 'install', 'caches', 'deployment', 'gameLaunch',
    'loaderArchiveInstaller', 'modZipsInstaller', 'unpackedModsInstaller', 'setup', 'register',
]);

const REFERENCE_PROJECTS = 'Coal|coalllc|Vampire|vs-support|NanobotZ';
const MELON_LOADER_TEXT = 'MelonLoader|melon';
const BEPINEX_TEXT = 'BepInEx';
const GML_TEXT = 'Godot|GML';

const EXPECTED: Readonly<Record<string, { readonly added: readonly string[]; readonly foreign: string; readonly modLoaders?: readonly ModLoaderId[] }>> = {
    plain: { added: [], foreign: [MELON_LOADER_TEXT, BEPINEX_TEXT, GML_TEXT].join('|') },
    gml: { added: GML_FILES, foreign: [MELON_LOADER_TEXT, BEPINEX_TEXT].join('|'), modLoaders: [MOD_LOADER_GML] },
    melonloader: { added: [ARCHIVE_HELPERS, ...MELON_LOADER_CORE, ...MELON_LOADER_SOLO], foreign: [BEPINEX_TEXT, GML_TEXT].join('|'), modLoaders: [MOD_LOADER_MELON_LOADER] },
    'bepinex-mono': { added: [ARCHIVE_HELPERS, ...BEPINEX_CORE, ...BEPINEX_SOLO], foreign: [MELON_LOADER_TEXT, GML_TEXT].join('|'), modLoaders: [MOD_LOADER_BEPINEX] },
    'bepinex-il2cpp': { added: [ARCHIVE_HELPERS, ...BEPINEX_CORE, ...BEPINEX_SOLO], foreign: [MELON_LOADER_TEXT, GML_TEXT].join('|'), modLoaders: [MOD_LOADER_BEPINEX] },
    'both-mono': { added: [ARCHIVE_HELPERS, ...MELON_LOADER_CORE, ...BEPINEX_CORE, ...COMBINED], foreign: GML_TEXT, modLoaders: [MOD_LOADER_MELON_LOADER, MOD_LOADER_BEPINEX] },
    'both-il2cpp': { added: [ARCHIVE_HELPERS, ...MELON_LOADER_CORE, ...BEPINEX_CORE, ...COMBINED], foreign: GML_TEXT, modLoaders: [MOD_LOADER_MELON_LOADER, MOD_LOADER_BEPINEX] },
};

function textOf(outputs: readonly GeneratedOutput[], path: string): string {
    const output = outputs.find(candidate => candidate.path === path);
    assert.ok(output, `${path} is generated`);
    return output.content as string;
}

function textOutputs(outputs: readonly GeneratedOutput[]): readonly { path: string; content: string }[] {
    return outputs.flatMap(output => typeof output.content === 'string' ? [{ path: output.path, content: output.content }] : []);
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

suite('Mod loader templates', () => {
    for (const { id, choice } of LOADER_OUTCOMES) {
        suite(id, () => {
            const values: ProjectValues = { ...TS_FIXTURE_VALUES, ...choice };
            const outputs = renderProject(values);
            const expected = EXPECTED[id];
            const hasLoader = expected.modLoaders !== undefined;

            test('generates exactly its files', () => {
                const shared = hasLoader ? PLAIN_PATHS.filter(path => path !== PLAIN_INSTALLER) : PLAIN_PATHS;
                assert.deepStrictEqual(outputs.map(output => output.path).sort(), [...shared, ...expected.added].sort());
            });

            test('leaves no placeholder and no slot marker', () => {
                for (const output of textOutputs(outputs)) {
                    assert.ok(!output.content.includes('{{'), `${output.path} has a leftover placeholder`);
                    assert.ok(!/\/\/ (slot:|endslot)/.test(output.content), `${output.path} has a leftover slot marker`);
                }
            });

            test('names neither the reference projects nor a loader that was not picked', () => {
                const foreign = new RegExp(`${REFERENCE_PROJECTS}|${expected.foreign}`, 'i');
                for (const output of textOutputs(outputs)) {
                    assert.ok(!foreign.test(output.content), `${output.path} has ${foreign.exec(output.content)?.[0]}`);
                }
            });

            test('records its loaders in package.json and changes nothing else there', () => {
                const { vortex, ...rest } = JSON.parse(textOf(outputs, 'package.json'));
                assert.deepStrictEqual(vortex, hasLoader ? { modLoaders: expected.modLoaders } : undefined);
                assert.deepStrictEqual(rest, JSON.parse(textOf(renderProject(TS_FIXTURE_VALUES), 'package.json')));
                assert.deepStrictEqual(modLoadersOf({ vortex }), expected.modLoaders ?? []);
            });

            test('Create Missing Files restores what was generated', () => {
                const profile = profileFor(choice.modLoaders);
                assert.ok(profile);
                const restored = restorableOutputs(restoreValues(`${values.shortName}-support`, values.gameName), profile);
                for (const output of restored) {
                    assert.deepStrictEqual(output.content, outputs.find(candidate => candidate.path === output.path)?.content, output.path);
                }
                assert.deepStrictEqual(
                    [...restored.map(output => output.path), ...unrestorablePaths(profile)].sort(),
                    outputs.map(output => output.path).sort(),
                );
                assert.strictEqual(restored.some(output => output.path === PLAIN_INSTALLER), !hasLoader);
            });

            if (hasLoader) {
                test('has none of the plain installer', () => {
                    for (const output of textOutputs(outputs).filter(candidate => candidate.path.startsWith('src/'))) {
                        assert.ok(!/MOD_FILES|\bINSTALLERS\b|\binstallMods\b|\bfindModFiles\b/.test(output.content), output.path);
                    }
                    assert.ok(!textOf(outputs, 'README.md').includes('MOD_FILES'));
                });
            }
        });
    }

    test('the mods folder depends on the loader and on where the executable is', () => {
        type Choice = Pick<ProjectValues, 'modLoaders'>;
        const modsPath = (choice: Choice, executable: string) =>
            /modsPath: '([^']+)'/.exec(textOf(renderProject({ ...TS_FIXTURE_VALUES, ...choice, executable }), 'src/common/constants.ts'))?.[1];
        const gml: Choice = { modLoaders: [MOD_LOADER_GML] };
        const melonLoader: Choice = { modLoaders: [MOD_LOADER_MELON_LOADER] };
        const bepInEx: Choice = { modLoaders: [MOD_LOADER_BEPINEX] };
        const both: Choice = { modLoaders: [MOD_LOADER_MELON_LOADER, MOD_LOADER_BEPINEX] };

        assert.strictEqual(modsPath({}, 'Game/Game.exe'), 'mods');
        assert.strictEqual(modsPath(gml, 'Game.exe'), 'mods');
        assert.strictEqual(modsPath(gml, 'Game/Game.exe'), 'Game/mods');
        assert.strictEqual(modsPath(gml, ''), 'mods');
        assert.strictEqual(modsPath(melonLoader, 'Game/Game.exe'), '.');
        assert.strictEqual(modsPath(bepInEx, 'Game.exe'), 'BepInEx/plugins');
        assert.strictEqual(modsPath(bepInEx, 'Game/Game.exe'), 'Game/BepInEx/plugins');
        assert.strictEqual(modsPath(both, 'Game/Game.exe'), 'Game/BepInEx/plugins');
    });

    test('nextToExecutable keeps forward slashes and handles no folder', () => {
        assert.strictEqual(nextToExecutable('Game.exe', 'a/b'), 'a/b');
        assert.strictEqual(nextToExecutable('Bin/x64/Game.exe', 'a'), 'Bin/x64/a');
    });

    test('the BepInEx build reaches the constants and the README', () => {
        const render = (bepInExBuild: BepInExBuild) => renderProject({ ...TS_FIXTURE_VALUES, modLoaders: [MOD_LOADER_BEPINEX], bepInExBuild });
        assert.ok(textOf(render(BEPINEX_BUILD_MONO), 'src/bepinex/constants.ts').includes(`'${BEPINEX_BUILD_MONO}'`));
        assert.ok(textOf(render(BEPINEX_BUILD_IL2CPP), 'src/bepinex/constants.ts').includes(`'${BEPINEX_BUILD_IL2CPP}'`));
        assert.ok(textOf(render(BEPINEX_BUILD_MONO), 'README.md').includes('Vortex downloads and installs it'));
        assert.ok(textOf(render(BEPINEX_BUILD_IL2CPP), 'README.md').includes('bleeding-edge builds'));
    });

    test('a selection nothing covers is refused', () => {
        assert.strictEqual(profileFor(['unknown']), undefined);
        assert.throws(() => renderProject({ ...TS_FIXTURE_VALUES, modLoaders: [MOD_LOADER_GML, MOD_LOADER_BEPINEX] }), /No template covers/);
    });

    test('modLoadersOf ignores anything that is not a list of names', () => {
        assert.deepStrictEqual(modLoadersOf({}), []);
        assert.deepStrictEqual(modLoadersOf({ vortex: { modLoaders: 'gml' } }), []);
        assert.deepStrictEqual(modLoadersOf({ vortex: { modLoaders: ['gml', 3] } }), ['gml']);
    });
});

suite('Engine and mod loader questions', () => {
    const engineNamed = (label: string) => GAME_ENGINES.find(engine => engine.label === label);

    interface Answers {
        readonly engine?: string;
        readonly loaders?: readonly ModLoaderId[];
        readonly build?: BepInExBuild;
    }

    function scripted({ engine, loaders, build }: Answers): { ui: LoaderPromptUi; asked: string[] } {
        const asked: string[] = [];
        const ui: LoaderPromptUi = {
            pickEngine: async () => {
                asked.push('engine');
                return engine ? engineNamed(engine) : undefined;
            },
            pickLoaders: async () => {
                asked.push('loaders');
                return loaders;
            },
            pickBepInExBuild: async () => {
                asked.push('build');
                return build;
            },
        };
        return { ui, asked };
    }

    test('the engines are the agreed ones, in order', () => {
        assert.deepStrictEqual(GAME_ENGINES.map(engine => engine.label), ['Unreal Engine', 'Unity', 'Godot', 'Source', 'GameMaker', 'Frostbite', 'Other']);
        assert.deepStrictEqual(engineNamed('Unity')?.loaders, [MOD_LOADER_MELON_LOADER, MOD_LOADER_BEPINEX]);
        assert.deepStrictEqual(engineNamed('Godot')?.loaders, [MOD_LOADER_GML]);
    });

    test('every checklist of every engine has a template', () => {
        const subsets = ({ loaders }: GameEngine) => loaders.reduce<ModLoaderId[][]>(
            (all, loader) => [...all, ...all.map(subset => [...subset, loader])],
            [[]],
        );
        for (const engine of GAME_ENGINES) {
            for (const subset of subsets(engine)) {
                assert.ok(profileFor(subset), `${engine.label}: ${subset.join(', ')}`);
            }
        }
    });

    test('cancelling the engine ends the questions', async () => {
        const { ui, asked } = scripted({});
        assert.strictEqual(await askModLoaders(ui), undefined);
        assert.deepStrictEqual(asked, ['engine']);
    });

    test('an engine without loaders asks nothing more and stays plain', async () => {
        const { ui, asked } = scripted({ engine: 'Frostbite' });
        assert.deepStrictEqual(await askModLoaders(ui), { modLoaders: [] });
        assert.deepStrictEqual(asked, ['engine']);
    });

    test('cancelling the checklist ends the questions', async () => {
        const { ui, asked } = scripted({ engine: 'Unity' });
        assert.strictEqual(await askModLoaders(ui), undefined);
        assert.deepStrictEqual(asked, ['engine', 'loaders']);
    });

    test('nothing ticked stays plain and asks no build', async () => {
        const { ui, asked } = scripted({ engine: 'Unity', loaders: [] });
        assert.deepStrictEqual(await askModLoaders(ui), { modLoaders: [] });
        assert.deepStrictEqual(asked, ['engine', 'loaders']);
    });

    test('a loader other than BepInEx asks no build', async () => {
        const { ui, asked } = scripted({ engine: 'Godot', loaders: [MOD_LOADER_GML] });
        assert.deepStrictEqual(await askModLoaders(ui), { modLoaders: [MOD_LOADER_GML] });
        assert.deepStrictEqual(asked, ['engine', 'loaders']);
    });

    test('BepInEx asks for the build', async () => {
        const loaders: ModLoaderId[] = [MOD_LOADER_MELON_LOADER, MOD_LOADER_BEPINEX];
        const { ui, asked } = scripted({ engine: 'Unity', loaders, build: BEPINEX_BUILD_IL2CPP });
        assert.deepStrictEqual(await askModLoaders(ui), { modLoaders: loaders, bepInExBuild: BEPINEX_BUILD_IL2CPP });
        assert.deepStrictEqual(asked, ['engine', 'loaders', 'build']);
    });

    test('cancelling the build ends the questions', async () => {
        const { ui } = scripted({ engine: 'Unity', loaders: [MOD_LOADER_BEPINEX] });
        assert.strictEqual(await askModLoaders(ui), undefined);
    });
});
