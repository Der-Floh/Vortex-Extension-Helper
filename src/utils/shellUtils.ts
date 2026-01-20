import * as vscode from 'vscode';
import { EXTENSION_ID, EXTENSION_NAME, log } from '../extension';

function isWeb(): boolean {
    return vscode.env.uiKind === vscode.UIKind.Web;
}

function runShellTaskAndWait(task: vscode.Task): Promise<void> {
    return new Promise(async (resolve, reject) => {
        const started = await vscode.tasks.executeTask(task);

        const disposable = vscode.tasks.onDidEndTaskProcess(e => {
            if (e.execution !== started) {
                return;
            }

            disposable.dispose();

            if (e.exitCode === 0) {
                resolve();
            } else {
                reject(new Error(`Task "${task.name}" failed with exit code ${e.exitCode ?? 'unknown'}`));
            }
        });
    });
}

export async function runInstallDeps(targetUri: vscode.Uri) {
    log.debug(`${EXTENSION_NAME}: Running install-current-deps in "${targetUri.fsPath}"`);

    if (isWeb()) {
        log.warn(`${EXTENSION_NAME}: Cannot run install-current-deps in VS Code Web`);
        await vscode.window.showWarningMessage(
            'Automatic dependency installation is not available in VS Code Web. ' +
            'Please run "npm run install-current-deps" in your local or remote environment.'
        );
        return;
    }

    const taskName = `${EXTENSION_NAME}: install-current-deps`;

    const execution = new vscode.ShellExecution('npm run install-current-deps', {
        cwd: targetUri.fsPath
    });

    const task = new vscode.Task(
        { type: EXTENSION_ID, task: 'install-current-deps' },
        vscode.TaskScope.Workspace,
        taskName,
        EXTENSION_ID,
        execution
    );

    task.presentationOptions = {
        reveal: vscode.TaskRevealKind.Always,
        panel: vscode.TaskPanelKind.Shared,
        clear: false,
        showReuseMessage: false
    };

    await runShellTaskAndWait(task);
    log.debug(`${EXTENSION_NAME}: install-current-deps completed successfully`);
}
