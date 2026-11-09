import * as vscode from 'vscode';
import { SOURCE_FOLDER } from '../constants';
import type { VortexWorkspaceTracker } from '../project/vortexWorkspaceTracker';
import type { Snippet } from '../types/snippet';
import { SNIPPETS } from './snippets';

export const COMPLETION_SELECTOR: vscode.DocumentSelector = [{ language: 'typescript' }];

/** Offers the snippets only in the src folder of a detected project */
export class VortexCompletionProvider implements vscode.CompletionItemProvider {
    constructor(private readonly tracker: VortexWorkspaceTracker) { }

    provideCompletionItems(document: vscode.TextDocument): vscode.CompletionItem[] | undefined {
        const project = this.tracker.find(document.uri);
        if (!project || document.languageId !== 'typescript' || !isInside(vscode.Uri.joinPath(project.folder.uri, SOURCE_FOLDER), document.uri)) {
            return undefined;
        }
        return Object.entries(SNIPPETS).map(([label, snippet]) => toCompletionItem(label, snippet));
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
