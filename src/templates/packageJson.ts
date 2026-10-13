import { DISPLAY_NAME_PREFIX, GAMEART_PATH, PROJECT_VERSION, VORTEX_API_SOURCE } from '../constants';
import type { ProjectValues } from '../types/project';
import { packageNameFor } from '../utils/naming';

/** Versions are bumped by hand: Dependabot can't see them. `@types/bluebird` must equal vortex-api's peer. */
const DEV_DEPENDENCIES: Readonly<Record<string, string>> = {
    '@rollup/plugin-typescript': '^12.3.0',
    '@types/bluebird': '3.5.20',
    '@types/node': '^26.6.5',
    'fflate': '^0.8.3',
    'rollup': '^4.64.5',
    'tslib': '^2.8.1',
    'typescript': '^6.0.3',
    'vortex-api': VORTEX_API_SOURCE,
};

const SCRIPTS: Readonly<Record<string, string>> = {
    clean: 'node -e "require(\'fs\').rmSync(\'.pack\', { recursive: true, force: true })"',
    prebuild: 'npm run clean',
    typecheck: 'tsc --noEmit -p tsconfig.json',
    build: 'rollup -c rollup.config.mjs && node .vscode/build/populate-pack.mjs',
    watch: 'rollup -c rollup.config.mjs --watch',
    package: 'npm run typecheck && npm run build && node .vscode/build/package-zip.mjs',
    'install-deps': 'npm install --ignore-scripts',
    'install-vortex-api': `npm install --ignore-scripts --save-dev ${VORTEX_API_SOURCE}`,
};

/** Builds the package.json of a new project, in the key order and indentation of coalllc-support */
export function buildPackageJson(values: ProjectValues): string {
    const manifest = {
        name: packageNameFor(values.shortName),
        displayName: `${DISPLAY_NAME_PREFIX}${values.gameName}`,
        version: PROJECT_VERSION,
        description: `Support for ${values.gameName}`,
        author: values.author,
        gameart: GAMEART_PATH,
        private: true,
        devDependencies: DEV_DEPENDENCIES,
        scripts: SCRIPTS,
    };
    return `${JSON.stringify(manifest, null, 4)}\n`;
}
