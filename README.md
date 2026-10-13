# <img src="./assets/vortex-icon-x512.png" alt="" height="32"> Vortex Extension Helper

Create, check and extend game support extensions for [Vortex](https://www.nexusmods.com/about/vortex/). Vortex Extension Helper generates a complete, buildable extension for any game on Nexus Mods, watches it for the mistakes that break the build or the release, and offers snippets for the Vortex API patterns game extensions need.

> This is a community-created VS Code extension and is **not an official product of Nexus Mods**.

> **Breaking change in 0.2.0:** extensions are now detected through `package.json`, which holds the metadata `.pack/info.json` is generated from. Projects with a root `info.json` (the layout earlier versions generated) are no longer recognised; **Vortex: Run Workspace Checks** names them and explains what to move.

---

## ✨ Features

- **New game support extension** — pick the game from the Nexus Mods game list (or enter it by hand) and get a TypeScript project that installs, builds and packages right away
- **One standard layout** — metadata and the game art path in `package.json`, rollup bundling straight into `.pack/`, and Node-only build scripts that generate `info.json` and zip the release
- **Live checks** — missing fields, a wrong game art, missing generated files, a mismatched `@types/bluebird`, TypeScript 7 and lockfiles that break CI are reported in the Problems panel while you edit
- **Create Missing Files** — restores generated files you deleted, without touching any file that exists
- **Vortex libraries** — installs the libraries Vortex provides at runtime, such as `winapi-bindings`, and tells rollup to leave their imports to Vortex
- **Snippets** — `t…` snippets for registering the game, installers, deployment events, start hooks and toolbar actions, offered only in the `src` folder of a game extension
- **Multi-root aware** — every workspace folder is checked on its own, without prompts

---

## 🧰 Usage

### Create an extension

Run **Vortex: New Game Support Extension** from the command palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and answer the questions:

1. The folder to create the extension in
2. The game, from the Nexus Mods list or entered by hand (name and Nexus Mods domain)
3. A short name; the extension is created in `<short name>-support`
4. The game's Steam app id and executable (optional, see the settings)
5. The author, unless `vortexHelper.author` is set

The helper writes every file, opens the new folder and runs `npm run install-deps` there. In a folder you haven't trusted yet, the install waits until you trust it. Cancelling any question creates nothing.

A generated extension looks like this:

```text
<short name>-support/
├── .vscode/
│   ├── build/
│   │   ├── package-zip.mjs       # zips .pack/ into dist/<name>-<version>.zip
│   │   └── populate-pack.mjs     # copies the game art, generates .pack/info.json
│   ├── settings.json
│   └── tasks.json                # Ctrl+Shift+B runs npm run build
├── assets/
│   └── gameart.jpg               # placeholder game art, replace it
├── src/
│   ├── archive/inspection.ts
│   ├── common/constants.ts       # the game's ids, paths and file types
│   ├── common/files.ts
│   ├── common/notifications.ts
│   ├── detection/discovery.ts
│   ├── installers/instructions.ts
│   ├── installers/mods.ts
│   ├── setup/prepareForModding.ts
│   └── index.ts
├── .gitignore
├── package.json                  # name, displayName, version, description, author, gameart
├── README.md
├── rollup.config.mjs             # bundles src/ into .pack/index.js
└── tsconfig.json
```

`npm run build` creates `.pack/`, exactly what Vortex loads, and `npm run package` the release zip in `dist/`.

### Commands

| Command                                  | Does                                                                                                     |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| **Vortex: New Game Support Extension**   | Creates a new game support extension                                                                     |
| **Vortex: Install Dependencies**         | Runs `npm run install-deps` in a game extension (needs a trusted workspace)                              |
| **Vortex: Create Missing Files**         | Restores the generated files a game extension lacks; `package.json`, `README.md` and `src/common/constants` are never recreated |
| **Vortex: Run Workspace Checks**         | Checks every game extension in the workspace and writes the findings to the log                          |
| **Vortex: Open Extension Documentation** | Opens the Nexus Mods guide to creating a game extension                                                  |
| **Vortex: Add Vortex Library**           | Installs a library Vortex provides at runtime and adds it to `vortex.externals` (needs a trusted workspace) |

A workspace folder is a game extension when its `package.json` has `vortex-api` in `devDependencies`. Commands that work on one extension use the extension of the active editor, or ask when several are open.

### Checks

| Severity    | Reported when                                                                                                                                  |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Error       | `package.json` isn't valid JSON, or lacks `name`, `displayName`, `author`, `version`, `description` or `gameart`                                 |
| Error       | The game art isn't a `.jpg` or doesn't exist                                                                                                     |
| Error       | `rollup.config.mjs`, a build script, `tsconfig.json` or the entry file `src/index.*` is missing                                                  |
| Error       | `@types/bluebird` differs from the version the installed `vortex-api` requires; npm refuses to install then                                     |
| Error       | A TypeScript extension uses TypeScript 7 or later, which has no compiler API for the rollup plugin                                              |
| Warning     | `displayName` doesn't start with `Game: `, `version` isn't a release version like `1.0.0`, or `vortex-api` doesn't come from GitHub |
| Information | `vortex-api` isn't installed yet, there is no lockfile, the lockfile lacks rollup's Linux binary or has an old version                            |
| Information | A Vortex library is installed but missing from `vortex.externals`, or `src/common/constants` still has the `STEAM_APP_ID` or `GAME_EXECUTABLE.exe` placeholder |

### Vortex libraries

A game extension runs inside Vortex, so it can only import what Vortex provides: `vortex-api`, `bluebird`, Node's built-in modules and the libraries Vortex ships. Rollup doesn't bundle npm packages. **Vortex: Add Vortex Library** offers the libraries of Vortex 2.8: `winapi-bindings`, `vortex-parse-ini`, `node-7z`, `@nexusmods/nexus-api`, `turbowalk`, `exe-version`, `icon-extract`, `permissions` and `wholocks`. It installs the library as a devDependency for its types and lists it in `package.json`:

```json
"vortex": {
    "externals": ["winapi-bindings"]
}
```

The generated `rollup.config.mjs` reads that list, so rollup leaves the import to Vortex instead of warning about it.

### Snippets

Type `t` in a source file of a game extension:

| Snippet                    | Inserts                                                                    |
| -------------------------- | -------------------------------------------------------------------------- |
| `tcommonImports`           | `path` and the `vortex-api` modules most files need                        |
| `tgameConstants`           | The `GAME`, `INSTALLERS` and `NOTIFICATION_IDS` constants                  |
| `tregisterGame`            | `context.registerGame` with `util.toBlue` for the game lookup and setup    |
| `tqueryArgs`               | `queryArgs`, which lets Vortex find the game in Steam by itself             |
| `tfindGameSteam`           | A `findGame` that looks the game up in the Steam library                    |
| `tprepareForModding`       | A setup that makes sure the mods folder is writable                         |
| `tregisterInstaller`       | `context.registerInstaller` for an entry of `INSTALLERS`                    |
| `ttestSupported`           | A test function that accepts the archives of this game                      |
| `tinstallContent`          | An installer that copies files into the mods folder                         |
| `tfatalErrorInstruction`   | An instruction that cancels the installation with a message                 |
| `tdeployEvents`            | Handlers for `did-deploy` and `did-purge`                                   |
| `tdeploymentHandler`       | A deployment handler that only acts on this game's profiles                 |
| `tregisterStartHook`       | A start hook that changes how Vortex starts this game                       |
| `tregisterAction`          | A button in the toolbar of the Mods page                                    |
| `tnotifyMissingDependency` | A notification when a file the mods need is missing                         |
| `tsupportedTools`          | A tool Vortex can start next to the game                                    |

---

## ⚙️ Extension Settings

| Setting                      | Default | Description                                                                                                                                       |
| ---------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vortexHelper.useNexusApi`   | `true`  | Pick the game from the public Nexus Mods game list. When off, or when the list can't be loaded, the wizard asks for the name and the Nexus Mods domain. |
| `vortexHelper.author`        | `""`    | Author written to `package.json` of new extensions. When empty, the wizard asks for it.                                                           |
| `vortexHelper.askSteamAppId` | `true`  | Ask for the game's Steam app id. When off, the placeholder `STEAM_APP_ID` is written, which the checks report.                                    |
| `vortexHelper.askExecutable` | `true`  | Ask for the game's executable. When off, the placeholder `GAME_EXECUTABLE.exe` is written.                                                        |

---

## 🧠 Requirements

- VS Code 1.105 or later
- Node.js and npm, which build the game extensions
- Git, since npm installs `vortex-api` from GitHub
- A trusted workspace for the commands that run npm; detection, checks and snippets also work in Restricted Mode

Vortex Extension Helper runs where your workspace is, so it also works over Remote SSH, WSL and Dev Containers.

---

## 🧩 Repository

GitHub: [Der-Floh/Vortex-Extension-Helper](https://github.com/Der-Floh/Vortex-Extension-Helper)

Bug reports and feature requests are welcome via [Issues](https://github.com/Der-Floh/Vortex-Extension-Helper/issues).

Also available on [Open VSX](https://open-vsx.org/extension/der-floh/vortex-extension-helper) and [Nexus Mods](https://www.nexusmods.com/site/mods/1669).

---

## 🛠️ Developer Notes

### Project Architecture

| Path                                   | Purpose                                                                                     |
| -------------------------------------- | ------------------------------------------------------------------------------------------- |
| `src/extension.ts`                     | Activation: creates the tracker and diagnostics, registers the commands and completions     |
| `src/handlers/`                        | Command handlers                                                                            |
| `src/templates/`                       | The generated project: `.tmpl` files, the `package.json` builder and the file registry       |
| `src/utils/vortexWorkspaceTracker.ts`  | Detects the game extensions among the workspace folders and watches their files             |
| `src/utils/validation.ts`              | The checks, as a pure function of a project snapshot                                        |
| `src/utils/vortexDiagnostics.ts`       | Shows the findings in the Problems panel and keeps them current                            |
| `src/utils/taskUtils.ts`               | Runs npm and the tool checks as VS Code tasks                                               |
| `src/test/`                            | Mocha unit and integration tests, run inside a VS Code extension host                       |

### Build Commands

```bash
# Type-check, lint and bundle the extension with esbuild
npm run compile

# Bundle and type-check in watch mode (default build task)
npm run watch

# Run the unit and integration tests (downloads VS Code on first run)
npm test

# Also install, build and package a generated project (needs network)
VORTEX_HELPER_BUILD_TEST=1 npm test

# Package the extension as a .vsix
npm run package
```

### CI & Releases

CI runs on every push and pull request through the shared workflows of [Der-Floh/Der-Floh](https://github.com/Der-Floh/Der-Floh/blob/main/.github/CI.md). It runs the unit and integration tests in VS Code and packs a preview VSIX.

To release, bump the version with `npm version x.y.z --no-git-tag-version` and publish a GitHub release `vx.y.z` from a commit whose CI is green. The publish workflow builds and tests the tag, attaches the VSIX to the release and publishes it to the Visual Studio Marketplace and Open VSX.

---

## 📜 License

Licensed under the [MIT License](./LICENSE).

<br>
<br>

[!["Buy me a Floppy Disk"](https://www.buymeacoffee.com/assets/img/custom_images/orange_img.png)](https://www.buymeacoffee.com/der_floh)
