# <img src="./assets/vortex-icon-x512.png" alt="" height="32"> Vortex Extension Helper

Create, check and extend game support extensions for [Vortex](https://www.nexusmods.com/about/vortex/). Vortex Extension Helper generates a complete, buildable extension for any game on Nexus Mods, watches it for the mistakes that break the build or the release, and offers snippets for the Vortex API patterns game extensions need.

> This is a community-created VS Code extension and is **not an official product of Nexus Mods**.

> **Breaking change in 1.0.0:** extensions are now detected through `package.json`, which holds the metadata `.pack/info.json` is generated from. Projects with a root `info.json` (the layout earlier versions generated) are no longer recognised; **Vortex: Run Workspace Checks** names them and explains what to move.

---

## ✨ Features

- **Sidebar** — shows at a glance whether a game extension's dependencies, problems, Nexus Mods id and deployed build are in order and whether Vortex is running, and puts building, deploying, attaching, libraries and snippets one click away
- **New game support extension** — pick the game from the Nexus Mods game list (or enter it by hand) and get a TypeScript project that installs, builds and packages right away, with add-ons such as Godot Mod Loader, MelonLoader or BepInEx support
- **Add-ons later** — add an add-on to an extension you have already worked on, or take one out, and your own changes stay
- **One standard layout** — metadata and the game art path in `package.json`, rollup bundling straight into `.pack/`, and Node-only build scripts that generate `info.json` and zip the release
- **Live checks** — missing fields, a wrong game art, missing generated files, a mismatched `@types/bluebird`, TypeScript 7 and lockfiles that break CI are reported in the Problems panel while you edit
- **Create Missing Files** — restores generated files you deleted, without touching any file that exists
- **Vortex libraries** — installs the libraries Vortex provides at runtime, such as `winapi-bindings`, and tells rollup to leave their imports to Vortex
- **Real debugging** — one command builds the extension, deploys it to Vortex, starts Vortex with its DevTools port open and attaches, so breakpoints in your TypeScript hit while the code runs inside Vortex
- **Snippets** — `t…` snippets for registering the game, installers, deployment events, start hooks and toolbar actions, offered only in the `src` folder of a game extension
- **Multi-root aware** — every workspace folder is checked on its own, without prompts

---

## 🧰 Usage

### Create an extension

Run **Vortex: New Game Support Extension** from the command palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and answer the questions:

1. The folder to create the extension in
2. The game, from the Nexus Mods list or entered by hand: its name, its Nexus Mods domain and its numerical Nexus Mods id, which can stay empty while the game isn't on Nexus Mods
3. A short name; the extension is created in `<short name>-support`
4. The game's Steam app id and executable (optional, see the settings)
5. The game's engine and the [add-ons](#add-ons) to include
6. The author, unless `vortexHelper.author` is set

The helper writes every file, opens the new folder and runs `npm run install-deps` there. In a folder you haven't trusted yet, the install waits until you trust it. Cancelling any question creates nothing.

A generated extension looks like this:

```text
<short name>-support/
├── .vscode/
│   ├── build/
│   │   ├── deploy-to-vortex.mjs  # copies .pack/ into Vortex's plugins folder
│   │   ├── package-zip.mjs       # zips .pack/ into dist/<name>-<version>.zip
│   │   ├── populate-pack.mjs     # copies the game art, generates .pack/info.json
│   │   ├── start-vortex.mjs      # starts Vortex with its DevTools port, waits for its window
│   │   └── vortex-paths.mjs      # where Vortex is and where it loads extensions from
│   ├── launch.json               # F5 builds, deploys, starts Vortex and attaches
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
├── package.json                  # name, displayName, version, description, author, gameId, gameart
├── README.md
├── rollup.config.mjs             # bundles src/ into .pack/index.js
└── tsconfig.json
```

`npm run build` creates `.pack/`, exactly what Vortex loads, and `npm run package` the release zip in `dist/`.

### Add-ons

After the executable the wizard asks for the game's engine: Unreal Engine, Unity, Godot, Source, GameMaker, Frostbite or Other. It then offers the add-ons for that engine, grouped by category: a menu lists the categories with what is ticked in each, and when all of an engine's add-ons are in one category, its checklist comes right away. With nothing ticked, or for an engine without add-ons, you get the project above, which copies the file types in `MOD_FILES` into a mods folder.

An add-on's code goes into its own folder under `src/`, and `main()` calls it in one line. These come with the extension:

| Add-on                                 | Engine | What the extension does |
| -------------------------------------- | ------ | ----------------------- |
| **Godot Mod Loader** (`src/gml/`)      | Godot  | Downloads the official v7.0.1 release with a SHA-256 check and installs it next to the game's executable, installs mods as the zips the loader reads, adds the loader's setup argument when Vortex starts the game, and clears its caches after a deploy, a purge or a game update. v7.0.1 supports Godot 4.1 to 4.3, and `GML_RELEASE` in `src/gml/constants.ts` holds the version. |
| **MelonLoader** (`src/melonloader/`)   | Unity  | Installs `.dll` mods into `Mods` and `.cfg` files into `UserData`, can install MelonLoader itself as a mod, and warns while it is missing. |
| **BepInEx** (`src/bepinex/`)           | Unity  | Registers the game with Vortex's BepInEx support and installs plugins into `BepInEx/plugins`. The wizard asks for the game's Unity build: for Mono, Vortex downloads BepInEx by itself; for IL2CPP, the extension links the bleeding-edge builds and warns while it is missing. |

A mod loader replaces the plain installer. With MelonLoader and BepInEx both ticked, `src/loaders/` routes each mod to the right loader: a `_melonloader` or `_bepinex` file in the archive decides, then a path that names a loader, then whichever loader is installed, and MelonLoader is the default.

The add-ons and their versions are recorded in `package.json` as `vortex.addons`, so **Vortex: Create Missing Files** restores exactly their files. For a project made with an add-on this version of the helper doesn't have, or has in another version, it restores only the files no add-on changes.

#### Adding and removing them later

**Vortex: Add Add-ons** and **Vortex: Remove Add-on**, or the buttons in the sidebar's Add-ons section, change the add-ons of an extension you have already worked on. A confirmation lists every file that is created, changed or deleted, and npm runs when the dependencies change. Your own changes stay: each file is merged the way git merges a branch, so an added add-on ends up wired in just as if it had been picked in the wizard, next to your imports and registrations. Where you changed exactly the lines the add-on needs to change, such as `MOD_FILES` before adding a mod loader, that spot gets `<<<<<<<` / `>>>>>>>` conflict markers to resolve with VS Code's Accept buttons. A file of the add-on that you changed is never deleted, and if writing or npm fails, every file is put back as it was.

The wizard records the game's engine as `vortex.engine`, which decides the add-ons offered later. For an extension made before that, the helper takes it from its add-ons or asks once.

Anyone can write an add-on: it is a folder with an `addon.json`, which the build finds by itself. [CONTRIBUTING.md](./CONTRIBUTING.md) explains how.

### Sidebar

The Vortex icon in the activity bar opens an overview of the game extensions in the window:

- **The game** — whether its dependencies are installed, what the Problems panel lists for it, whether its Nexus Mods id matches the game, whether Vortex has the current build, and whether Vortex is running with its debug port open; those last two rows offer a button to deploy the build or attach the debugger
- **Actions** — debug, build, package, and open Vortex's plugins folder or log
- **Vortex Libraries** — every library Vortex provides at runtime, to install or remove
- **Add-ons** — the extension's add-ons, to remove, and the others for its engine, to add; those that can't be combined with what it has say why
- **Snippets** — every snippet with its code in the tooltip, to insert at the cursor
- **Help** — the guides for creating and packaging a game extension, the GitHub repository and the issue tracker

A row's buttons appear when you hover over or select it. While a game extension is busy with npm, a build, a deploy or starting a debug session, a second action on it is refused, so two npm runs can't overwrite each other's `package.json`.

While the view is visible and VS Code has focus, it asks the debug port for Vortex's state every second and re-reads the project every 5 seconds. While the view is hidden it does neither. The game's name comes from the public Nexus Mods game list, which is loaded once per session and not at all when `vortexHelper.useNexusApi` is off.

### Commands

| Command                                  | Does                                                                                                     |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| **Vortex: New Game Support Extension**   | Creates a new game support extension                                                                     |
| **Vortex: Install Dependencies**         | Runs `npm run install-deps` in a game extension (needs a trusted workspace)                              |
| **Vortex: Create Missing Files**         | Restores the generated files a game extension lacks; `package.json`, `README.md` and the `constants.ts` files are never recreated |
| **Vortex: Run Workspace Checks**         | Checks every game extension in the workspace and writes the findings to the log                          |
| **Vortex: Open Extension Documentation** | Opens the Nexus Mods guide to creating a game extension                                                  |
| **Vortex: Add Vortex Library**           | Installs a library Vortex provides at runtime and adds it to `vortex.externals` (needs a trusted workspace) |
| **Vortex: Debug in Vortex**              | Builds the extension, deploys it to Vortex, starts Vortex with its DevTools port open and attaches the debugger (needs a trusted workspace) |
| **Vortex: Build**                        | Runs `npm run build` (needs a trusted workspace)                                                         |
| **Vortex: Package Zip**                  | Runs `npm run package`, which writes the release zip to `dist/` (needs a trusted workspace)              |
| **Vortex: Deploy to Vortex**             | Builds the extension and copies it to Vortex's plugins folder (needs a trusted workspace)                |
| **Vortex: Open Plugins Folder**          | Shows Vortex's plugins folder in the file explorer                                                       |
| **Vortex: Open Vortex Log**              | Opens Vortex's log                                                                                       |
| **Vortex: Add Add-ons**                  | Adds add-ons to an existing game extension, keeping your changes (needs a trusted workspace)             |
| **Vortex: Remove Add-on**                | Takes an add-on out of a game extension again, keeping your changes (needs a trusted workspace)          |

A workspace folder is a game extension when its `package.json` has `vortex-api` in `devDependencies`. Commands that work on one extension use the extension of the active editor, or ask when several are open.

### Checks

| Severity    | Reported when                                                                                                                                  |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Error       | `package.json` isn't valid JSON, or lacks `name`, `displayName`, `author`, `version`, `description`, `gameart` or `gameId`                       |
| Error       | The game art isn't a `.jpg` or doesn't exist                                                                                                     |
| Error       | `rollup.config.mjs`, `tsconfig.json`, the entry file `src/index.ts`, or the build script `populate-pack.mjs` or `package-zip.mjs` is missing     |
| Error       | `@types/bluebird` differs from the version the installed `vortex-api` requires; npm refuses to install then                                     |
| Error       | `typescript` is missing from `devDependencies`, or is version 7 or later, which has no compiler API for the rollup plugin                       |
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

The generated `rollup.config.mjs` reads that list, so rollup leaves the import to Vortex instead of warning about it. The sidebar lists the same libraries, and can remove one again.

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
| `vortexHelper.useNexusApi`   | `true`  | Pick the game from the public Nexus Mods game list. When off, or when the list can't be loaded, the wizard asks for the name, the Nexus Mods domain and the numerical id. |
| `vortexHelper.author`        | `""`    | Author written to `package.json` of new extensions. When empty, the wizard asks for it.                                                           |
| `vortexHelper.askSteamAppId` | `true`  | Ask for the game's Steam app id. When off, the placeholder `STEAM_APP_ID` is written, which the checks report.                                    |
| `vortexHelper.askExecutable` | `true`  | Ask for the path of the game's executable, including any subfolder. When off, the placeholder `GAME_EXECUTABLE.exe` is written.                                                        |
| `vortexHelper.vortexExecutable` | `""` | Path to `Vortex.exe` for **Vortex: Debug in Vortex**. When empty, the standard install locations are searched.                                 |
| `vortexHelper.vortexPluginsFolder` | `""` | Folder the extension is deployed to for debugging. When empty, Vortex's own `plugins` folder is used.                                      |
| `vortexHelper.debugPort`     | `9222`  | Port Vortex opens its DevTools protocol on. Generated projects write this default into their `.vscode/launch.json`.                              |

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

Bug reports and feature requests are welcome via [Issues](https://github.com/Der-Floh/Vortex-Extension-Helper/issues). To add an add-on to the wizard, see [CONTRIBUTING.md](./CONTRIBUTING.md).

Also available on [Open VSX](https://open-vsx.org/extension/der-floh/vortex-extension-helper) and [Nexus Mods](https://www.nexusmods.com/site/mods/1669).

---

## 🛠️ Developer Notes

### Project Architecture

| Path               | Purpose                                                                                       |
| ------------------ | --------------------------------------------------------------------------------------------- |
| `src/extension.ts` | Activation: creates the tracker and diagnostics, registers the commands and completions       |
| `src/constants.ts` | The single source for command ids, setting names, project paths and timings                   |
| `src/handlers/`    | One file per command                                                                          |
| `src/project/`     | A game extension open in the workspace: detecting and picking it, its `package.json`, npm     |
| `src/checks/`      | The checks, as a pure function of a project snapshot, and their entries in the Problems panel |
| `src/wizard/`      | New Game Support Extension: its prompts, the Nexus Mods game list, the install after reload; and the flow that adds or removes add-ons later |
| `src/debug/`       | Debug in Vortex: build, deploy, start Vortex and attach                                       |
| `src/snippets/`    | The snippets and the completion provider that offers them                                     |
| `src/sidebar/`     | The Vortex view: its rows, what they read from a project, and the watch on Vortex itself      |
| `src/templates/`   | The generated project: the baseline's files, the add-on folders and their catalogue, the `package.json` builder, the registry and writer, and the planner that merges an add-on change into an existing project |
| `src/utils/`       | Generic helpers that know nothing about Vortex                                                |
| `src/types/`       | Types shared between the folders                                                              |
| `src/test/`        | Mocha unit and integration tests, run inside a VS Code extension host                         |

`eslint.config.mjs` enforces which folder may import which.

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

# Record each add-on's version and content after changing one
npm run lock-addons

# Package the extension as a .vsix
npm run package
```

### CI & Releases

CI runs on every push and pull request through the shared workflows of [Der-Floh/Der-Floh](https://github.com/Der-Floh/Der-Floh/blob/main/.github/CI.md). It runs the unit and integration tests in VS Code and packs a preview VSIX.

To release, bump the version with `npm version x.y.z --no-git-tag-version` and publish a GitHub release `vx.y.z` from a commit whose CI is green. The publish workflow builds and tests the tag, attaches the VSIX to the release and publishes it to the Visual Studio Marketplace and Open VSX. Then it zips the VSIX and adds it to the Nexus Mods page as a new version of its main file, once the repository has the `NEXUSMODS_API_KEY` secret and the `NEXUSMODS_FILE_ID` and `NEXUSMODS_MOD_ID` variables; until then that step is skipped.

---

## 📜 License

Licensed under the [MIT License](./LICENSE).

<br>
<br>

[!["Buy me a Floppy Disk"](https://www.buymeacoffee.com/assets/img/custom_images/orange_img.png)](https://www.buymeacoffee.com/der_floh)
