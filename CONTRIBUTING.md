# Contributing

Bug reports and feature requests are welcome in the [issue tracker](https://github.com/Der-Floh/Vortex-Extension-Helper/issues). This guide is about the other way to help: **add-ons**, the optional parts the wizard offers when it creates a new game extension. Godot Mod Loader, MelonLoader and BepInEx support are add-ons, and any boilerplate that more than one game extension needs can become one.

An add-on is a folder with an `addon.json`. The build finds every such folder by itself, so adding one takes no other change: once it is merged, the next release of the extension offers it.

---

## 🚀 Quick start

1. Create a folder below [`src/templates/files/src/`](src/templates/files/src/). Its name is the add-on's id: a lower-case letter, then letters and digits.
2. Add an `addon.json` that starts with `"$schema": "../../../catalogue/addon.schema.json"`. VS Code then completes every field and explains it on hover.
3. Put the add-on's code next to it, exactly as it should appear in `src/<id>/` of a generated project.
4. Export the functions the project should call from `register.ts`, `setup.ts` or `game.ts`, and name them in `addon.json`.
5. Optionally add `addon.md`, the section the add-on adds to the generated README.
6. Run `npm run lock-addons`, then `npm run compile` and `npm test`.

The build checks every `addon.json` and fails on a broken one, naming the file and the problem. `npm test` then generates projects with your add-on alone, with every add-on it can be combined with and with each of its options, type-checks all of them against the real `vortex-api` and loads them with a mocked Vortex. You don't write any test code for that.

---

## 🧩 An example

A button on the Mods page that opens the game folder, in a category of its own:

```text
src/templates/files/src/openGameFolder/
├── addon.json
├── addon.md
└── register.ts
```

`addon.json`:

```jsonc
{
    "$schema": "../../../catalogue/addon.schema.json",
    // The folder's name
    "id": "openGameFolder",
    // Raise it whenever a file of the add-on changes, then run npm run lock-addons
    "version": "1.0.0",
    // What the wizard shows
    "name": "Open Game Folder",
    "description": "Adds a button to the Mods page that opens the game folder.",
    // The checklist it is in; see "Categories" below
    "category": "conveniences",
    // No "engines": it is offered for every engine
    "hooks": {
        // main() calls registerOpenGameFolder(context)
        "register": "registerOpenGameFolder"
    },
    "readme": {
        "features": ["Adds an **Open Game Folder** button to the Mods page."]
    }
}
```

The comments are only for this guide: `addon.json` is plain JSON.

`register.ts`, which imports from the generated project as if it were already in `src/openGameFolder/`:

```ts
import { selectors, types, util } from 'vortex-api';
import { GAME } from '../common/constants';

/** Adds a button to the Mods page that opens the game folder */
export function registerOpenGameFolder(context: types.IExtensionContext): void {
    context.registerAction('mod-icons', 300, 'open-ext', {}, 'Open Game Folder', () => {
        const discovery = selectors.discoveryByGame(context.api.getState(), GAME.id);
        if (discovery?.path) {
            util.opn(discovery.path).catch(() => undefined);
        }
    }, () => selectors.activeGameId(context.api.getState()) === GAME.id);
}
```

`addon.md`, appended to the generated README:

```markdown
## Opening the game folder

The **Open Game Folder** button on the Mods page opens where {{gameName}} is installed.
```

A project generated with it gets `src/openGameFolder/register.ts`, an import of it in `src/index.ts` and one line in `main()`:

```ts
registerOpenGameFolder(context);
```

---

## 📋 The fields of `addon.json`

Only `id`, `version`, `name`, `description` and `category` are required.

| Field | Meaning |
| ----- | ------- |
| `id` | The folder's name. It can't be a folder of the baseline project: `archive`, `common`, `detection`, `installers` or `setup` |
| `version` | Like `1.0.0`. Raise it with every change, see [Versions](#-versions) |
| `name`, `description` | What the wizard shows, each on one line |
| `category` | An id from [`catalogue/categories.json`](src/templates/catalogue/categories.json) |
| `engines` | Ids from [`catalogue/engines.json`](src/templates/catalogue/engines.json). Leave it out to offer the add-on for every engine |
| `hidden` | Never shown in the wizard. A hidden add-on only takes part through another add-on's `dependsOn`, or through its own `when` |
| `dependsOn` | Add-ons that come along with this one. The wizard ticks them too |
| `conflicts` | Add-ons that can't be picked together with this one. Add-ons for different engines never meet, so they don't need it |
| `when` | For a hidden add-on: it is included by itself once all of these are picked |
| `supersedes` | Add-ons whose hooks, README texts and mods folder this one takes over when both take part. Their `register.ts`, `setup.ts` and `game.ts` aren't generated then; their other files are |
| `replacesPlainInstaller` | The project leaves out the plain installer, which copies the game's mod files into its mods folder (`MOD_FILES`, `INSTALLERS` and `src/installers/mods.ts`) |
| `modsPath` | `{ "base": "game" \| "executable", "path": "…" }`: where Vortex deploys mods that no mod type sends elsewhere, relative to the game folder or to the folder of the game's executable. At most one add-on of a project may set it |
| `hooks` | The functions the project calls, see [Hooks](#-hooks) |
| `options` | Questions the wizard asks after the add-ons are picked, see [Options](#-options) |
| `readme` | `features` and `notes`: bullets for the generated README's lists of what the extension does and what to check before a release |
| `projectFiles` | Files of the folder that belong elsewhere in the project, such as a GitHub workflow: `{ "release.yml": ".github/workflows/release.yml" }`. Not for TypeScript, and not into `src/` or onto a file the baseline writes |
| `packageJson` | `devDependencies` and `scripts` to add to the generated `package.json`. Names the baseline uses are taken |
| `vortexLibraries` | Libraries Vortex provides at runtime, such as `winapi-bindings`. Each is added to `devDependencies` and to `"vortex": { "externals" }`, so rollup leaves the import to Vortex |
| `gitignore` | Lines appended to the generated `.gitignore`, below the add-on's name |

---

## 🪝 Hooks

Hooks are how an add-on's code is called. Each hook names a function that its module, next to `addon.json`, exports:

| Hook | Module | Called |
| ---- | ------ | ------ |
| `register` | `register.ts` | In `main()`, after `registerGame`: `name(context)` |
| `setup` | `setup.ts` | In `prepareForModding`, after the mods folder is made writable: `await name(discovery, api)` |
| `game` | `game.ts` | Inside `registerGame`, spread after the baseline's fields: `...name(context)` |

The signatures:

```ts
export function registerExample(context: types.IExtensionContext): void
export async function prepareExample(discovery: types.IDiscoveryResult, api: types.IExtensionApi): Promise<void>
export function exampleGameFields(context: types.IExtensionContext): Pick<types.IGame, 'requiresCleanup'>
```

The `game` hook also lists the fields it returns, so the build can check that no two add-ons set the same one:

```json
"hooks": {
    "game": { "export": "exampleGameFields", "fields": ["requiresCleanup"] }
}
```

It can't return a field the baseline sets: `id`, `name`, `mergeMods`, `queryPath`, `supportedTools`, `queryModPath`, `logo`, `executable`, `requiredFiles`, `setup`, `environment` and `details`. Return type `Pick<types.IGame, …>` so the type check catches a misspelt field, and keep the `context` parameter even when you don't need it, since the call passes it.

Vortex also calls `main()` with a stub context while it installs or updates an extension, so `context.api` may only be used inside callbacks, never directly in `register` or `game`. The tests load every add-on that way.

Only the generated `main()` and `prepareForModding` may import a hook module. The rest of the add-on imports its other files, which is what lets a superseding add-on drop the hook modules and keep everything else.

---

## ❓ Options

An option is a question the wizard asks once the add-ons are picked. BepInEx asks for the game's Unity build:

```json
"options": {
    "unityBuild": {
        "title": "BepInEx build",
        "placeholder": "Which kind of Unity build is the game?",
        "choices": [
            { "value": "unitymono", "label": "Mono", "placeholders": { "bepinexInstall": "Vortex downloads and installs it…" } },
            { "value": "unityil2cpp", "label": "IL2CPP", "placeholders": { "bepinexInstall": "Download the newest IL2CPP build…" } }
        ]
    }
}
```

The first choice is the default. A template writes the answer as `{{unityBuild}}`, and a choice's `placeholders` add prose that differs between the choices, such as `{{bepinexInstall}}` in `addon.md`. Option ids and placeholder names are letters only and shared by all add-ons, so pick names no other add-on uses. A hidden add-on can't have options.

---

## 🔤 Placeholders

Any file of the add-on can use `{{name}}` placeholders. These are always there:

| Placeholder | Value |
| ----------- | ----- |
| `{{gameName}}` | The game's name. Only safe in comments and Markdown; in code, read `GAME.name` |
| `{{packageName}}` | The extension's package name, `<short name>-support` |
| `{{gameIdValue}}`, `{{gameNameValue}}` | The Nexus Mods domain and the name, escaped for a string between single quotes |
| `{{steamAppIdValue}}`, `{{exePathValue}}` | The Steam app id and the executable, escaped the same way |
| `{{idPrefix}}` | The short name, for ids such as notification ids |
| `{{debugPort}}` | The port Vortex is debugged on |

Options add their own. A file that only uses `{{gameName}}`, `{{packageName}}`, `{{debugPort}}` and option placeholders can be recreated by **Vortex: Create Missing Files**; one that uses the others holds details of the game, so it can't be. Most add-ons need none at all and read `GAME` from `src/common/constants.ts` instead.

`${{ … }}` and anything with spaces between the braces is left alone, so GitHub workflows work as they are.

---

## 🧱 Hidden and glue add-ons

Two patterns keep add-ons small:

- **A shared helper.** Code that several add-ons need goes into a hidden add-on they all depend on. `loaderPackages` holds what MelonLoader and BepInEx share.
- **A glue add-on.** When two add-ons need to work differently together, a hidden add-on with `when` and `supersedes` for both takes over their hooks once both are picked. `loaders` routes each mod to MelonLoader or BepInEx, and the build insists on such a glue add-on, or a `conflicts`, wherever two add-ons that can meet would both set the mods folder, the same `registerGame` field or the same superseded add-on.

---

## 🗂️ Categories

The wizard asks for the game's engine first. When the add-ons for that engine are all in one category, their checklist comes next; otherwise a menu lists the categories, each with what is ticked in it, and **Done** at the top.

[`catalogue/categories.json`](src/templates/catalogue/categories.json) lists the categories. When none fits, add one with an `id`, a `label` and a one-line `description`, and add its id to the `category` list in [`catalogue/addon.schema.json`](src/templates/catalogue/addon.schema.json), so the editor offers it; a test reminds you. Engines work the same way, in [`catalogue/engines.json`](src/templates/catalogue/engines.json).

---

## 🔢 Versions

Every project records its add-ons and their versions in `package.json`:

```json
"vortex": {
    "addons": { "melonloader": "1.0.0", "loaderPackages": "1.0.0" }
}
```

**Vortex: Create Missing Files** restores an add-on's files only while the extension still has it in that version, so an old project never gets files that don't fit the rest of it. The same goes for adding and removing add-ons later: a change that involves an add-on the project has in another version is refused. That's why an add-on's version has to change with its files. [`catalogue/addons.lock.json`](src/templates/catalogue/addons.lock.json) holds each add-on's version and a hash of its folder, a test fails when the two don't match, and `npm run lock-addons` writes the new hash.

---

## ➕ Added and removed later

Authors can add your add-on to an extension they have already worked on, and take it out again, from the sidebar or with **Vortex: Add Add-ons** and **Vortex: Remove Add-on**. The helper renders the project's files with and without the add-on and merges the difference into the author's files the way git merges a branch, so your add-on needs nothing extra for it. Keep to the hooks, and the helper knows exactly which lines are yours to add and take away.

`npm test` checks this for every add-on too: added to a project generated without it, the result must equal a project generated with it, and removing it must give back the project without it, byte for byte.

---

## ✅ What the build checks

`npm run compile`, `npm run watch` and packaging all fail on a broken add-on and name each problem:

- the id matches the folder, the version is a version, and every category, engine and add-on it names exists;
- `dependsOn` has no cycle, and every hidden add-on can take part;
- every hook's module exists and exports the function, and nothing else imports a hook module;
- option ids and placeholder names are unique;
- the `game` fields, `projectFiles` paths and `packageJson` entries don't clash with the baseline or with an add-on it can be picked with.

`npm test` covers the rest, for every add-on: the exact files, no placeholder left, the record in `package.json`, Create Missing Files restoring what was generated, the type check of every combination and a load with a mocked Vortex.

---

## ⚠️ Known limits

- **Vortex libraries in your code.** This repository doesn't install the libraries Vortex provides, several of which are native Windows modules, so a TypeScript import of one in an add-on doesn't type-check here yet. The generated project installs the library and type-checks it.
- **Upgrades.** A project keeps the version of an add-on it was given. Moving it to a newer version of the add-on isn't possible yet.
