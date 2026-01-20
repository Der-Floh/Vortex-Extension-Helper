import * as vscode from 'vscode';
import { snippetsTs } from './snippetsTs';
import { snippetsJs } from './snippetsJs';

export namespace VortexCompletionProvider {
    export class TS implements vscode.CompletionItemProvider {
        provideCompletionItems(): vscode.ProviderResult<vscode.CompletionItem[]> {
            const items: vscode.CompletionItem[] = [];

            for (const [key, body] of Object.entries(snippetsTs)) {
                items.push(makeSnippet(key, body));
            }

            return items;
        }
    }

    export class JS implements vscode.CompletionItemProvider {
        provideCompletionItems(): vscode.ProviderResult<vscode.CompletionItem[]> {
            const items: vscode.CompletionItem[] = [];

            for (const [key, body] of Object.entries(snippetsJs)) {
                items.push(makeSnippet(key, body));
            }

            return items;
        }
    }

    function makeSnippet(label: string, body: string, description?: string): vscode.CompletionItem {
        const item = new vscode.CompletionItem(label, vscode.CompletionItemKind.Snippet);
        item.insertText = new vscode.SnippetString(body);
        item.detail = description ?? 'Vortex helper snippet';
        return item;
    }
}
