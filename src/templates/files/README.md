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

## How to debug

**Close Vortex first**, then press F5 in VS Code. That builds the extension, copies the build into Vortex's plugins folder, starts Vortex with its DevTools port open and attaches the debugger to Vortex's renderer, where a game extension runs. Breakpoints in `src/**/*.ts` then hit, mapped back through the bundle's source map.

Vortex has to be closed beforehand because a released Vortex only opens the debugging port when it is started with it, and a second instance quits instead of opening a window.

What hits and what doesn't:

- **Breakpoints in the callbacks `main()` registers do hit**: `findGame`, `prepareForModding`, `queryModPath`, `executable`, `testSupported` and `install`, as well as event handlers and the body of `context.once`. Trigger them from Vortex: manage the game, install a mod, deploy.
- **Breakpoints in the top level of `src/index.ts` and in `main()` don't hit.** Vortex requires the extension while its window starts, before a debugger can attach. The debugger waits for Vortex's splash screen to close before attaching, so anything that runs while Vortex is still starting is missed rather than paused — a game's `setup` runs then too, if Vortex activates that game on startup. Switch to another game and back, or manage the game again, to run those paths with the debugger attached.
- Pausing freezes Vortex's whole interface, so start the action that should hit the breakpoint before it is reached, not while you are paused.
- Vortex loads extensions once, so a code change needs another F5 rather than just a rebuild.
- Closing Vortex ends the debug session. VS Code's browser debugger keeps an attach session alive indefinitely, waiting for the browser to come back, and while a session is running F5 means "continue" rather than "start" — so a session left over from the last run makes the next F5 appear to do nothing. [Vortex Extension Helper](https://marketplace.visualstudio.com/items?itemName=der-floh.vortex-extension-helper) ends it for you; without it, stop the session with Shift+F5 first.

`npm run deploy` copies the current build into Vortex's plugins folder without debugging, and `npm run debug` is what F5 runs. Three environment variables override where things are: `VORTEX_EXE`, `VORTEX_PLUGINS` and `VORTEX_DEBUG_PORT`.

Vortex can drop the deployed extension again, which the debug session reports rather than attaching to nothing:

- **Removing the extension in Vortex's Extensions page takes effect at its next start.** If the extension is deployed again before that start, Vortex deletes the fresh copy instead of the old one. Starting the debug session once more fixes it, because the removal is then done.
- **Vortex offers to replace an extension it has no source for with a Nexus Mods one of the same name.** Decline that while debugging: it overwrites the deployed build and makes Vortex keep updating it on every launch.
- An id that a Vortex bundled extension already claims is dropped the same way.

The `${workspaceFolderBasename}:///*` key in `.vscode/launch.json` is the source map prefix `rollup.config.mjs` builds from this project's folder name. Both sides derive it from the folder, so there is nothing to keep in step by hand; renaming the project folder changes both at once.

## Development notes

- `GAME.modsPath` and `MOD_FILES.extensions` in `src/common/constants.ts` decide where mods are installed and which files count as mods. Check both for {{gameName}}.
- **If {{gameName}} never shows up in Vortex**, check `GAME.requiredFilePaths` first. Vortex only treats a game as discovered when every required file exists under the folder `findGame` returns, and it reports nothing when one is missing — the game is simply absent from the games list. Stores sometimes install a game into a subfolder of that folder, in which case every path in `GAME` needs the subfolder in front, for example `Game/Game.exe`.
- The extension can only import modules Vortex provides at runtime: `vortex-api`, `bluebird`, Node's built-in modules, and the libraries offered by **Vortex: Add Vortex Library** in [Vortex Extension Helper](https://marketplace.visualstudio.com/items?itemName=der-floh.vortex-extension-helper). Rollup doesn't bundle npm packages, so any other import fails when Vortex loads the extension.
