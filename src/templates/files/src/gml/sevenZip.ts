import { util } from 'vortex-api';
import { SEVEN_ZIP } from './constants';

/** What Vortex's bundled node-7z resolves with; it resolves even when 7-Zip fails. */
interface SevenZipResult {
    code: number;
    errors?: string[];
}

/** The parts of Vortex's bundled node-7z (`util.SevenZip`, untyped in vortex-api) this extension uses. */
interface SevenZip {
    add(archivePath: string, files: string[], options?: { raw?: string[] }): PromiseLike<SevenZipResult>;
    extractFull(archivePath: string, destination: string, options?: { ssc?: boolean }): PromiseLike<SevenZipResult>;
}

/**
 * Extracts an archive with its folder structure, overwriting existing files.
 *
 * @param archivePath - Absolute path of the archive.
 * @param destination - Absolute path of the folder to extract into.
 */
export async function extractArchive(archivePath: string, destination: string): Promise<void> {
    const result = await createSevenZip().extractFull(archivePath, destination, { ssc: false });
    assertSucceeded(result, `extract "${archivePath}"`);
}

/**
 * Creates a zip file. 7-Zip stores each item under its own name, so a folder
 * `C:/x/mods-unpacked` ends up as `mods-unpacked/...` in the zip.
 *
 * @param zipPath - Absolute path of the zip file to create.
 * @param items - Absolute paths of the files and folders to put at the zip's root.
 */
export async function zipItems(zipPath: string, items: string[]): Promise<void> {
    const result = await createSevenZip().add(zipPath, items, { raw: SEVEN_ZIP.zipSwitches });
    assertSucceeded(result, `create "${zipPath}"`);
}

/**
 * Creates an instance of Vortex's bundled node-7z.
 *
 * @returns The 7-Zip wrapper.
 */
function createSevenZip(): SevenZip {
    return new util.SevenZip() as SevenZip;
}

/**
 * Throws if 7-Zip reported a failure.
 *
 * @param result - What node-7z resolved with.
 * @param action - Description of what 7-Zip was doing, for the error message.
 */
function assertSucceeded(result: SevenZipResult, action: string): void {
    if (result.code !== SEVEN_ZIP.successCode) {
        throw new Error(`7-Zip failed to ${action} (exit code ${result.code}): ${(result.errors ?? []).join(' ')}`);
    }
}
