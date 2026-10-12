import * as vscode from 'vscode';
import type { ProjectLanguage } from '../types/project';
import type { Snippet, SnippetMap } from '../types/snippet';
import { SNIPPETS_JS } from './snippetsJs';
import { SNIPPETS_TS } from './snippetsTs';
import type { VortexWorkspaceTracker } from './vortexWorkspaceTracker';

export const COMPLETION_SELECTOR: vscode.DocumentSelector = [{ language: 'typescript' }, { language: 'javascript' }];

const SNIPPETS: Readonly<Record<ProjectLanguage, SnippetMap>> = { typescript: SNIPPETS_TS, javascript: SNIPPETS_JS };
const SOURCE_FOLDER = 'src';

/** Offers the snippets only in the src folder of a detected project, in the project's language */
export class VortexCompletionProvider implements vscode.CompletionItemProvider {
    constructor(private readonly tracker: VortexWorkspaceTracker) { }

    provideCompletionItems(document: vscode.TextDocument): vscode.CompletionItem[] | undefined {
        const project = this.tracker.find(document.uri);
        if (!project || document.languageId !== project.language || !isInside(vscode.Uri.joinPath(project.folder.uri, SOURCE_FOLDER), document.uri)) {
            return undefined;
        }
        return Object.entries(SNIPPETS[project.language]).map(([label, snippet]) => toCompletionItem(label, snippet));
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
