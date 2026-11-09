import * as vscode from 'vscode';
import { copyDirectoryContents, emptyDirectory, fileExists, readTextIfExists } from './fileSystemUtils';
import { isRecord, parseLenientJson } from './jsonUtils';

export const PACK_DIR = '.pack';
const PACK_INFO = 'info.json';
export const PACK_ENTRY = 'index.js';
/** vscode.Uri.joinPath resolves `..`, so an id out of info.json has to be checked before it names a folder */
const PACK_ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/i;

export class PackMissingError extends Error {
    constructor() {
        super(`No ${PACK_DIR}/${PACK_ENTRY} was built. Run the build and try again.`);
        this.name = 'PackMissingError';
    }
}

export class InvalidPackIdError extends Error {
    constructor(readonly id: unknown) {
        super(`${PACK_DIR}/${PACK_INFO} has "id": ${JSON.stringify(id)}, which is not a usable extension folder name.`);
        this.name = 'InvalidPackIdError';
    }
}

function packUri(folder: vscode.Uri, ...segments: string[]): vscode.Uri {
    return vscode.Uri.joinPath(folder, PACK_DIR, ...segments);
}

/**
 * The id the build wrote, which is both Vortex's folder name for the extension and the
 * source map scheme in its bundle, because populate-pack.mjs and rollup both take it from
 * package.json's name in the same build.
 *
 * @throws PackMissingError, InvalidPackIdError
 */
export async function readPackId(folder: vscode.Uri): Promise<string> {
    const text = await readTextIfExists(packUri(folder, PACK_INFO));
    if (text === undefined) {
        throw new PackMissingError();
    }
    const info = parseLenientJson(text);
    const id = isRecord(info) ? info.id : undefined;
    if (typeof id !== 'string' || !PACK_ID_PATTERN.test(id)) {
        throw new InvalidPackIdError(id);
    }
    return id;
}

/**
 * Copies the build into Vortex's plugins folder.
 *
 * Copies rather than links: Node resolves a junction to its target for `module.filename`, and
 * Vortex keys its `require('vortex-api')` interception on the filename being inside the plugins
 * folder, so a linked extension would silently get the unproxied api.
 *
 * @throws PackMissingError
 * @returns The number of files copied
 */
export async function deployPack(
    folder: vscode.Uri,
    pluginsFolder: vscode.Uri,
    id: string,
    token?: vscode.CancellationToken,
): Promise<number> {
    if (!await fileExists(packUri(folder, PACK_ENTRY))) {
        throw new PackMissingError();
    }
    const target = vscode.Uri.joinPath(pluginsFolder, id);
    await vscode.workspace.fs.createDirectory(target);
    await emptyDirectory(target);
    return copyDirectoryContents(packUri(folder), target, token);
}

/** Whether Vortex already has the build that is in `.pack`, since a stale copy binds breakpoints to the wrong lines */
export async function isDeployedCurrent(folder: vscode.Uri, pluginsFolder: vscode.Uri, id: string): Promise<boolean> {
    const read = async (uri: vscode.Uri): Promise<Uint8Array | undefined> => {
        try {
            return await vscode.workspace.fs.readFile(uri);
        } catch {
            return undefined;
        }
    };
    const [built, deployed] = await Promise.all([
        read(packUri(folder, PACK_ENTRY)),
        read(vscode.Uri.joinPath(pluginsFolder, id, PACK_ENTRY)),
    ]);
    if (built === undefined || deployed === undefined || built.length !== deployed.length) {
        return false;
    }
    return built.every((byte, index) => byte === deployed[index]);
}
