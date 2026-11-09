import * as vscode from 'vscode';
import { PACK_DIR, PACK_ENTRY, PACK_INFO, PACKAGE_JSON_PATH, SOURCE_FOLDER } from '../constants';
import { copyDirectoryContents, emptyDirectory, fileExists, hasIdenticalCopies, latestModification, readTextIfExists } from '../utils/fileSystemUtils';
import { isRecord, parseLenientJson } from '../utils/jsonUtils';

/** vscode.Uri.joinPath resolves `..`, so an id out of info.json has to be checked before it names a folder */
const PACK_ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/i;
const BUILD_INPUTS = [SOURCE_FOLDER, PACKAGE_JSON_PATH];

export type DeploymentState = 'not-built' | 'no-plugins-folder' | 'not-deployed' | 'out-of-date' | 'current';

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
    return hasIdenticalCopies(packUri(folder), vscode.Uri.joinPath(pluginsFolder, id));
}

/** How a project's sources, its build and the copy in Vortex's plugins folder relate to each other */
export async function readDeploymentState(folder: vscode.Uri, pluginsFolder: vscode.Uri | undefined): Promise<DeploymentState> {
    const id = await readPackId(folder).catch(() => undefined);
    const builtAt = await latestModification(packUri(folder, PACK_ENTRY));
    if (id === undefined || builtAt === undefined) {
        return 'not-built';
    }
    if (pluginsFolder === undefined) {
        return 'no-plugins-folder';
    }
    if (!await fileExists(vscode.Uri.joinPath(pluginsFolder, id, PACK_ENTRY))) {
        return 'not-deployed';
    }
    return await changedSinceBuild(folder, builtAt) || !await isDeployedCurrent(folder, pluginsFolder, id) ? 'out-of-date' : 'current';
}

async function changedSinceBuild(folder: vscode.Uri, builtAt: number): Promise<boolean> {
    const times = await Promise.all(BUILD_INPUTS.map(input => latestModification(vscode.Uri.joinPath(folder, input))));
    return times.some(time => time !== undefined && time > builtAt);
}
