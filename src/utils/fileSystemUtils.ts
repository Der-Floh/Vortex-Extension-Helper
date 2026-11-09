import * as vscode from 'vscode';

const decoder = new TextDecoder();
const encoder = new TextEncoder();

export async function fileExists(uri: vscode.Uri): Promise<boolean> {
    try {
        await vscode.workspace.fs.stat(uri);
        return true;
    } catch {
        return false;
    }
}

/** @returns The file's text, or undefined if it can't be read */
export async function readTextIfExists(uri: vscode.Uri): Promise<string | undefined> {
    try {
        return decoder.decode(await vscode.workspace.fs.readFile(uri));
    } catch {
        return undefined;
    }
}

export async function writeText(uri: vscode.Uri, text: string): Promise<void> {
    await vscode.workspace.fs.writeFile(uri, encoder.encode(text));
}

/** The text of an open document, which may be newer than the file, otherwise the file's */
export async function readCurrentText(uri: vscode.Uri): Promise<string | undefined> {
    const document = findOpenDocument(uri);
    return document ? document.getText() : readTextIfExists(uri);
}

export function findOpenDocument(uri: vscode.Uri): vscode.TextDocument | undefined {
    return vscode.workspace.textDocuments.find(candidate => candidate.uri.toString() === uri.toString());
}

export function toBytes(content: string | Uint8Array): Uint8Array {
    return typeof content === 'string' ? encoder.encode(content) : content;
}

/** Deletes every entry of a directory, keeping the directory itself so open handles on it stay valid */
export async function emptyDirectory(uri: vscode.Uri): Promise<void> {
    for (const [name] of await vscode.workspace.fs.readDirectory(uri)) {
        // useTrash would send the entries to the recycle bin, which is slow and can fail outright
        await vscode.workspace.fs.delete(vscode.Uri.joinPath(uri, name), { recursive: true, useTrash: false });
    }
}

/** Copies the entries of a directory into another one, creating it. @returns The number of files copied */
export async function copyDirectoryContents(source: vscode.Uri, target: vscode.Uri, token?: vscode.CancellationToken): Promise<number> {
    await vscode.workspace.fs.createDirectory(target);
    let copied = 0;
    for (const [name, type] of await vscode.workspace.fs.readDirectory(source)) {
        if (token?.isCancellationRequested) {
            throw new vscode.CancellationError();
        }
        const from = vscode.Uri.joinPath(source, name);
        const to = vscode.Uri.joinPath(target, name);
        if (type === vscode.FileType.Directory) {
            copied += await copyDirectoryContents(from, to, token);
        } else {
            await vscode.workspace.fs.copy(from, to, { overwrite: true });
            copied += 1;
        }
    }
    return copied;
}

/** Whether every file below `source` has an identical copy at the same path below `target` */
export async function hasIdenticalCopies(source: vscode.Uri, target: vscode.Uri): Promise<boolean> {
    let entries: [string, vscode.FileType][];
    try {
        entries = await vscode.workspace.fs.readDirectory(source);
    } catch {
        return false;
    }
    for (const [name, type] of entries) {
        const from = vscode.Uri.joinPath(source, name);
        const to = vscode.Uri.joinPath(target, name);
        if (!await (type === vscode.FileType.Directory ? hasIdenticalCopies(from, to) : haveSameBytes(from, to))) {
            return false;
        }
    }
    return true;
}

/** The latest modification time of a file or of anything below a directory, or undefined if it doesn't exist */
export async function latestModification(uri: vscode.Uri): Promise<number | undefined> {
    const stat = await statIfExists(uri);
    if (stat?.type !== vscode.FileType.Directory) {
        return stat?.mtime;
    }
    const entries = await vscode.workspace.fs.readDirectory(uri);
    const times = await Promise.all(entries.map(([name]) => latestModification(vscode.Uri.joinPath(uri, name))));
    return Math.max(0, ...times.filter((time): time is number => time !== undefined));
}

/** Saves the folder's modified documents, so a build reads what the editor shows. @returns False if one couldn't be saved */
export async function saveDirtyDocuments(folder: vscode.Uri): Promise<boolean> {
    const prefix = `${folder.toString().replace(/\/$/, '')}/`;
    const dirty = vscode.workspace.textDocuments.filter(document => document.isDirty && document.uri.toString().startsWith(prefix));
    const results = await Promise.all(dirty.map(document => document.save()));
    return results.every(saved => saved);
}

async function statIfExists(uri: vscode.Uri): Promise<vscode.FileStat | undefined> {
    try {
        return await vscode.workspace.fs.stat(uri);
    } catch {
        return undefined;
    }
}

async function readBytesIfExists(uri: vscode.Uri): Promise<Uint8Array | undefined> {
    try {
        return await vscode.workspace.fs.readFile(uri);
    } catch {
        return undefined;
    }
}

async function haveSameBytes(first: vscode.Uri, second: vscode.Uri): Promise<boolean> {
    const [a, b] = await Promise.all([readBytesIfExists(first), readBytesIfExists(second)]);
    return a !== undefined && b !== undefined && a.length === b.length && a.every((byte, index) => byte === b[index]);
}
