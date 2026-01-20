import { INpmPackage, NpmPackages } from "../npmPackage";
import { IVortexLibrary, VortexLibraries } from "../vortexLibrary";

export namespace PackageJson {
    const COMMON_VARS = {
        name: "vortex-game-extension",
        version: "0.0.1",
        private: true,
    };

    const LIB_SCRIPTS = {
        "install-current-deps": "npm install --ignore-scripts",
        "install-required-deps": buildNpmInstallLibsCommand(VortexLibraries.REQUIRED),
        "install-common-deps": buildNpmInstallLibsCommand(VortexLibraries.COMMON),
        "install-additional-deps": buildNpmInstallLibsCommand(VortexLibraries.ADDITIONAL),
        "install-unofficial-deps": buildNpmInstallLibsCommand(VortexLibraries.UNOFFICIAL),
        "install-all-deps": buildNpmInstallLibsCommand(VortexLibraries.ALL),
        ...buildNpmInstallCommands(VortexLibraries.ALL)
    };

    export const JS = JSON.stringify(
        {
            ...COMMON_VARS,
            devDependencies: {
                ...buildNpmDependencies(NpmPackages.JS),
                ...buildNpmRequiredDeps(VortexLibraries.REQUIRED)
            },
            scripts: {
                "package": "cross-replace bestzip $npm_package_name-$npm_package_version.zip index.js gameart.jpg info.json",
                ...LIB_SCRIPTS
            },
        }, null, 2);

    export const TS = JSON.stringify(
        {
            ...COMMON_VARS,
            devDependencies: {
                ...buildNpmDependencies(NpmPackages.TS),
                ...buildNpmRequiredDeps(VortexLibraries.REQUIRED)
            },
            scripts: {
                "build": "tsc -p tsconfig.json",
                "package": "npm run build && shx rm -rf .pack && shx mkdir -p .pack && shx cp dist/index.js .pack/index.js && shx cp gameart.jpg info.json .pack/ && cd .pack && cross-replace bestzip ../dist/$npm_package_name-$npm_package_version.zip index.js gameart.jpg info.json",
                ...LIB_SCRIPTS
            },
        }, null, 2);

    function buildNpmRequiredDeps(libs: IVortexLibrary[]) {
        const deps: Record<string, string> = {};
        for (const lib of libs) {
            deps[lib.name] = lib.source;
        }
        return deps;
    }

    function buildNpmInstallCommands(libs: IVortexLibrary[]) {
        const scripts: Record<string, string> = {};
        for (const lib of libs) {
            const scriptKey = `install-${lib.name.replaceAll('/', '-').replaceAll('@', '')}`;
            scripts[scriptKey] = `npm install --ignore-scripts --save-dev ${lib.source}`;
        }

        return scripts;
    }

    function buildNpmInstallLibsCommand(libs: IVortexLibrary[]) {
        let command = 'npm install --ignore-scripts --save-dev';
        for (const lib of libs) {
            command += ` ${lib.source}`;
        }
        return command;
    }

    function buildNpmDependencies(pkgs: INpmPackage[]): Record<string, string> {
        const dependencies: Record<string, string> = {};
        for (const pkg of pkgs) {
            dependencies[pkg.name] = pkg.version;
        }
        return dependencies;
    }
}
