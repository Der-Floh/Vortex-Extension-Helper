import * as assert from 'assert';
import { applyAddonChange } from '../../project/projectManifest';
import { supportsEngine, type Addon, type AddonManifest, type Catalogue } from '../../templates/addons/addon';
import { planAddonChange, YOUR_PROJECT, type AddonChangeRequest } from '../../templates/addons/changeAddons';
import { mergeImportClash } from '../../templates/addons/importMerge';
import { resolveAddons, type AddonChoices } from '../../templates/addons/resolveAddons';
import { readProjectValues } from '../../templates/projectValues';
import type { ProjectValues } from '../../types/project';
import { mergeLines, mergeTexts, wholeFileConflict } from '../../utils/threeWayMerge';
import { addonOutcomes } from '../fixtures/addonOutcomes';
import {
    addRequest,
    CHANGE_PAIRS,
    editedProjects,
    existingProject,
    generatedProject,
    plannedChange,
    removeRequest,
    withPlan,
    type ProjectFiles,
} from '../fixtures/addonEdits';
import { TS_FIXTURE_VALUES } from '../fixtures/createFixtureWorkspace';
import { TEST_CATALOGUE } from '../fixtures/testAddon';

const LABELS = { ours: 'Ours', theirs: 'Theirs' };
const AWKWARD_VALUES: ProjectValues = { shortName: 'bg', gameId: 'baldurs\'gate', gameName: 'Baldur\'s */ Gate', author: 'Tests', executable: 'Game/Game.exe' };

function assertSameProject(actual: ProjectFiles, expected: ProjectFiles, label: string): void {
    assert.deepStrictEqual([...actual.keys()].sort(), [...expected.keys()].sort(), label);
    for (const [file, content] of expected) {
        assert.deepStrictEqual(actual.get(file), content, `${label}: ${file}`);
    }
}

function plan(files: ProjectFiles, request: AddonChangeRequest, catalogue: Catalogue = TEST_CATALOGUE) {
    return plannedChange(files, request, catalogue);
}

function refusal(files: ProjectFiles, request: AddonChangeRequest, catalogue: Catalogue = TEST_CATALOGUE): string {
    const result = planAddonChange(existingProject(files), request, catalogue);
    assert.ok(!result.ok, 'the change was planned');
    return result.problem;
}

/** Every selection of some of the picks that resolves, the picks themselves left out */
function smallerSelections(choices: AddonChoices): AddonChoices[] {
    const picks = choices.addons;
    const subsets = Array.from({ length: 2 ** picks.length - 1 }, (_, mask) => picks.filter((_id, index) => mask & (1 << index)));
    return subsets
        .map(addons => ({ addons, options: choices.options }))
        .filter(selection => resolveAddons(selection, TEST_CATALOGUE).ok);
}

function engineFor(choices: AddonChoices): string | undefined {
    const addons = choices.addons.map(id => TEST_CATALOGUE.addons.find(addon => addon.manifest.id === id)!);
    return TEST_CATALOGUE.engines.find(engine => addons.every(addon => supportsEngine(addon, engine.id)))?.id;
}

