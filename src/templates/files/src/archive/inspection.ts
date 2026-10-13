import * as path from 'path';
import { MOD_FILES } from '../common/constants';

/**
 * Filters the file list Vortex passes to installers down to files.
 *
 * @param files - Relative paths inside the archive; directories end with a path separator.
 * @returns The entries that aren't directories.
 */
export function contentFiles(files: string[]): string[] {
    return files.filter(file => !file.endsWith(path.sep) && !file.endsWith('/'));
}

/**
 * Finds the mod files in an archive by their extension.
 *
 * @param files - Relative paths inside the archive; directories end with a path separator.
 * @returns The files whose extension is listed in `MOD_FILES.extensions`.
 */
export function findModFiles(files: string[]): string[] {
    return contentFiles(files).filter(file => MOD_FILES.extensions.includes(path.extname(file).toLowerCase()));
}
