import * as path from 'path';
import { contentFiles } from '../archive/inspection';
import { MOD_LAYOUT } from './constants';

const MOD_CONTENT_DIRS = new Set([MOD_LAYOUT.unpackedDir, MOD_LAYOUT.godotDir, MOD_LAYOUT.addonsDir]);

/** A Godot Mod Loader mod folder in an archive: `<prefix><unpackedDir>/<id>/`. */
export interface ModRoot {
    /** Path inside the archive up to the `mods-unpacked` folder; empty or ending with a separator. */
    prefix: string;
    /** Name of the `mods-unpacked` folder as the archive spells it. */
    unpackedDir: string;
    /** The mod's id, which is also its folder name: `<namespace>-<name>`. */
    id: string;
}

/**
 * Finds the Godot Mod Loader mods in an archive: `mods-unpacked/<id>/` folders
 * with `mod_main.gd` and `manifest.json`, below any number of wrapper folders.
 * File names are matched exactly, as Godot Mod Loader does.
 *
 * @param files - Relative paths inside the archive; directories end with a path separator.
 * @returns One root per mod id, in archive order.
 */
export function findModRoots(files: string[]): ModRoot[] {
    const content = contentFiles(files);
    const contentSet = new Set(content.map(toPosix));
    const roots = new Map<string, ModRoot>();
    for (const file of content) {
        const root = modRootOfMainFile(file);
        if (root !== undefined && !roots.has(root.id) && contentSet.has(toPosix(manifestPath(root)))) {
            roots.set(root.id, root);
        }
    }
    return [...roots.values()];
}

/**
 * Finds the mod zips in an archive, ignoring zips inside mod folders, `.godot`
 * or `addons`, which are mod data rather than mods.
 *
 * @param files - Relative paths inside the archive; directories end with a path separator.
 * @returns The paths of the mod zips.
 */
export function findModZips(files: string[]): string[] {
    return contentFiles(files).filter(file =>
        path.extname(file).toLowerCase() === MOD_LAYOUT.zipExtension
        && !segments(file).slice(0, -1).some(segment => MOD_CONTENT_DIRS.has(segment.toLowerCase())));
}

/**
 * Checks whether an archive contains Godot Mod Loader itself.
 *
 * @param files - Relative paths inside the archive; directories end with a path separator.
 * @returns True if the archive contains `addons/mod_loader/mod_loader.gd`.
 */
export function isLoaderArchive(files: string[]): boolean {
    const loaderFile = toPosix(MOD_LAYOUT.loaderFile).toLowerCase();
    return contentFiles(files).some(file => {
        const posixFile = toPosix(file).toLowerCase();
        return posixFile === loaderFile || posixFile.endsWith(`/${loaderFile}`);
    });
}

/**
 * Checks whether an archive has a `.godot` folder (imported assets) next to a
 * mod root's `mods-unpacked` folder.
 *
 * @param files - Relative paths inside the archive; directories end with a path separator.
 * @param prefix - The mod root's prefix.
 * @returns True if the folder exists and has files.
 */
export function hasGodotDataDir(files: string[], prefix: string): boolean {
    const godotDir = `${toPosix(path.join(prefix, MOD_LAYOUT.godotDir))}/`;
    return contentFiles(files).some(file => toPosix(file).startsWith(godotDir));
}

/**
 * Reads the mod root from the path of a `mod_main.gd` file.
 *
 * @param file - Path inside the archive.
 * @returns The mod root, or undefined if the file isn't `mods-unpacked/<id>/mod_main.gd`.
 */
function modRootOfMainFile(file: string): ModRoot | undefined {
    const parts = segments(file);
    if (parts.length < 3 || parts[parts.length - 1] !== MOD_LAYOUT.mainFile) {
        return undefined;
    }
    const unpackedDir = parts[parts.length - 3];
    if (unpackedDir.toLowerCase() !== MOD_LAYOUT.unpackedDir) {
        return undefined;
    }
    const prefixParts = parts.slice(0, -3);
    return {
        prefix: prefixParts.length > 0 ? path.join(...prefixParts) + path.sep : '',
        unpackedDir,
        id: parts[parts.length - 2],
    };
}

/**
 * Builds the path of a mod root's `manifest.json`.
 *
 * @param root - The mod root.
 * @returns The path inside the archive.
 */
function manifestPath(root: ModRoot): string {
    return path.join(root.prefix, root.unpackedDir, root.id, MOD_LAYOUT.manifestFile);
}

/**
 * Splits a path inside an archive into its segments.
 *
 * @param file - Path with either separator.
 * @returns The non-empty segments.
 */
function segments(file: string): string[] {
    return file.split(/[\\/]/).filter(segment => segment.length > 0);
}

/**
 * Normalizes a path to forward slashes for comparisons.
 *
 * @param file - Path with either separator.
 * @returns The path with forward slashes.
 */
function toPosix(file: string): string {
    return file.replace(/\\/g, '/');
}
