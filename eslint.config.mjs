import typescriptEslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';

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
}];
