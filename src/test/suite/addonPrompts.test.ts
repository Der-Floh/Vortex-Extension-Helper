import * as assert from 'assert';
import type { Addon, AddonManifest, Catalogue } from '../../templates/addons/addon';
import { DISCOVERED_CATALOGUE } from '../../templates/addons/discoveredCatalogue';
import { askAddons, MENU_DONE, type AddonPromptUi, type ChecklistItem, type MenuEntry } from '../../wizard/addonPrompts';
import { applyChecklist, tickedAddons } from '../../wizard/addonSelection';

interface Script {
    readonly engine?: string;
    /** What the menu returns each time it is shown; running out cancels */
    readonly menu?: readonly (string | undefined)[];
    /** What each checklist returns; running out cancels */
    readonly checklists?: readonly (readonly string[] | undefined)[];
    readonly options?: readonly (string | undefined)[];
}

function scripted(script: Script) {
    const asked: string[] = [];
    const told: string[] = [];
    const menus: MenuEntry[][] = [];
    const checklists: ChecklistItem[][] = [];
    const menu = [...script.menu ?? []];
    const lists = [...script.checklists ?? []];
    const options = [...script.options ?? []];
    const ui: AddonPromptUi = {
        pickEngine: async engines => {
            asked.push('engine');
            return engines.find(engine => engine.label === script.engine);
        },
        pickFromMenu: async (_engine, entries) => {
            asked.push('menu');
            menus.push([...entries]);
            return menu.shift();
        },
        pickInChecklist: async (_engine, category, items) => {
            asked.push(`checklist ${category.id}`);
            checklists.push([...items]);
            return lists.shift();
        },
        pickOption: async (_addon, option) => {
            asked.push(`option ${option.title}`);
            return options.shift();
        },
        tell: message => told.push(message),
    };
    return { ui, asked, told, menus, checklists };
}

function syntheticAddon(manifest: Partial<AddonManifest> & Pick<AddonManifest, 'id' | 'category'>): Addon {
    return { manifest: { version: '1.0.0', name: `Add-on ${manifest.id}`, description: 'For tests', engines: ['test'], ...manifest }, files: [], hash: '' };
}

/** Two categories, a dependency across them, a conflict and an option */
const SYNTHETIC: Catalogue = {
    engines: [{ id: 'test', label: 'Test engine', examples: '' }],
    categories: [{ id: 'first', label: 'First', description: 'The first category' }, { id: 'second', label: 'Second', description: 'The second category' }],
    addons: [
        syntheticAddon({ id: 'base', category: 'first' }),
        syntheticAddon({ id: 'rival', category: 'first', conflicts: ['base'] }),
        syntheticAddon({ id: 'user', category: 'second', dependsOn: ['base'] }),
        syntheticAddon({ id: 'asking', category: 'second', options: { flavour: { title: 'Flavour', choices: [{ value: 'sweet', label: 'Sweet' }, { value: 'sour', label: 'Sour' }] } } }),
    ],
};

