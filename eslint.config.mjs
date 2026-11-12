import typescriptEslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';

const HANDLERS = { group: ['**/handlers/**'], message: 'Only extension.ts may import a command handler.' };
const NO_VSCODE = { name: 'vscode', message: 'This module has to load without a VS Code host.' };

/** The folders each folder must not import */
const LAYERS = {
    utils: ['templates', 'project', 'checks', 'wizard', 'debug', 'snippets', 'sidebar'],
    templates: ['project', 'checks', 'wizard', 'debug', 'snippets', 'sidebar'],
    project: ['templates', 'checks', 'wizard', 'debug', 'snippets', 'sidebar'],
    checks: ['wizard', 'debug', 'snippets', 'sidebar'],
    wizard: ['checks', 'debug', 'snippets', 'sidebar'],
    debug: ['templates', 'wizard', 'snippets', 'sidebar'],
    snippets: ['templates', 'checks', 'wizard', 'debug', 'sidebar'],
    sidebar: ['templates'],
};

/** Pure logic, and what out/test/runTests.js loads in plain Node */
const HOST_FREE = [
    'src/constants.ts',
    'src/checks/validation.ts',
    'src/project/projectManifest.ts',
    'src/project/vortexLibraries.ts',
    'src/templates/fileSpec.ts',
    'src/templates/loaders/bepinex.ts',
    'src/templates/loaders/combinedLoaders.ts',
    'src/templates/loaders/godotModLoader.ts',
    'src/templates/loaders/loaderProfile.ts',
    'src/templates/loaders/melonLoader.ts',
    'src/templates/loaders/profiles.ts',
    'src/templates/loaders/sharedFiles.ts',
    'src/templates/packageJson.ts',
    'src/templates/registry.ts',
    'src/templates/render.ts',
    'src/templates/slots.ts',
    'src/test/runTests.ts',
    'src/test/fixtures/createFixtureWorkspace.ts',
    'src/utils/commandLabel.ts',
    'src/utils/jsonUtils.ts',
    'src/wizard/engines.ts',
    'src/wizard/naming.ts',
];

const layerBan = folder => (LAYERS[folder] ? [{ group: LAYERS[folder].map(name => `**/${name}/**`), message: `src/${folder} must not depend on this folder.` }] : []);
const restrict = (patterns, paths = []) => ({ 'no-restricted-imports': ['error', { paths, patterns }] });

export default [{
    // The templates are sources of the generated project, not of this extension
    ignores: ['src/templates/files/**'],
}, {
    files: ['**/*.ts'],
    languageOptions: {
        parser: tsParser,
        ecmaVersion: 2022,
        sourceType: 'module',
    },
    plugins: {
        '@typescript-eslint': typescriptEslint,
    },

    rules: {
        '@typescript-eslint/naming-convention': ['warn',
            { selector: 'import', format: ['camelCase', 'PascalCase'] },
            { selector: 'variable', format: ['camelCase', 'UPPER_CASE', 'PascalCase'], leadingUnderscore: 'allow' },
            { selector: 'function', format: ['camelCase', 'PascalCase'] },
            { selector: 'typeLike', format: ['PascalCase'] },
            { selector: 'classProperty', format: ['camelCase'], leadingUnderscore: 'allow' },
        ],

        '@typescript-eslint/no-explicit-any': 'warn',
        'brace-style': ['warn', '1tbs'],
        curly: 'warn',
        eqeqeq: 'warn',
        indent: ['warn', 4, { SwitchCase: 1 }],
        'no-throw-literal': 'warn',
        quotes: ['warn', 'single', { avoidEscape: true }],
        semi: 'warn',
    },
},
// A later block replaces a rule's options instead of merging them, so each block states all of its bans
{ files: ['src/**/*.ts'], ignores: ['src/extension.ts'], rules: restrict([HANDLERS]) },
...Object.keys(LAYERS).map(folder => ({ files: [`src/${folder}/**/*.ts`], rules: restrict([HANDLERS, ...layerBan(folder)]) })),
...HOST_FREE.map(file => ({ files: [file], rules: restrict([HANDLERS, ...layerBan(file.split('/')[1])], [NO_VSCODE]) })),
];
