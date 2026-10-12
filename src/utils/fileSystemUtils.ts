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