suite('Engine and add-on questions', () => {
    test('the engines are the agreed ones, in order', () => {
        assert.deepStrictEqual(DISCOVERED_CATALOGUE.engines.map(engine => engine.label), ['Unreal Engine', 'Unity', 'Godot', 'Source', 'GameMaker', 'Frostbite', 'Other']);
    });

    test('cancelling the engine ends the questions', async () => {
        const { ui, asked } = scripted({});
        assert.strictEqual(await askAddons(DISCOVERED_CATALOGUE, ui), undefined);
        assert.deepStrictEqual(asked, ['engine']);
    });

    test('an engine without add-ons asks nothing more and stays plain', async () => {
        const { ui, asked } = scripted({ engine: 'Frostbite' });
        assert.deepStrictEqual(await askAddons(DISCOVERED_CATALOGUE, ui), { addons: [], addonOptions: {} });
        assert.deepStrictEqual(asked, ['engine']);
    });

    test('with a single category its checklist comes without a menu', async () => {
        const { ui, asked, checklists } = scripted({ engine: 'Unity', checklists: [[]] });
        assert.deepStrictEqual(await askAddons(DISCOVERED_CATALOGUE, ui), { addons: [], addonOptions: {} });
        assert.deepStrictEqual(asked, ['engine', 'checklist modLoaders']);
        assert.deepStrictEqual(checklists[0].map(item => item.addon.manifest.id), ['bepinex', 'melonloader']);
    });

    test('cancelling the only checklist ends the questions', async () => {
        const { ui } = scripted({ engine: 'Unity' });
        assert.strictEqual(await askAddons(DISCOVERED_CATALOGUE, ui), undefined);
    });

    test('an add-on without options asks nothing more', async () => {
        const { ui, asked } = scripted({ engine: 'Godot', checklists: [['gml']] });
        assert.deepStrictEqual(await askAddons(DISCOVERED_CATALOGUE, ui), { addons: ['gml'], addonOptions: {} });
        assert.deepStrictEqual(asked, ['engine', 'checklist modLoaders']);
    });

    test('the options of the picked add-ons come last', async () => {
        const { ui, asked } = scripted({ engine: 'Unity', checklists: [['melonloader', 'bepinex']], options: ['unityil2cpp'] });
        assert.deepStrictEqual(await askAddons(DISCOVERED_CATALOGUE, ui), { addons: ['melonloader', 'bepinex'], addonOptions: { unityBuild: 'unityil2cpp' } });
        assert.deepStrictEqual(asked, ['engine', 'checklist modLoaders', 'option BepInEx build']);
    });

    test('cancelling an option ends the questions', async () => {
        const { ui } = scripted({ engine: 'Unity', checklists: [['bepinex']] });
        assert.strictEqual(await askAddons(DISCOVERED_CATALOGUE, ui), undefined);
    });

    suite('the menu', () => {
        test('comes first with Done on top, and Done with nothing picked stays plain', async () => {
            const { ui, asked, menus } = scripted({ engine: 'Test engine', menu: [MENU_DONE] });
            assert.deepStrictEqual(await askAddons(SYNTHETIC, ui), { addons: [], addonOptions: {} });
            assert.deepStrictEqual(asked, ['engine', 'menu']);
            assert.deepStrictEqual(menus[0].map(entry => entry.id), [MENU_DONE, 'first', 'second']);
            assert.match(menus[0][0].description, /No add-ons/);
            assert.deepStrictEqual(menus[0].slice(1).map(entry => entry.description), ['2 add-ons', '2 add-ons']);
        });

        test('Escape in the menu cancels, Escape in a checklist goes back to it', async () => {
            const { ui, asked } = scripted({ engine: 'Test engine', menu: ['first', undefined], checklists: [undefined] });
            assert.strictEqual(await askAddons(SYNTHETIC, ui), undefined);
            assert.deepStrictEqual(asked, ['engine', 'menu', 'checklist first', 'menu']);
        });

        test('a pick ticks what it depends on, and the menu shows both', async () => {
            const { ui, menus, checklists } = scripted({ engine: 'Test engine', menu: ['second', 'first', MENU_DONE], checklists: [['user'], ['base']] });
            assert.deepStrictEqual(await askAddons(SYNTHETIC, ui), { addons: ['user', 'base'], addonOptions: {} });
            assert.deepStrictEqual(checklists[1].map(item => [item.addon.manifest.id, item.ticked]), [['base', true], ['rival', false]]);
            assert.strictEqual(menus[1][0].description, 'Add-on base and Add-on user');
        });

        test('a dependency the user unticks stays ticked, and the user is told why', async () => {
            const { ui, told } = scripted({ engine: 'Test engine', menu: ['second', 'first', MENU_DONE], checklists: [['user'], []] });
            const answers = await askAddons(SYNTHETIC, ui);
            assert.deepStrictEqual(answers?.addons, ['user']);
            assert.deepStrictEqual(told, ['Add-on base stays ticked, because Add-on user needs it.']);
        });

        test('ticking something that conflicts unticks the other, and the user is told', async () => {
            const { ui, told } = scripted({ engine: 'Test engine', menu: ['first', 'first', MENU_DONE], checklists: [['base'], ['base', 'rival']] });
            assert.deepStrictEqual(await askAddons(SYNTHETIC, ui), { addons: ['rival'], addonOptions: {} });
            assert.deepStrictEqual(told, ['Unticked Add-on base, which can\'t be combined with Add-on rival.']);
        });

        test('options are asked after Done', async () => {
            const { ui, asked } = scripted({ engine: 'Test engine', menu: ['second', MENU_DONE], checklists: [['asking']], options: ['sour'] });
            assert.deepStrictEqual(await askAddons(SYNTHETIC, ui), { addons: ['asking'], addonOptions: { flavour: 'sour' } });
            assert.deepStrictEqual(asked, ['engine', 'menu', 'checklist second', 'menu', 'option Flavour']);
        });
    });

    suite('the selection', () => {
        test('a conflict with a pick\'s dependency unticks that pick too', () => {
            const outcome = applyChecklist(['user'], ['base', 'rival'], ['base', 'rival'], SYNTHETIC);
            assert.deepStrictEqual(outcome.picked, ['rival']);
            assert.deepStrictEqual(outcome.removed, [{ id: 'user', by: 'rival' }, { id: 'base', by: 'rival' }]);
        });

        test('hidden dependencies are never shown ticked', () => {
            assert.deepStrictEqual([...tickedAddons(['melonloader'], DISCOVERED_CATALOGUE)], ['melonloader']);
        });
    });
});
