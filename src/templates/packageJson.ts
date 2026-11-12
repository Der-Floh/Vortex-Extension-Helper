import { DISPLAY_NAME_PREFIX, GAMEART_PATH, PACKAGE_NAME_SUFFIX, PROJECT_VERSION, VORTEX_API_SOURCE, VORTEX_FIELDS } from '../constants';
import type { AddonRecord, ProjectValues } from '../types/project';
import { compareDependencyNames } from '../utils/jsonUtils';

/** Versions are bumped by hand: Dependabot can't see them. `@types/bluebird` must equal vortex-api's peer. */
export const BASELINE_DEV_DEPENDENCIES: Readonly<Record<string, string>> = Object.freeze({
    '@rollup/plugin-typescript': '^12.3.0',
    '@types/bluebird': '3.5.20',
    '@types/node': '^26.6.5',
    'fflate': '^0.8.3',
    'rollup': '^4.64.5',
    'tslib': '^2.8.1',
    'typescript': '^6.0.3',
    'vortex-api': VORTEX_API_SOURCE,
});

export const BASELINE_SCRIPTS: Readonly<Record<string, string>> = Object.freeze({
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
});

/** What a project's add-ons add to its package.json */
export interface PackageAdditions {
    /** The add-ons for `vortex.addons`; none for a project without add-ons */
    readonly record?: AddonRecord;
    readonly devDependencies: Readonly<Record<string, string>>;
    /** Added after the baseline's scripts */
    readonly scripts: Readonly<Record<string, string>>;
    /** Libraries Vortex provides at runtime, for `vortex.externals` */
    readonly externals: readonly string[];
}

export const NO_ADDITIONS: PackageAdditions = Object.freeze({ devDependencies: {}, scripts: {}, externals: [] });

export function packageNameFor(shortName: string): string {
    return `${shortName}${PACKAGE_NAME_SUFFIX}`;
}

/** Builds the package.json of a new project, in the key order and indentation of coalllc-support */
export function buildPackageJson(values: ProjectValues, additions: PackageAdditions = NO_ADDITIONS): string {
    const vortex = vortexField(additions, values.engine);
    const manifest = {
        name: packageNameFor(values.shortName),
        displayName: `${DISPLAY_NAME_PREFIX}${values.gameName}`,
        version: PROJECT_VERSION,
        description: `Support for ${values.gameName}`,
        author: values.author,
        ...(values.nexusGameId === undefined ? {} : { gameId: values.nexusGameId }),
        gameart: GAMEART_PATH,
        private: true,
        devDependencies: sortedLikeNpm({ ...BASELINE_DEV_DEPENDENCIES, ...additions.devDependencies }),
        scripts: { ...BASELINE_SCRIPTS, ...additions.scripts },
        ...(vortex ? { vortex } : {}),
    };
    return `${JSON.stringify(manifest, null, 4)}\n`;
}

/** In the order npm writes them, so the first install doesn't reorder the file */
function sortedLikeNpm(dependencies: Readonly<Record<string, string>>): Record<string, string> {
    return Object.fromEntries(Object.entries(dependencies).sort(([left], [right]) => compareDependencyNames(left, right)));
}

/** The engine and the add-ons, so add-ons can be offered and restored later, and the libraries rollup leaves to Vortex */
function vortexField({ record, externals }: PackageAdditions, engine: string | undefined): Record<string, unknown> | undefined {
    const values: Readonly<Record<typeof VORTEX_FIELDS[number], unknown>> = {
        engine,
        addons: record?.addons,
        addonOptions: record && Object.keys(record.options).length > 0 ? record.options : undefined,
        externals: externals.length > 0 ? externals : undefined,
    };
    const field = Object.fromEntries(VORTEX_FIELDS.flatMap(name => values[name] === undefined ? [] : [[name, values[name]]]));
    return Object.keys(field).length > 0 ? field : undefined;
}
