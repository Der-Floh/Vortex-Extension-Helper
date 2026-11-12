import { DISPLAY_NAME_PREFIX, GAMEART_PATH, PACKAGE_NAME_SUFFIX, PROJECT_VERSION, VORTEX_API_SOURCE } from '../constants';
import type { AddonRecord, ProjectValues } from '../types/project';

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
    deploy: 'node .vscode/build/deploy-to-vortex.mjs',
    debug: 'npm run build && npm run deploy && node .vscode/build/start-vortex.mjs',
    'install-deps': 'npm install --ignore-scripts',
    'install-vortex-api': `npm install --ignore-scripts --save-dev ${VORTEX_API_SOURCE}`,
};

export function packageNameFor(shortName: string): string {
    return `${shortName}${PACKAGE_NAME_SUFFIX}`;
}

/** Builds the package.json of a new project, in the key order and indentation of coalllc-support; `record` lists its add-ons */
export function buildPackageJson(values: ProjectValues, record?: AddonRecord): string {
    const manifest = {
        name: packageNameFor(values.shortName),
        displayName: `${DISPLAY_NAME_PREFIX}${values.gameName}`,
        version: PROJECT_VERSION,
        description: `Support for ${values.gameName}`,
        author: values.author,
        ...(values.nexusGameId === undefined ? {} : { gameId: values.nexusGameId }),
        gameart: GAMEART_PATH,
        private: true,
        devDependencies: DEV_DEPENDENCIES,
        scripts: SCRIPTS,
        ...(record ? { vortex: vortexField(record) } : {}),
    };
    return `${JSON.stringify(manifest, null, 4)}\n`;
}

/** What `vortex` records about the add-ons, so Create Missing Files can restore exactly them */
function vortexField(record: AddonRecord): Record<string, unknown> {
    return Object.keys(record.options).length > 0 ? { addons: record.addons, addonOptions: record.options } : { addons: record.addons };
}
