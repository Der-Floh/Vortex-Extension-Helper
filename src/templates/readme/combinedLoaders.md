## Mod loaders

{{gameName}} mods need [MelonLoader](https://melonwiki.xyz) or [BepInEx](https://docs.bepinex.dev), and one of them is enough. Vortex shows a notification with links to both while neither is installed, and warns if both are, because they can conflict. Either loader's download can be dropped on Vortex's Mods page to install it.

### Which loader a mod goes to

1. A file named `_melonloader` or `_bepinex` anywhere in the archive decides. Mod authors can add one, and it is never deployed.
2. Otherwise a path in the archive that mentions one of the loaders decides.
3. Otherwise the mod goes to the loader that is installed, and to MelonLoader if that doesn't settle it.

