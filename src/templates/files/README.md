# {{gameName}} Support for [Vortex](https://www.nexusmods.com/about/vortex/)

## Description

This extension adds support for {{gameName}} to [Vortex Mod Manager](https://www.nexusmods.com/about/vortex/), enabling you to easily automate installation of mods for {{gameName}} without having to worry about where the files are supposed to go, etc.

### Features

- Finds {{gameName}} in your Steam library.
- Installs mods into the game's mods folder.

## How to install

This extension requires Vortex. To install, simply search the game name in Vortex and click "manage". Alternatively, within Vortex, go to the Extensions tab, click "Find More" at the bottom of the tab, search for "{{gameName}}" and then click Install.

You can also manually install it by downloading the archive file from the [Latest Release](../../releases/latest) and dragging it into the "drop zone" labelled "Drop File(s)" in the Extensions tab at the bottom right.

Afterwards, restart Vortex and you can begin installing supported {{gameName}} mods with Vortex.

## How to build

To build the extension from source:

1. **Install prerequisites**
   - Make sure you have **Node.js**, **npm** and **Git** installed. Git is needed because `vortex-api` is installed from GitHub.

2. **Clone this repository** and open its folder in a terminal.

3. **Install dependencies**

   ```bash
   npm run install-deps
   ```

4. **Build the extension**

   ```bash
   npm run build
   ```

   This bundles the TypeScript sources from `src/` into `.pack/index.js`, copies the game art set in `package.json` (`gameart`) as `gameart.jpg`, and generates `info.json` from `package.json`, including the `gameId` Vortex needs to list the extension. `.pack/` is exactly what Vortex loads.

5. **Package the extension (optional)**

   ```bash
   npm run package
   ```

   This type checks and builds the extension, then zips `.pack/` into `dist/{{packageName}}-<version>.zip`, the archive used for releases.

`npm run typecheck` checks the types only. In VS Code, Ctrl+Shift+B runs `npm run build`.

## Development notes

- `GAME.modsDir` and `MOD_FILES.extensions` in `src/common/constants.ts` decide where mods are installed and which files count as mods. Check both for {{gameName}}.
- The extension can only import modules Vortex provides at runtime: `vortex-api`, `bluebird`, Node's built-in modules, and the libraries offered by **Vortex: Add Vortex Library** in [Vortex Extension Helper](https://marketplace.visualstudio.com/items?itemName=der-floh.vortex-extension-helper). Rollup doesn't bundle npm packages, so any other import fails when Vortex loads the extension.
