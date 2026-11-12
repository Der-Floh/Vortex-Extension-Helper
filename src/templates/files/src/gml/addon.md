## Getting started

1. Manage {{gameName}} in Vortex.
2. Click "Install" on the "Godot Mod Loader not installed" notification.
3. Install mods by dragging their zips into Vortex or with the "Mod Manager Download" button on Nexus Mods, and enable them.
4. Start the game from Vortex. The first start sets up Godot Mod Loader: confirm its popup, and the game restarts with "(Modded)" in its title.

## Godot Mod Loader

Godot Mod Loader isn't installed as a Vortex mod, so purging your mods never removes the loader the game depends on. It lives in an `addons` folder next to the game's executable. If the executable is in a subfolder of the game's install folder, the loader is installed into both folders, because the game looks for it relative to the folder it was started from.

To repair the loader, use "Reinstall Godot Mod Loader" in the toolbar of the Mods page.

To install it by hand instead, download `ModLoader-Self-Setup_7.0.1-WIN.zip` from its [release page](https://github.com/GodotModding/godot-mod-loader/releases/tag/v7.0.1), copy its `addons` folder next to the game's executable, and click "Check again" on the notification.

## Starting the game

- **From Vortex:** the extension adds `--script addons/mod_loader/mod_loader_setup.gd` to the start, which sets up Godot Mod Loader whenever it's needed (for example after a game update) and does nothing otherwise.
- **From Steam:** open {{gameName}}'s properties in Steam and add this to the launch options: `--script "addons/mod_loader/mod_loader_setup.gd"`. After a game update, open Vortex before starting the game from Steam, or delete `mod-hooks.zip` next to the executable yourself.

## Troubleshooting

- **Mods don't load:** check that the window title says "(Modded)", and look at `%APPDATA%\Godot\app_userdata\{{gameName}}\logs\modloader.log`.
- **The game doesn't start from Steam with the launch option:** Godot Mod Loader is missing from the folder Steam starts the game in. Use "Reinstall Godot Mod Loader".
- **Godot Mod Loader can't set itself up:** some antivirus programs quarantine `addons/mod_loader/vendor/GDRE/gdre_tools.exe`, which the setup needs. Allow it and reinstall Godot Mod Loader.
- **The Godot Mod Loader download fails:** GitHub only allows a limited number of requests per hour without an account. Try again later or install it by hand.
- **"Failed to clear Godot Mod Loader caches":** close the game and deploy again, or delete the files the notification names.

## Removing Godot Mod Loader

1. Purge your mods in Vortex.
2. In Steam, verify the integrity of the game files. This replaces the `.pck` file Godot Mod Loader patched; afterwards you can delete the copy that ends in `-vanilla.pck`.
3. Delete the `addons` folders, the `mods` folder and `mod-hooks.zip`.
4. Remove the Steam launch option if you added it.

## For mod authors

Godot Mod Loader loads mods from zips in the game's `mods` folder. A mod zip holds exactly one mod, in this layout, with `/` as the path separator:

```txt
|--> mods-unpacked
  |--> <namespace>-<name>
    |--> manifest.json
    |--> mod_main.gd
    |--> ...
```

The folder name must match `namespace` and `name` in `manifest.json` (letters, digits and `_`, at least 3 characters each). If the mod has imported assets, put the `.godot` folder next to `mods-unpacked`. Some zip tools, such as `Compress-Archive` in Windows PowerShell 5.1, write `\` as the separator instead, which Godot Mod Loader can't read.

Upload the mod zip as it is. Vortex installs it as `<namespace>-<name>.zip`, so two versions of a mod show up as a file conflict instead of both being loaded.

