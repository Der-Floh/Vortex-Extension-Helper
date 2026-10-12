import * as vscode from 'vscode';
import { DOCUMENTATION_URL } from '../constants';

export async function handleOpenDocumentation(): Promise<void> {
    await vscode.env.openExternal(vscode.Uri.parse(DOCUMENTATION_URL));
}
