import type { Addon, Catalogue, CategoryEntry } from '../../templates/addons/addon';
import { DISCOVERED_CATALOGUE } from '../../templates/addons/discoveredCatalogue';

const REGISTER = `import { types } from 'vortex-api';
import { GAME } from '../common/constants';

export function registerEverything(context: types.IExtensionContext): void {
    context.registerInstaller(\`\${GAME.id}-everything\`, 90, async () => ({ supported: false, requiredFiles: [] }), async () => ({ instructions: [] }));
}
`;

const SETUP = `import { types } from 'vortex-api';

export async function prepareEverything(discovery: types.IDiscoveryResult, _api: types.IExtensionApi): Promise<void> {
    if (!discovery.path) {
        throw new Error('The game has no folder.');
    }
}
`;

const GAME = `import { types } from 'vortex-api';
import { FLAVOUR } from './flavour';

export function everythingGameFields(context: types.IExtensionContext): Pick<types.IGame, 'requiresCleanup' | 'getGameVersion'> {
    return {
        requiresCleanup: true,
        getGameVersion: async () => context.api.translate(FLAVOUR),
    };
}
`;

const WORKFLOW = `name: Release {{packageName}}
on: workflow_dispatch
jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - run: echo "\${{ github.ref_name }}"
`;

export const TEST_CATEGORY: CategoryEntry = Object.freeze({ id: 'testing', label: 'Testing', description: 'Add-ons only the tests know' });

/** Uses every hook and field of addon.json, so the generic tests cover each of them before a real add-on does */
export const TEST_ADDON: Addon = Object.freeze({
    manifest: {
        id: 'everything',
        version: '1.0.0',
        name: 'Everything',
        description: 'Uses every field an add-on can have',
        category: TEST_CATEGORY.id,
        engines: ['godot'],
        hooks: {
            register: 'registerEverything',
            setup: 'prepareEverything',
            game: { export: 'everythingGameFields', fields: ['requiresCleanup', 'getGameVersion'] },
        },
        options: {
            flavour: {
                title: 'Flavour',
                choices: [
                    { value: 'plain', label: 'Plain', placeholders: { flavourNote: 'Plain suits {{gameName}}.' } },
                    { value: 'spicy', label: 'Spicy', detail: 'For the brave', placeholders: { flavourNote: 'Spicy suits {{gameName}}.' } },
                ],
            },
        },
        readme: { features: ['Does everything at once.'], notes: ['{{flavourNote}}'] },
        projectFiles: { 'release.yml': '.github/workflows/release.yml' },
        packageJson: { devDependencies: { semver: '^7.6.0' }, scripts: { 'everything:check': 'node -e "process.exit(0)"' } },
        vortexLibraries: ['winapi-bindings'],
        gitignore: ['*.everything'],
    },
    readme: '## Everything\n\nThe {{flavour}} flavour of everything for {{gameName}}.\n',
    files: [
        { path: 'flavour.ts', text: 'export const FLAVOUR = \'{{flavour}}\';\n' },
        { path: 'game.ts', text: GAME },
        { path: 'register.ts', text: REGISTER },
        { path: 'release.yml', text: WORKFLOW },
        { path: 'setup.ts', text: SETUP },
    ],
    hash: '',
});

/** The discovered add-ons plus the test add-on */
export const TEST_CATALOGUE: Catalogue = Object.freeze({
    engines: DISCOVERED_CATALOGUE.engines,
    categories: [...DISCOVERED_CATALOGUE.categories, TEST_CATEGORY],
    addons: [...DISCOVERED_CATALOGUE.addons, TEST_ADDON],
});