suite('Three-way merge', () => {
    const base = ['a', 'b', 'c', 'd', 'e'];

    test('changes of different lines are both taken', () => {
        const merged = mergeLines(base, ['A', 'b', 'c', 'd', 'e'], ['a', 'b', 'c', 'd', 'E'], LABELS);
        assert.deepStrictEqual(merged, { lines: ['A', 'b', 'c', 'd', 'E'], conflicts: 0 });
    });

    test('an insertion next to a change of the other side is no clash', () => {
        assert.deepStrictEqual(mergeLines(base, ['a', 'b', 'mine', 'c', 'd', 'e'], ['a', 'B', 'c', 'd', 'e'], LABELS).lines, ['a', 'B', 'mine', 'c', 'd', 'e']);
        assert.deepStrictEqual(mergeLines(base, ['a', 'b', 'mine', 'c', 'd', 'e'], ['a', 'c', 'd', 'e'], LABELS).lines, ['a', 'mine', 'c', 'd', 'e']);
    });

    test('lines both inserted at one place are both kept, theirs first', () => {
        assert.deepStrictEqual(mergeLines(base, ['a', 'b', 'mine', 'c', 'd', 'e'], ['a', 'b', 'theirs', 'c', 'd', 'e'], LABELS), { lines: ['a', 'b', 'theirs', 'mine', 'c', 'd', 'e'], conflicts: 0 });
    });

    test('the same change on both sides is taken once', () => {
        assert.deepStrictEqual(mergeLines(base, ['a', 'X', 'c', 'd', 'e'], ['a', 'X', 'c', 'd', 'e'], LABELS), { lines: ['a', 'X', 'c', 'd', 'e'], conflicts: 0 });
    });

    test('different changes of the same lines are marked', () => {
        assert.deepStrictEqual(mergeLines(base, ['a', 'mine', 'c', 'd', 'e'], ['a', 'theirs', 'c', 'd', 'e'], LABELS), {
            lines: ['a', '<<<<<<< Ours', 'mine', '=======', 'theirs', '>>>>>>> Theirs', 'c', 'd', 'e'],
            conflicts: 1,
        });
    });

    test('an insertion inside a region the other side replaces is marked', () => {
        assert.strictEqual(mergeLines(base, ['a', 'b', 'mine', 'c', 'd', 'e'], ['a', 'e'], LABELS).conflicts, 1);
    });

    test('text keeps the line endings of the project\'s version', () => {
        const merged = mergeTexts('a\nb\nc\n', 'a\r\nb\r\nc\r\nmine\r\n', 'A\nb\nc\n', LABELS);
        assert.deepStrictEqual(merged, { text: 'A\r\nb\r\nc\r\nmine\r\n', conflicts: 0 });
    });

    test('a whole file against nothing', () => {
        assert.strictEqual(wholeFileConflict('one\ntwo\n', '', LABELS), '<<<<<<< Ours\none\ntwo\n=======\n>>>>>>> Theirs\n');
    });

    test('a clash of import lines is settled per module', () => {
        const merged = mergeImportClash({
            base: ['import { GAME, INSTALLERS } from \'./common/constants\';'],
            ours: ['import { GAME, NOTIFICATION_IDS, INSTALLERS } from \'./common/constants\';'],
            theirs: ['import { GAME } from \'./common/constants\';', 'import { registerGml } from \'./gml/register\';'],
        });
        assert.deepStrictEqual(merged, ['import { GAME, NOTIFICATION_IDS } from \'./common/constants\';', 'import { registerGml } from \'./gml/register\';']);
        assert.strictEqual(mergeImportClash({ base: ['const a = 1;'], ours: ['const a = 2;'], theirs: ['const a = 3;'] }), undefined);
    });
});

suite('Reading a project\'s values back', () => {
    for (const values of [TS_FIXTURE_VALUES, AWKWARD_VALUES]) {
        test(`gives back what the wizard asked, for ${values.gameName}`, () => {
            const files = generatedProject(values, { addons: [], options: {} });
            const read = readProjectValues(existingProject(files).manifest, files);
            assert.deepStrictEqual(read, {
                shortName: values.shortName,
                gameId: values.gameId,
                gameName: values.gameName,
                author: values.author,
                steamAppId: values.steamAppId || 'STEAM_APP_ID',
                executable: values.executable || 'GAME_EXECUTABLE.exe',
            });
        });
    }

    test('falls back on package.json when the constants say nothing', () => {
        const files = generatedProject(TS_FIXTURE_VALUES, { addons: [], options: {} });
        files.set('src/common/constants.ts', 'export const GAME = {};\n');
        const read = readProjectValues(existingProject(files).manifest, files);
        assert.strictEqual(read.shortName, TS_FIXTURE_VALUES.shortName);
        assert.strictEqual(read.gameName, TS_FIXTURE_VALUES.gameName);
        assert.strictEqual(read.executable, undefined);
    });
});

