export namespace ConfigJson {
    export const JS = JSON.stringify(
        {
            compilerOptions: {
                module: "commonjs",
                target: "ES2022",
                checkJs: true,
            },
            include: ["**/*.js"],
        }, null, 2);

    export const TS = JSON.stringify(
        {
            compilerOptions: {
                module: "commonjs",
                target: "ES2022",
                strict: true,
                esModuleInterop: true,
                outDir: "dist",
                rootDir: ".",
                declaration: false,
                sourceMap: false,
                skipLibCheck: true,
                types: ["node"],
            },
            include: ["**/*.ts"],
        }, null, 2);
}
