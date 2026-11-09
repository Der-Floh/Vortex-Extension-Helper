import { readFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import typescript from '@rollup/plugin-typescript';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

const RUNTIME_PROVIDED_MODULES = ['vortex-api', 'bluebird', ...(pkg.vortex?.externals ?? [])];

// The source maps name their sources `<project folder>:///<path>`, which .vscode/launch.json maps
// back with the built-in ${workspaceFolderBasename}. Derived from the folder rather than written
// down in both places, so renaming anything can't leave the debugger mapping to nothing.
const SOURCE_URL_PREFIX = `${basename(dirname(fileURLToPath(import.meta.url)))}:///`;

const toSourceUrl = (relativeSourcePath) =>
    SOURCE_URL_PREFIX + relativeSourcePath.replace(/\\/g, '/').replace(/^(\.\.\/)+/, '');

export default {
    input: 'src/index.ts',
    output: {
        file: '.pack/index.js',
        format: 'cjs',
        sourcemap: 'inline',
        sourcemapPathTransform: toSourceUrl,
        exports: 'named',
    },
    external: [
        ...RUNTIME_PROVIDED_MODULES,
        ...builtinModules,
        ...builtinModules.map((name) => `node:${name}`),
    ],
    plugins: [
        typescript({
            module: 'esnext',
            sourceMap: true,
            inlineSourceMap: false,
            inlineSources: true,
            noEmitOnError: true,
        }),
    ],
};
