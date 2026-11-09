import * as vscode from 'vscode';
import type { VortexWorkspaceTracker } from '../project/vortexWorkspaceTracker';
import { acceptsSnippets } from '../snippets/vortexCompletionProvider';
import type { SnippetTarget } from '../types/snippet';
import { showInfo } from '../utils/notifications';

/** Inserts a snippet from the sidebar at the cursor of the active editor */
export async function handleInsertSnippet(tracker: VortexWorkspaceTracker, target?: SnippetTarget): Promise<void> {
    const active = vscode.window.activeTextEditor;
    if (!target?.snippet) {
        return;
    }
    if (!active || !acceptsSnippets(tracker, active.document)) {
        showInfo('Open a TypeScript file in the src folder of a game extension first.');
        return;
    }
    // focus goes to the editor first, otherwise the snippet's tab stops can't be stepped through
    const editor = await vscode.window.showTextDocument(active.document, active.viewColumn);
    await editor.insertSnippet(new vscode.SnippetString(target.snippet.body));
}
