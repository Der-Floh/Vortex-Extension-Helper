export interface VortexLibrary {
    readonly name: string;
    readonly source: string;
    readonly description: string;
}

/** The libraries in the top-level node_modules of Vortex's app.asar (2.8.0), which game extensions can require at runtime */
export const VORTEX_LIBRARIES: readonly VortexLibrary[] = Object.freeze([
    { name: 'winapi-bindings', source: 'git+https://github.com/Nexus-Mods/node-winapi-bindings.git', description: 'Windows API: registry, file system, processes and known folders' },
    { name: 'vortex-parse-ini', source: 'git+https://github.com/Nexus-Mods/vortex-parse-ini.git', description: 'Reads and writes INI files' },
    { name: 'node-7z', source: 'git+https://github.com/Nexus-Mods/node-7z.git', description: 'Extracts and creates archives with 7-Zip' },
    { name: '@nexusmods/nexus-api', source: 'git+https://github.com/Nexus-Mods/node-nexus-api.git', description: 'Client for the Nexus Mods API' },
    { name: 'turbowalk', source: 'git+https://github.com/Nexus-Mods/node-turbowalk.git', description: 'Walks directory trees quickly' },
    { name: 'exe-version', source: 'git+https://github.com/Nexus-Mods/node-exe-version.git', description: 'Reads the version of an executable' },
    { name: 'icon-extract', source: 'git+https://github.com/Nexus-Mods/node-icon-extract.git', description: 'Extracts the icon of an executable' },
    { name: 'permissions', source: 'git+https://github.com/Nexus-Mods/node-permissions.git', description: 'Reads and changes Windows file permissions' },
    { name: 'wholocks', source: 'git+https://github.com/Nexus-Mods/node-wholocks.git', description: 'Lists the processes that lock a file' },
].map(library => Object.freeze(library)));

export function findVortexLibrary(name: string): VortexLibrary | undefined {
    return VORTEX_LIBRARIES.find(library => library.name === name);
}
