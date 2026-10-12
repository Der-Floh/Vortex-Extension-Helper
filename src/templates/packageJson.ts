import { DISPLAY_NAME_PREFIX, GAMEART_PATH, PROJECT_VERSION, VORTEX_API_SOURCE } from '../constants';
import type { ProjectLanguage, ProjectValues } from '../types/project';
import { packageNameFor } from '../utils/naming';

/** Versions are bumped by hand: Dependabot can't see them. `@types/bluebird` must equal vortex-api's peer. */
const DEV_DEPENDENCIES: Readonly<Record<ProjectLanguage, Readonly<Record<string, string>>>> = {
    typescript: {
        '@rollup/plugin-typescript': '^12.3.0',
        '@types/bluebird': '3.5.20',
        '@types/node': '^26.6.5',
        'fflate': '^0.8.3',
        'rollup': '^4.64.5',
        'tslib': '^2.8.1',
        'typescript': '^6.0.3',
        'vortex-api': VORTEX_API_SOURCE,
    },
    javascript: {
        '@types/bluebird': '3.5.20',
        '@types/node': '^26.6.5',
        'fflate': '^0.8.3',
        'rollup': '^4.64.5',
        'vortex-api': VORTEX_API_SOURCE,
    },
};

const BUILD_SCRIPTS = {
    clean: 'node -e "require(\'fs\').rmSync(\'.pack\', { recursive: true, force: true })"',
    prebuild: 'npm run clean',
    build: 'rollup -c rollup.config.mjs && node .vscode/build/populate-pack.mjs',
    watch: 'rollup -c rollup.config.mjs --watch',
};

const INSTALL_SCRIPTS = {
    'install-deps': 'npm install --ignore-scripts',
    'install-vortex-api': `npm install --ignore-scripts --save-dev ${VORTEX_API_SOURCE}`,
};

const SCRIPTS: Readonly<Record<ProjectLanguage, Readonly<Record<string, string>>>> = {
    typescript: {
        clean: BUILD_SCRIPTS.clean,
        prebuild: BUILD_SCRIPTS.prebuild,
        typecheck: 'tsc --noEmit -p tsconfig.json',
        build: BUILD_SCRIPTS.build,
        watch: BUILD_SCRIPTS.watch,
        package: 'npm run typecheck && npm run build && node .vscode/build/package-zip.mjs',
        ...INSTALL_SCRIPTS,
    },
    javascript: {
        ...BUILD_SCRIPTS,
        package: 'npm run build && node .vscode/build/package-zip.mjs',
        ...INSTALL_SCRIPTS,
    },
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
        devDependencies: DEV_DEPENDENCIES[values.language],
        scripts: SCRIPTS[values.language],
    };
    return `${JSON.stringify(manifest, null, 4)}\n`;
}
