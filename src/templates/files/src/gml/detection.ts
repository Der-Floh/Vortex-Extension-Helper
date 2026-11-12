import * as path from 'path';
import { types } from 'vortex-api';
import { fileExistsSync } from '../common/files';
import { resolveGamePath } from '../detection/discovery';
import { GML } from './constants';

/**
 * Lists the absolute folders Godot Mod Loader is installed into.
 *
 * @param discovery - The game discovery result from Vortex.
 * @returns The install folders.
 */
export function gmlFolders(discovery: types.IDiscoveryResult): string[] {
    return GML.installDirs.map(dir => resolveGamePath(discovery, dir));
}

/**
 * Lists the install folders where Godot Mod Loader is missing or incomplete.
 *
 * @param discovery - The game discovery result from Vortex.
 * @returns The folders that lack any of the detection files.
 */
export function missingGmlFolders(discovery: types.IDiscoveryResult): string[] {
    return gmlFolders(discovery).filter(folder =>
        !GML.detectionFiles.every(file => fileExistsSync(path.join(folder, file))));
}

/**
 * Checks whether Godot Mod Loader is installed in every install folder.
 *
 * @param discovery - The game discovery result from Vortex.
 * @returns True if no install folder is missing a detection file.
 */
export function isGmlInstalled(discovery: types.IDiscoveryResult): boolean {
    return missingGmlFolders(discovery).length === 0;
}
