export interface IVortexLibrary {
    name: string;
    source: string;
}

export namespace VortexLibraries {
    export const REQUIRED: IVortexLibrary[] = [
        { name: 'vortex-api', source: 'git+https://github.com/Nexus-Mods/vortex-api.git' },
    ];
    export const COMMON: IVortexLibrary[] = [
        { name: 'winapi-bindings', source: 'git+https://github.com/Nexus-Mods/node-winapi-bindings.git' },
        { name: 'vortex-parse-ini', source: 'git+https://github.com/Nexus-Mods/vortex-parse-ini.git' },
        { name: 'node-7z', source: 'git+https://github.com/Nexus-Mods/node-7z.git' },
        { name: '@nexusmods/nexus-api', source: 'git+https://github.com/Nexus-Mods/node-nexus-api.git' },
        { name: 'turbowalk', source: 'git+https://github.com/Nexus-Mods/node-turbowalk.git' },
    ];
    export const ADDITIONAL: IVortexLibrary[] = [
        { name: 'ba2tk', source: 'git+https://github.com/Nexus-Mods/node-ba2tk.git' },
        { name: 'bsatk', source: 'git+https://github.com/Nexus-Mods/node-bsatk.git' },
        { name: 'crash-dump', source: 'git+https://github.com/Nexus-Mods/node-crash-dump.git' },
        { name: 'esptk', source: 'git+https://github.com/Nexus-Mods/node-esptk.git' },
        { name: 'exe-version', source: 'git+https://github.com/Nexus-Mods/node-exe-version.git' },
        { name: 'gamebryo-savegame', source: 'git+https://github.com/Nexus-Mods/node-gamebryo-savegames.git' },
        { name: 'icon-extract', source: 'git+https://github.com/Nexus-Mods/node-icon-extract.git' },
        { name: 'loot', source: 'git+https://github.com/Nexus-Mods/node-loot.git' },
        { name: 'native-errors', source: 'git+https://github.com/Nexus-Mods/node-native-errors.git' },
        { name: 'permissions', source: 'git+https://github.com/Nexus-Mods/node-permissions.git' },
        { name: 'vortexmt', source: 'git+https://github.com/Nexus-Mods/node-vortexmt.git' },
        { name: 'wholocks', source: 'git+https://github.com/Nexus-Mods/node-wholocks.git' },
        { name: 'bsdiff-node', source: 'git+https://github.com/Nexus-Mods/bsdiff-node.git' },
    ];

    export const UNOFFICIAL: IVortexLibrary[] = [
        { name: 'vortex-ext-common', source: 'vortex-ext-common' },
    ];

    export const ALL: IVortexLibrary[] = [
        ...REQUIRED,
        ...COMMON,
        ...ADDITIONAL,
        ...UNOFFICIAL
    ];
}
