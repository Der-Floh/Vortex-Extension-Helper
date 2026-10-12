import * as vscode from 'vscode';
import { MANIFEST } from '../constants';

/** Workspace trust behind an interface, so tests can run the trust checks without changing VS Code's state */
export interface TrustGate {
    readonly isTrusted: boolean;
    readonly onDidGrant: vscode.Event<void>;
}

export const WORKSPACE_TRUST: TrustGate = {
    get isTrusted() {
        return vscode.workspace.isTrusted;
    },
    onDidGrant: vscode.workspace.onDidGrantWorkspaceTrust,
};

export class UntrustedWorkspaceError extends Error {
    constructor() {
        super('npm only runs in a trusted workspace. Trust this folder to install dependencies.');
        this.name = 'UntrustedWorkspaceError';
    }
}

/** Shows why a command needs trust when the workspace is in Restricted Mode */
export function requireTrust(gate: TrustGate = WORKSPACE_TRUST): boolean {
    if (gate.isTrusted) {
        return true;
    }
    vscode.window.showWarningMessage(`${MANIFEST.displayName}: ${new UntrustedWorkspaceError().message}`, 'Manage Workspace Trust')
        .then(choice => choice && vscode.commands.executeCommand('workbench.trust.manage'));
    return false;
}

/** Resolves once the workspace is trusted, which may be never */
export function whenTrusted(gate: TrustGate = WORKSPACE_TRUST): Promise<void> {
    if (gate.isTrusted) {
        return Promise.resolve();
    }
    return new Promise(resolve => {
        const listener = gate.onDidGrant(() => {
            listener.dispose();
            resolve();
        });
    });
}