suite('Adding and removing add-ons', () => {
    suite('added later is the same as picked at creation, and removed the same as never picked', () => {
        for (const { label, choices } of addonOutcomes(TEST_CATALOGUE).filter(outcome => outcome.choices.addons.length > 0)) {
            const engine = engineFor(choices);
            for (const smaller of smallerSelections(choices)) {
                const pair = { label, engine: engine!, from: smaller, to: choices };
                for (const values of [TS_FIXTURE_VALUES, AWKWARD_VALUES]) {
                    const valuesWithEngine = { ...values, engine };
                    const name = `${smaller.addons.join(' + ') || 'plain'} → ${label}, ${values.gameName}`;

                    test(`${name}: adding`, () => {
                        const from = generatedProject(valuesWithEngine, smaller);
                        const changed = plan(from, addRequest(pair));
                        assert.strictEqual(changed.conflicts, 0);
                        assertSameProject(withPlan(from, changed), generatedProject(valuesWithEngine, choices), name);
                    });

                    test(`${name}: removing`, () => {
                        const to = generatedProject(valuesWithEngine, choices);
                        const changed = plan(to, removeRequest(pair));
                        assert.strictEqual(changed.conflicts, 0);
                        assertSameProject(withPlan(to, changed), generatedProject(valuesWithEngine, smaller), name);
                    });

                    test(`${name}: adding to a project that doesn't record its engine records it`, () => {
                        const from = generatedProject(values, smaller);
                        assertSameProject(withPlan(from, plan(from, addRequest(pair))), generatedProject(valuesWithEngine, choices), name);
                    });
                }
            }
        }
    });

    suite('the author\'s edits stay', () => {
        for (const { label, result, expected } of editedProjects()) {
            test(label, () => assertSameProject(result, expected, label));
        }
    });

    suite('clashes', () => {
        const melonLoader = CHANGE_PAIRS.find(pair => pair.to.addons.join() === 'melonloader')!;
        const values = { ...TS_FIXTURE_VALUES, engine: 'unity' };
        const plainProject = () => generatedProject(values, { addons: [], options: {} });

        test('a changed MOD_FILES is marked where a mod loader removes it, and the rest is applied', () => {
            const files = plainProject();
            files.set('src/common/constants.ts', String(files.get('src/common/constants.ts')).replace('extensions: [\'.pak\'],', 'extensions: [\'.pak\', \'.lua\'],'));
            const changed = plan(files, addRequest(melonLoader));
            assert.strictEqual(changed.conflicts, 1);
            const constants = changed.updates.find(update => update.path === 'src/common/constants.ts');
            assert.ok(constants?.content.includes(`<<<<<<< ${YOUR_PROJECT}\n`));
            assert.ok(constants?.content.includes('\'.lua\''));
            assert.ok(constants?.content.includes('>>>>>>> With MelonLoader\n'));
            assert.ok(constants?.content.includes('modsPath: \'.\','));
            assert.ok(changed.deletes.includes('src/installers/mods.ts'));
            assert.ok(changed.updates.some(update => update.path === 'src/index.ts' && update.conflicts === 0 && update.content.includes('registerMelonLoader(context);')));
        });

        test('a changed file that should go is marked instead of deleted', () => {
            const files = plainProject();
            files.set('src/installers/mods.ts', `${String(files.get('src/installers/mods.ts'))}// mine\n`);
            const changed = plan(files, addRequest(melonLoader));
            assert.ok(!changed.deletes.includes('src/installers/mods.ts'));
            const mods = changed.updates.find(update => update.path === 'src/installers/mods.ts');
            assert.ok(mods?.content.startsWith(`<<<<<<< ${YOUR_PROJECT}\n`) && mods.content.endsWith('=======\n>>>>>>> With MelonLoader\n'));
        });

        test('a file the author\'s code still imports is kept as a conflict, with who imports it', () => {
            const files = plainProject();
            files.set('src/extra.ts', 'import { installMods } from \'./installers/mods\';\n\nexport const extra = installMods;\n');
            const changed = plan(files, addRequest(melonLoader));
            assert.ok(!changed.deletes.includes('src/installers/mods.ts'));
            assert.deepStrictEqual(changed.stillImported, { 'src/installers/mods.ts': ['src/extra.ts'] });
        });

        test('a changed hook module a glue add-on takes over is marked', () => {
            const pair = CHANGE_PAIRS.find(candidate => candidate.to.addons.includes('bepinex'))!;
            const files = generatedProject(values, pair.from);
            files.set('src/melonloader/register.ts', `${String(files.get('src/melonloader/register.ts'))}// mine\n`);
            const changed = plan(files, addRequest(pair));
            assert.ok(changed.deletes.includes('src/melonloader/setup.ts'));
            assert.ok(changed.updates.some(update => update.path === 'src/melonloader/register.ts' && update.conflicts === 1));
        });

        test('a file that is already there with other content is marked, an identical one is left alone', () => {
            const pair = CHANGE_PAIRS.find(candidate => candidate.to.addons.includes('everything'))!;
            const godot = { ...TS_FIXTURE_VALUES, engine: 'godot' };
            const files = generatedProject(godot, pair.from);
            files.set('src/everything/flavour.ts', 'export const FLAVOUR = \'mine\';\n');
            files.set('src/everything/setup.ts', String(generatedProject(godot, pair.to).get('src/everything/setup.ts')));
            const changed = plan(files, addRequest(pair));
            assert.ok(changed.updates.some(update => update.path === 'src/everything/flavour.ts' && update.conflicts === 1));
            assert.ok(!changed.creates.some(output => output.path === 'src/everything/setup.ts'));
            assert.ok(!changed.updates.some(update => update.path === 'src/everything/setup.ts'));
        });

        test('a file the author deleted is left out and named, unless the new files need it', () => {
            const gml = CHANGE_PAIRS.find(candidate => candidate.to.addons.join() === 'gml')!;
            const files = generatedProject({ ...TS_FIXTURE_VALUES, engine: 'godot' }, gml.from);
            files.delete('README.md');
            assert.deepStrictEqual(plan(files, addRequest(gml)).skipped, ['README.md']);
            files.delete('src/archive/inspection.ts');
            assert.match(refusal(files, addRequest(gml)), /Godot Mod Loader needs src\/archive\/inspection\.ts, which the project doesn't have/);
        });

        test('planning again after a change finds nothing to do', () => {
            const files = plainProject();
            const result = withPlan(files, plan(files, addRequest(melonLoader)));
            const again = plan(result, { kind: 'add', addons: [], options: {} });
            assert.deepStrictEqual([again.creates, again.updates, again.deletes], [[], [], []]);
            assert.strictEqual(applyAddonChange(String(result.get('package.json')), again.manifest), result.get('package.json'));
        });
    });

    suite('refusals', () => {
        const unity = { ...TS_FIXTURE_VALUES, engine: 'unity' };

        test('a project whose GAME misses a member the new files use', () => {
            const files = generatedProject(unity, { addons: [], options: {} });
            files.set('src/common/constants.ts', String(files.get('src/common/constants.ts')).replace('exePath:', 'exe:'));
            assert.match(refusal(files, { kind: 'add', addons: ['melonloader'], options: {} }), /GAME in src\/common\/constants\.ts has no exePath, which MelonLoader uses/);
        });

        test('a recorded add-on this version doesn\'t know', () => {
            const files = generatedProject(unity, { addons: ['melonloader'], options: {} });
            const manifest = JSON.parse(String(files.get('package.json')));
            files.set('package.json', JSON.stringify({ ...manifest, vortex: { ...manifest.vortex, addons: { ...manifest.vortex.addons, futureLoader: '1.0.0' } } }, null, 4));
            assert.match(refusal(files, { kind: 'add', addons: ['bepinex'], options: {} }), /futureLoader, which this version doesn't know/);
        });

        test('a recorded version the change involves, but not one it doesn\'t', () => {
            const recorded = (files: ProjectFiles, id: string, version: string) => {
                const manifest = JSON.parse(String(files.get('package.json')));
                files.set('package.json', JSON.stringify({ ...manifest, vortex: { ...manifest.vortex, addons: { ...manifest.vortex.addons, [id]: version } } }, null, 4));
                return files;
            };
            const melon = recorded(generatedProject(unity, { addons: ['melonloader'], options: {} }), 'loaderPackages', '0.9.0');
            assert.match(refusal(melon, { kind: 'add', addons: ['bepinex'], options: {} }), /Loader packages 0\.9\.0, which this version of the helper has as 1\.0\.0/);
            const godot = recorded(generatedProject({ ...TS_FIXTURE_VALUES, engine: 'godot' }, { addons: ['everything'], options: {} }), 'everything', '0.9.0');
            assert.ok(planAddonChange(existingProject(godot), { kind: 'add', addons: ['gml'], options: {} }, TEST_CATALOGUE).ok);
        });

        test('an add-on another of the project\'s add-ons needs', () => {
            const addon = (manifest: Partial<AddonManifest> & Pick<AddonManifest, 'id'>): Addon => ({ manifest: { version: '1.0.0', name: `Add-on ${manifest.id}`, description: 'For tests', category: 'testing', engines: ['unity'], ...manifest }, files: [], hash: '' });
            const catalogue: Catalogue = { ...TEST_CATALOGUE, addons: [...TEST_CATALOGUE.addons, addon({ id: 'base' }), addon({ id: 'user', dependsOn: ['base'] })] };
            const files = generatedProject(unity, { addons: ['user'], options: {} }, catalogue);
            assert.match(refusal(files, { kind: 'remove', addons: ['base'] }, catalogue), /Add-on base can't be removed, because Add-on user needs it/);
        });

        test('a hidden add-on, one for another engine, and one the project has', () => {
            const files = generatedProject(unity, { addons: ['melonloader'], options: {} });
            assert.match(refusal(files, { kind: 'add', addons: ['loaders'], options: {} }), /can't be added by itself/);
            assert.match(refusal(files, { kind: 'add', addons: ['gml'], options: {} }), /isn't offered for Unity/);
            assert.match(refusal(files, { kind: 'add', addons: ['melonloader'], options: {} }), /has MelonLoader already/);
            assert.match(refusal(files, { kind: 'remove', addons: ['loaderPackages'] }), /came with other add-ons/);
        });
    });
});
