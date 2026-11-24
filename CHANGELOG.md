# Changelog

All notable changes to Vortex Extension Helper are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the versions follow [Semantic Versioning](https://semver.org/).

## [1.0.0] - 2026-11-24

A rewrite of the whole helper. A new game support extension gets one standard TypeScript layout that installs, builds, packages and can be debugged inside Vortex right away, the checks report problems while you edit, and a sidebar shows the state of every game extension in the window.

### Breaking changes

- Game extensions are now detected through `package.json`, which holds the metadata `.pack/info.json` is generated from: a workspace folder is a game extension when its `package.json` has `vortex-api` in `devDependencies`. Projects with a root `info.json`, the layout earlier versions generated, are no longer recognised; **Vortex: Run Workspace Checks** names them and says which fields to move into `package.json`.
- JavaScript is no longer supported: the wizard creates TypeScript projects without asking for a language, and the JavaScript snippets are gone.

### Added

- **Sidebar**: the Vortex icon in the activity bar shows whether each game extension's dependencies are installed, what the Problems panel lists for it, whether its Nexus Mods id matches the game, whether Vortex has its current build and whether Vortex is running. It puts debugging, building, packaging, deploying, attaching, Vortex libraries, add-ons and snippets one click away.
- **Add-ons**: after the executable, the wizard asks for the game's engine and offers the add-ons for it: Godot Mod Loader for Godot, MelonLoader and BepInEx for Unity. With both Unity loaders, each mod is routed to the right one.
- **Vortex: Add Add-ons** and **Vortex: Remove Add-on** change the add-ons of an extension you have already worked on. Each file is merged the way git merges a branch, so your own changes stay; where they collide with the add-on's, conflict markers show both sides, and if writing or npm fails, every file is put back as it was.
- **Vortex: Debug in Vortex** builds the extension, deploys it, starts Vortex with its DevTools port open and attaches the debugger, so breakpoints in your TypeScript hit while the code runs inside Vortex. In a generated extension, F5 does the same.
- **Vortex: Build**, **Vortex: Package Zip** and **Vortex: Deploy to Vortex** build the extension, write its release zip to `dist/` and copy the build into Vortex's plugins folder.
- **Vortex: Open Plugins Folder** and **Vortex: Open Vortex Log**.
- **Vortex: Add Vortex Library** installs a library Vortex provides at runtime, such as `winapi-bindings`, and lists it in `vortex.externals`, so rollup leaves its import to Vortex. The sidebar can remove one again.
- The wizard also asks for a short name, the game's numerical Nexus Mods id, its Steam app id and executable, and the author.
- Settings: `vortexHelper.author`, `vortexHelper.askSteamAppId`, `vortexHelper.askExecutable`, `vortexHelper.vortexExecutable`, `vortexHelper.vortexPluginsFolder` and `vortexHelper.debugPort`.
- Snippets: `tqueryArgs`, `tfatalErrorInstruction`, `tdeployEvents`, `tdeploymentHandler`, `tregisterStartHook` and `tregisterAction`.
- Restricted Mode: detection, checks and snippets also work in a workspace you haven't trusted. The commands that run npm or hand the code to Vortex need trust, and the install after the wizard waits for it.

### Changed

- New extensions follow one standard layout: the metadata and the game art path live in `package.json`, rollup bundles `src/` straight into `.pack/`, and Node-only build scripts generate `.pack/info.json` and zip the release into `dist/`. The code is split into modules under `src/`, the game art sits in `assets/`, and the folder is named `<short name>-support`.
- The checks are rewritten for that layout and report while you edit: missing `package.json` fields, a game art that isn't a `.jpg` or doesn't exist, missing generated files, an `@types/bluebird` that npm refuses, TypeScript 7, a `vortex-api` that doesn't come from GitHub, lockfiles that break CI, Vortex libraries missing from `vortex.externals` and the wizard's placeholders.
- **Vortex: Run Workspace Checks** checks every game extension in the workspace, writes each finding to the log and sums them up in one message.
- **Vortex: Setup Vortex API in Workspace** is now **Vortex: Install Dependencies**, which runs `npm run install-deps`.
- **Vortex: Scaffold Game Extension in Workspace** is now **Vortex: Create Missing Files**. It restores the generated files an extension lacks, its add-ons' files included, and never touches a file that exists.
- Snippets are offered only in the TypeScript files under a game extension's `src` folder. `tcommonConsts` is now `tgameConstants`, `tprepareForModdingSimple` and `tprepareForModdingModManager` are now `tprepareForModding`, `ttestSupportedContent` is now `ttestSupported`, `tmoddingTools` is now `tsupportedTools`, and `tcheckForQMM` is now the general `tnotifyMissingDependency`.
- Every workspace folder is checked on its own, so with several folders open the helper no longer asks at startup which one to use. Commands that work on one extension take the one of the active editor, or ask.
- The helper runs where the workspace is, so it also works in Remote SSH, WSL and Dev Containers windows.
- It activates only in workspaces with a `package.json`, instead of after every start of VS Code.
- VS Code 1.105 is enough; 0.1.1 needed 1.108.
- The download shrinks from 16.7 MB to about 0.2 MB.

### Removed

- The library scripts of generated extensions, such as `install-common-deps`. **Vortex: Add Vortex Library** takes their place and offers only the libraries Vortex 2.8 ships, since a game extension can import nothing else; game-specific ones such as `bsatk`, `esptk` and `loot`, and the unofficial `vortex-ext-common`, are no longer offered.

### Fixed

- New extensions carry the game's numerical Nexus Mods id as `gameId`, which Vortex needs to list an extension.

## [0.1.1] - 2026-01-31

### Changed

- Smaller download: packages the extension doesn't need at runtime are no longer included.

## [0.1.0] - 2026-01-31

### Added

- **Vortex: New Game Support Extension** lets you pick the game from the public Nexus Mods game list, and asks for its title when the list can't be loaded. The setting `vortexHelper.useNexusApi` turns the list off.
- **Vortex: Open Extension Documentation** opens the Nexus Mods guide to creating a game extension.
- New extensions get `.vscode/settings.json` and `.vscode/tasks.json`.
- Node.js and Git are checked before dependencies are installed.

### Changed

- The wizard asks for the folder first, then the language, then the game.

## [0.0.1] - 2026-01-20

First release.

### Added

- **Vortex: New Game Support Extension** creates a JavaScript or TypeScript game support extension with `info.json`, `package.json`, the entry file, its configuration and placeholder game art, and installs its dependencies.
- **Vortex: Setup Vortex API in Workspace** installs a project's dependencies, `vortex-api` among them.
- **Vortex: Scaffold Game Extension in Workspace** adds the required files a project lacks.
- **Vortex: Run Workspace Checks** checks the required files and the fields of `info.json` and `package.json`, and the same checks run when one of them is opened or saved.
- Snippets for the Vortex API patterns of game extensions, in JavaScript and TypeScript.

[1.0.0]: https://github.com/Der-Floh/Vortex-Extension-Helper/compare/v0.1.1...v1.0.0
[0.1.1]: https://github.com/Der-Floh/Vortex-Extension-Helper/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/Der-Floh/Vortex-Extension-Helper/compare/v0.0.1...v0.1.0
[0.0.1]: https://github.com/Der-Floh/Vortex-Extension-Helper/releases/tag/v0.0.1
