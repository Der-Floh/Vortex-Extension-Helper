import * as assert from 'assert';
import * as vscode from 'vscode';
import { runTask } from '../../utils/taskUtils';
import { UntrustedWorkspaceError, whenTrusted, type TrustGate } from '../../utils/trust';

class StubTrust implements TrustGate {
    private readonly emitter = new vscode.EventEmitter<void>();
    readonly onDidGrant = this.emitter.event;
    isTrusted = false;

    grant(): void {
        this.isTrusted = true;
        this.emitter.fire();
    }
}

suite('Workspace trust', () => {
    test('tasks are refused in Restricted Mode instead of waiting for a prompt', async () => {
        const folder = vscode.workspace.workspaceFolders?.[0];
        assert.ok(folder);
        await assert.rejects(runTask(folder, 'probe', new vscode.ShellExecution('node', ['--version']), { trust: new StubTrust() }), UntrustedWorkspaceError);
    });

    test('whenTrusted waits for the grant', async () => {
        const trust = new StubTrust();
        let resolved = false;
        const waiting = whenTrusted(trust).then(() => {
            resolved = true;
        });
        await new Promise(resolve => setTimeout(resolve, 50));
        assert.ok(!resolved);
        trust.grant();
        await waiting;
        assert.ok(resolved);
    });

    test('whenTrusted resolves at once in a trusted workspace', async () => {
        const trust = new StubTrust();
        trust.isTrusted = true;
        await whenTrusted(trust);
    });
});
