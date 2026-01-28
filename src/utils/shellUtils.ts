import * as vscode from 'vscode';
import { Logger } from './logger';
import { EXTENSION } from '../constants/strings';

function isWeb(): boolean {
    return vscode.env.uiKind === vscode.UIKind.Web;
}

function runShellTaskAndWait(task: vscode.Task, token?: vscode.CancellationToken, timeoutMs?: number): Promise<void> {
    return new Promise(async (resolve, reject) => {
        const execution = await vscode.tasks.executeTask(task);
        let finished = false;

        let tokenListener: vscode.Disposable | undefined;
        let timeoutId: ReturnType<typeof setTimeout> | undefined;

        const disposable = vscode.tasks.onDidEndTaskProcess(e => {
            if (e.execution !== execution) {
                return;
            }

            if (finished) {
                return;
            }
            finished = true;
            disposable.dispose();
            tokenListener?.dispose();
            if (timeoutId) {
                clearTimeout(timeoutId);
            }

            if (e.exitCode === 0) {
                resolve();
            } else {
                reject(new Error(`Task "${task.name}" failed with exit code ${e.exitCode ?? 'unknown'}`));
            }
        });

        if (token) {
            tokenListener = token.onCancellationRequested(() => {
                if (finished) {
                    return;
                }

                finished = true;

                try {
                    execution.terminate();
                } catch { }

                disposable.dispose();
                tokenListener?.dispose();
                if (timeoutId) {
                    clearTimeout(timeoutId);
                }

                // Let callers distinguish cancellation if they want
                reject(new vscode.CancellationError());
            });
        }

        if (timeoutMs && timeoutMs > 0) {
            timeoutId = setTimeout(() => {
                if (finished) {
                    return;
                }

                finished = true;

                try {
                    execution.terminate();
                } catch { }

                disposable.dispose();
                tokenListener?.dispose();

                reject(new vscode.CancellationError());
            }, timeoutMs);
        }
    });
}

export async function runInstallDeps(targetUri: vscode.Uri) {
    Logger.debug(`Running install-current-deps in "${targetUri.fsPath}"`);

    if (isWeb()) {
        Logger.warn(`Cannot run install-current-deps in VS Code Web`);
        await vscode.window.showWarningMessage(
            'Automatic dependency installation is not available in VS Code Web. ' +
            'Please run "npm run install-current-deps" in your local or remote environment.'
        );
        return;
    }

    await ensureNodeAndGitAvailable(targetUri);

    const taskName = `install-current-deps`;

    const execution = new vscode.ShellExecution('npm run install-current-deps', {
        cwd: targetUri.fsPath
    });

    const task = new vscode.Task(
        { type: EXTENSION.ID, task: 'install-current-deps' },
        vscode.TaskScope.Workspace,
        taskName,
        EXTENSION.ID,
        execution
    );

    task.presentationOptions = {
        reveal: vscode.TaskRevealKind.Always,
        panel: vscode.TaskPanelKind.Shared,
        clear: false,
        showReuseMessage: false
    };

    await runShellTaskAndWait(task);
    Logger.debug(`install-current-deps completed successfully`);
}

export async function ensureNodeAndGitAvailable(targetUri?: vscode.Uri, token?: vscode.CancellationToken, timeoutMs: number = 20000): Promise<void> {
    const [nodeRes, gitRes] = await Promise.allSettled([
        ensureNodeAvailable(targetUri, token, timeoutMs),
        ensureGitAvailable(targetUri, token, timeoutMs),
    ]);

    const nodeFailed = nodeRes.status === "rejected";
    const gitFailed = gitRes.status === "rejected";

    if (!nodeFailed && !gitFailed) {
        return;
    }

    if (nodeFailed && gitFailed) {
        throw new Error("Node.js and Git are not installed or not on PATH");
    }

    if (nodeFailed) {
        const reason = (nodeRes as PromiseRejectedResult).reason;
        throw reason instanceof Error ? reason : new Error(String(reason));
    }

    const reason = (gitRes as PromiseRejectedResult).reason;
    throw reason instanceof Error ? reason : new Error(String(reason));
}


async function ensureNodeAvailable(targetUri?: vscode.Uri, token?: vscode.CancellationToken, timeoutMs: number = 20000): Promise<void> {
    const taskName = `check-node-version`;

    const cwd = targetUri?.fsPath ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

    const execution = cwd
        ? new vscode.ShellExecution('node -v', { cwd })
        : new vscode.ShellExecution('node -v');

    const task = new vscode.Task(
        { type: EXTENSION.ID, task: taskName },
        vscode.TaskScope.Global,
        taskName,
        EXTENSION.ID,
        execution
    );

    task.presentationOptions = {
        reveal: vscode.TaskRevealKind.Never,
        panel: vscode.TaskPanelKind.Shared,
        clear: false,
        showReuseMessage: false
    };

    try {
        await runShellTaskAndWait(task, token, timeoutMs);
        Logger.debug(`Node.js detected via "node -v"`);
    } catch (err) {
        Logger.warn(`Node.js is not installed or not on PATH ${String(err)}`);
        throw new Error('Node.js is not installed or not on PATH');
    }
}

async function ensureGitAvailable(targetUri?: vscode.Uri, token?: vscode.CancellationToken, timeoutMs: number = 20000): Promise<void> {
    const taskName = `check-git-version`;

    const cwd = targetUri?.fsPath ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

    const execution = cwd
        ? new vscode.ShellExecution('git -v', { cwd })
        : new vscode.ShellExecution('git -v');

    const task = new vscode.Task(
        { type: EXTENSION.ID, task: taskName },
        vscode.TaskScope.Global,
        taskName,
        EXTENSION.ID,
        execution
    );

    task.presentationOptions = {
        reveal: vscode.TaskRevealKind.Never,
        panel: vscode.TaskPanelKind.Shared,
        clear: false,
        showReuseMessage: false
    };

    try {
        await runShellTaskAndWait(task, token, timeoutMs);
        Logger.debug(`Git detected via "git -v"`);
    } catch (err) {
        Logger.warn(`Git is not installed or not on PATH ${String(err)}`);
        throw new Error('Git is not installed or not on PATH');
    }
}
