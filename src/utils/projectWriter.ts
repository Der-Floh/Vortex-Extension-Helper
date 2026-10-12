import * as path from 'path';
import * as vscode from 'vscode';
import type { GeneratedOutput } from '../types/project';
import { errorMessage } from './errors';
import { fileExists, toBytes } from './fileSystemUtils';
import { Logger } from './logger';

export type TargetState = 'missing' | 'empty' | 'occupied';

export class TargetNotEmptyError extends Error {
    constructor(target: vscode.Uri) {
        super(`${target.fsPath} already exists and isn't an empty folder.`);
        this.name = 'TargetNotEmptyError';
    }
}

export async function getTargetState(target: vscode.Uri): Promise<TargetState> {
    let stat: vscode.FileStat;
    try {
        stat = await vscode.workspace.fs.stat(target);
    } catch {
        return 'missing';
    }
    if (!(stat.type & vscode.FileType.Directory)) {
        return 'occupied';
    }
    return (await vscode.workspace.fs.readDirectory(target)).length === 0 ? 'empty' : 'occupied';
}

/**
 * Writes a new project into a missing or empty folder.
 * If a write fails, it removes only what this call created, and never a folder that still has content.
 *
 * @throws TargetNotEmptyError if the target exists and isn't an empty folder.
 */
export async function writeNewProject(target: vscode.Uri, outputs: readonly GeneratedOutput[]): Promise<void> {
    const state = await getTargetState(target);
    if (state === 'occupied') {
        throw new TargetNotEmptyError(target);
    }

    const created: { uri: vscode.Uri; isDirectory: boolean }[] = [];
    const ensuredDirectories = new Set<string>();
    const ensureDirectory = async (uri: vscode.Uri) => {
        if (ensuredDirectories.has(uri.toString())) {
            return;
        }
        if (!await fileExists(uri)) {
            await vscode.workspace.fs.createDirectory(uri);
            created.push({ uri, isDirectory: true });
        }
        ensuredDirectories.add(uri.toString());
    };

    try {
        await ensureDirectory(target);
        for (const output of outputs) {
            const segments = path.posix.dirname(output.path).split('/').filter(segment => segment && segment !== '.');
            for (let depth = 1; depth <= segments.length; depth++) {
                await ensureDirectory(vscode.Uri.joinPath(target, ...segments.slice(0, depth)));
            }
            const file = vscode.Uri.joinPath(target, output.path);
            await vscode.workspace.fs.writeFile(file, toBytes(output.content));
            created.push({ uri: file, isDirectory: false });
        }
    } catch (e) {
        await rollback(created);
        throw e;
    }
}

/**
 * Writes the outputs whose files don't exist; never overwrites a file.
 *
 * @returns The paths of the files written.
 */
export async function writeMissingFiles(folder: vscode.Uri, outputs: readonly GeneratedOutput[]): Promise<string[]> {
    const written: string[] = [];
    for (const output of outputs) {
        const file = vscode.Uri.joinPath(folder, output.path);
        if (await fileExists(file)) {
            continue;
        }
        await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(file, '..'));
        await vscode.workspace.fs.writeFile(file, toBytes(output.content));
        written.push(output.path);
    }
    return written;
}

async function rollback(created: readonly { uri: vscode.Uri; isDirectory: boolean }[]): Promise<void> {
    for (const entry of [...created].reverse()) {
        try {
            if (entry.isDirectory && (await vscode.workspace.fs.readDirectory(entry.uri)).length > 0) {
                continue;
            }
            await vscode.workspace.fs.delete(entry.uri, { recursive: false, useTrash: false });
        } catch (e) {
            Logger.warn(`Failed to remove ${entry.uri.fsPath} after a failed write: ${errorMessage(e)}`);
        }
    }
}
