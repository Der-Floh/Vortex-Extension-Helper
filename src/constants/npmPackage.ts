export interface INpmPackage {
    name: string;
    version: string;
}

export namespace NpmPackages {
    export const COMMON: INpmPackage[] = [
        { name: "@types/bluebird", version: "^3.5.42" },
        { name: "@types/node", version: "^25.0.9" },
        { name: "bestzip", version: "^2.2.1" },
        { name: "cross-replace", version: "^0.2.0" },
    ];

    export const JS: INpmPackage[] = [
        ...COMMON,
    ];

    export const TS: INpmPackage[] = [
        ...COMMON,
        { name: "shx", version: "^0.4.0" },
        { name: "typescript", version: "^5.9.3" },
    ];
}
