import * as vscode from 'vscode';
import { MANIFEST, PENDING_INSTALL_KEY, PENDING_INSTALL_MAX_AGE_MS } from '../constants';
import { installProjectDependencies } from './dependencyInstaller';
import { WORKSPACE_TRUST, whenTrusted, type TrustGate } from './trust';
import type { VortexDiagnostics } from './vortexDiagnostics';

/** A project the wizard created; its dependencies are installed once VS Code has opened it */
export interface PendingInstall {
    readonly targetUri: string;
    readonly createdAt: number;
}

export async function savePendingInstall(state: vscode.Memento, target: vscode.Uri): Promise<void> {
    const pending: PendingInstall = { targetUri: target.toString(), createdAt: Date.now() };
    await state.update(PENDING_INSTALL_KEY, pending);
}

/**
 * Installs the dependencies of a project the wizard created, if this window opened it.
 * A window without that folder leaves the state for the window that opens it.
 */
export async function resumePendingInstall(state: vscode.Memento, diagnostics: VortexDiagnostics, trust: TrustGate = WORKSPACE_TRUST): Promise<void> {
    const pending = state.get<PendingInstall>(PENDING_INSTALL_KEY);
    if (!pending) {
        return;
    }
    if (Date.now() - pending.createdAt > PENDING_INSTALL_MAX_AGE_MS) {
        await state.update(PENDING_INSTALL_KEY, undefined);
        return;
    }
    const folder = findTargetFolder(vscode.Uri.parse(pending.targetUri));
    if (!folder) {
        return;
    }
    await state.update(PENDING_INSTALL_KEY, undefined);

    if (!trust.isTrusted) {
        vscode.window.showInformationMessage(`${MANIFEST.displayName}: Trust ${folder.name} to install its dependencies.`);
        await whenTrusted(trust);
    }
    await installProjectDependencies(folder, diagnostics);
}

function findTargetFolder(target: vscode.Uri): vscode.WorkspaceFolder | undefined {
    const folders = vscode.workspace.workspaceFolders ?? [];
    return folders.find(folder => folder.uri.toString() === target.toString())
        ?? folders.find(folder => folder.uri.scheme === target.scheme && samePath(folder.uri.fsPath, target.fsPath));
}

function samePath(a: string, b: string): boolean {
    return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
}
