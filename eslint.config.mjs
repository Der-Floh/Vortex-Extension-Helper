import typescriptEslint from "typescript-eslint";
import importPlugin from "eslint-plugin-import";

export default [{
    files: ["./src/**/*.ts"],

    ignores: ["dist/**", "out/**", "node_modules/**"],

    plugins: {
        "@typescript-eslint": typescriptEslint.plugin,
        "import": importPlugin,
    },

    languageOptions: {
        parser: typescriptEslint.parser,
        ecmaVersion: 2022,
        sourceType: "module",
    },

    settings: {
        "import/resolver": {
            typescript: {
                project: "./tsconfig.json",
            },
            node: {
                extensions: [".js", ".jsx", ".ts", ".tsx"],
            },
        },
    },

    rules: {
        "@typescript-eslint/naming-convention": ["warn", {
            selector: "import",
            format: ["camelCase", "PascalCase"],
        }],

        curly: "warn",
        eqeqeq: "warn",
        "no-throw-literal": "warn",
        semi: "warn",

        "import/no-cycle": ["error", { maxDepth: 10 }],
        "import/no-unresolved": "error",
    },
}];