import * as vscode from 'vscode';
import { SOURCE_FOLDER } from '../constants';
import type { VortexWorkspaceTracker } from '../project/vortexWorkspaceTracker';
import type { Snippet } from '../types/snippet';
import { SNIPPETS } from './snippets';

export const COMPLETION_SELECTOR: vscode.DocumentSelector = [{ language: 'typescript' }];

/** The snippets belong in the TypeScript files of a detected project's src folder */
export function acceptsSnippets(tracker: VortexWorkspaceTracker, document: vscode.TextDocument): boolean {
    const project = tracker.find(document.uri);
    return project !== undefined
        && document.languageId === 'typescript'
        && isInside(vscode.Uri.joinPath(project.folder.uri, SOURCE_FOLDER), document.uri);
}

export class VortexCompletionProvider implements vscode.CompletionItemProvider {
    constructor(private readonly tracker: VortexWorkspaceTracker) { }

    provideCompletionItems(document: vscode.TextDocument): vscode.CompletionItem[] | undefined {
        return acceptsSnippets(this.tracker, document)
            ? Object.entries(SNIPPETS).map(([label, snippet]) => toCompletionItem(label, snippet))
            : undefined;
    }
}

function toCompletionItem(label: string, snippet: Snippet): vscode.CompletionItem {
    const item = new vscode.CompletionItem(label, vscode.CompletionItemKind.Snippet);
    item.insertText = new vscode.SnippetString(snippet.body);
    item.detail = snippet.description;
    item.documentation = new vscode.MarkdownString().appendCodeblock(snippet.body);
    return item;
}

function isInside(folder: vscode.Uri, uri: vscode.Uri): boolean {
    const prefix = `${folder.toString()}/`;
    return uri.toString().startsWith(prefix);
}
