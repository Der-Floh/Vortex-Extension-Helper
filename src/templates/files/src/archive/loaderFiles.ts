import * as path from 'path';
import { contentFiles } from './inspection';

/**
 * Checks a file's extension, ignoring case.
 *
 * @param file - Path of the file.
 * @param extension - Lower-case extension including the dot.
 * @returns True if the file has the extension; otherwise false.
 */
export function hasExtension(file: string, extension: string): boolean {
    return path.extname(file).toLowerCase() === extension;
}

/**
 * Finds the folder a mod loader's own release was packed in, by locating one
 * of the loader's files in an archive.
 *
 * @param files - Files contained in the archive.
 * @param packageFiles - Paths of files in the loader's release, relative to its root.
 * @returns The prefix to strip from the archive's paths (empty or ending with a separator), or undefined if the archive isn't the loader.
 */
export function findPackageRoot(files: string[], packageFiles: string[]): string | undefined {
    for (const file of contentFiles(files)) {
        const normalizedFile = normalizePath(file);
        for (const packageFile of packageFiles) {
            const normalizedPackageFile = normalizePath(packageFile);
            if (normalizedFile === normalizedPackageFile || normalizedFile.endsWith(`/${normalizedPackageFile}`)) {
                return file.slice(0, file.length - packageFile.length);
            }
        }
    }
    return undefined;
}

/**
 * Normalizes a path for comparisons: forward slashes, lower case.
 *
 * @param file - Path to normalize.
 * @returns The normalized path, with the same length as the input.
 */
function normalizePath(file: string): string {
    return file.replace(/\\/g, '/').toLowerCase();
}
