export namespace SettingsJson {
    export const JS = JSON.stringify(
        {
            "files.exclude": {
                "node_modules": true,
            },
            "search.exclude": {
                "dist": true,
                "node_modules": true,
            },
        }, null, 2);

    export const TS = JSON.stringify(
        {
            "files.exclude": {
                ".pack": true,
                "node_modules": true,
            },
            "search.exclude": {
                ".pack": true,
                "dist": true,
                "node_modules": true,
            },
            "typescript.tsc.autoDetect": "off"
        }, null, 2);
}