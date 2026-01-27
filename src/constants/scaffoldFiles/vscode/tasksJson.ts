export namespace TasksJson {
    export const JS = JSON.stringify(
        {
            version: "2.0.0",
            tasks: [
                {
                    type: "npm",
                    script: "package",
                    problemMatcher: [],
                    label: "package",
                    detail: "npm run package",
                }
            ]
        }, null, 2);

    export const TS = JSON.stringify(
        {
            version: "2.0.0",
            tasks: [
                {
                    type: "npm",
                    script: "watch",
                    problemMatcher: "$tsc-watch",
                    isBackground: true,
                    presentation: {
                        reveal: "never"
                    },
                    runOptions: {
                        runOn: "folderOpen"
                    },
                    group: "build",
                    label: "npm: watch"
                },
                {
                    type: "npm",
                    script: "build",
                    problemMatcher: "$tsc",
                    label: "npm: build",
                    detail: "npm run build",
                    group: {
                        kind: "build",
                        isDefault: true
                    },
                },
                {
                    type: "npm",
                    script: "package",
                    problemMatcher: [],
                    label: "package",
                    detail: "npm run package",
                }
            ]
        }, null, 2);
}