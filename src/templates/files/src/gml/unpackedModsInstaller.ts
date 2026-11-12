import * as path from 'path';
import { fs, types } from 'vortex-api';
import { GAME } from '../common/constants';
import { copyInstruction } from '../installers/instructions';
import { findModRoots, hasGodotDataDir, ModRoot } from './archive';
import { MOD_LAYOUT, REPACK } from './constants';
import { zipItems } from './sevenZip';

/**
 * Test function for extracted Godot Mod Loader mods: archives with
 * `mods-unpacked/<id>/` folders holding `mod_main.gd` and `manifest.json`.
 * This is what Vortex sees for a mod zip, since it extracts every archive.
 *
 * @param files - List of files contained in the archive.
 * @param gameId - ID of the game the archive is being installed for.
 * @returns A promise resolving to the support state and required files.
 */
export const testSupportedUnpackedMods: types.TestSupported = async (files, gameId) => ({
    supported: gameId === GAME.id && findModRoots(files).length > 0,
    requiredFiles: [],
});

/**
 * Installer implementation for extracted mods. Godot Mod Loader can't load mod
 * folders in the shipped game, only zips, so each mod is zipped again as
 * `<id>.zip`. The fixed name makes two installed versions of a mod a file
 * conflict in Vortex instead of loading both.
 *
 * @param files - Files contained in the archive.
 * @param destinationPath - Folder Vortex extracted the archive to.
 * @returns A promise resolving to installer instructions.
 */
export const installUnpackedMods: types.InstallFunc = async (files, destinationPath) => {
    const instructions: types.IInstruction[] = [];
    for (const root of findModRoots(files)) {
        instructions.push(await repackModRoot(files, destinationPath, root));
    }
    return { instructions };
};

/**
 * Zips one mod in the layout Godot Mod Loader expects:
 * `mods-unpacked/<id>/...`, plus the archive's `.godot` folder if it has one.
 *
 * @param files - Files contained in the archive.
 * @param destinationPath - Folder Vortex extracted the archive to.
 * @param root - The mod to zip.
 * @returns The instruction that copies the zip into the mods folder.
 */
async function repackModRoot(files: string[], destinationPath: string, root: ModRoot): Promise<types.IInstruction> {
    const items = [await stageModFolder(destinationPath, root)];
    if (hasGodotDataDir(files, root.prefix)) {
        items.push(path.join(destinationPath, root.prefix, MOD_LAYOUT.godotDir));
    }

    const zipName = root.id + MOD_LAYOUT.zipExtension;
    const zipSource = path.join(REPACK.workDir, REPACK.zipsDir, zipName);
    await fs.ensureDirAsync(path.dirname(path.join(destinationPath, zipSource)));
    await zipItems(path.join(destinationPath, zipSource), items);
    return copyInstruction(zipSource, zipName);
}

/**
 * Moves a mod folder into its own `mods-unpacked` folder, so the zip holds
 * this mod only, whatever else the archive contains.
 *
 * @param destinationPath - Folder Vortex extracted the archive to.
 * @param root - The mod to move.
 * @returns The absolute path of the new `mods-unpacked` folder.
 */
async function stageModFolder(destinationPath: string, root: ModRoot): Promise<string> {
    const stagedUnpackedDir = path.join(destinationPath, REPACK.workDir, REPACK.stagingDir, root.id, MOD_LAYOUT.unpackedDir);
    await fs.ensureDirAsync(stagedUnpackedDir);
    await fs.renameAsync(
        path.join(destinationPath, root.prefix, root.unpackedDir, root.id),
        path.join(stagedUnpackedDir, root.id),
    );
    return stagedUnpackedDir;
}
