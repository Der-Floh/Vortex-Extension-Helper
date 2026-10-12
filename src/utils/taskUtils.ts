import { randomUUID } from 'crypto';
import * as vscode from 'vscode';
import { MANIFEST, TASK_START_TIMEOUT_MS, TASK_TYPE } from '../constants';
import { WORKSPACE_TRUST, UntrustedWorkspaceError, type TrustGate } from './trust';

export interface RunTaskOptions {
    readonly reveal?: vscode.TaskRevealKind;
    readonly token?: vscode.CancellationToken;
    readonly trust?: TrustGate;
}

export class TaskStartError extends Error {
    constructor(name: string) {
        super(`The task "${name}" didn't start within ${TASK_START_TIMEOUT_MS / 1000} seconds.`);
        this.name = 'TaskStartError';
    }
}

/**
 * Runs a shell command as a task of a workspace folder and waits for it to end.
 *
 * @returns The exit code, or undefined if the task ended without reporting one.
 * @throws UntrustedWorkspaceError in Restricted Mode, where VS Code would wait for a trust prompt and never start the task.
 * @throws TaskStartError if the task doesn't start, for example because another trust prompt was dismissed.
 * @throws vscode.CancellationError if the token is cancelled.
 */
export async function runTask(folder: vscode.WorkspaceFolder, name: string, execution: vscode.ShellExecution, options: RunTaskOptions = {}): Promise<number | undefined> {
    if (!(options.trust ?? WORKSPACE_TRUST).isTrusted) {
        throw new UntrustedWorkspaceError();
    }
    if (options.token?.isCancellationRequested) {
        throw new vscode.CancellationError();
    }

    const runId = randomUUID();
    const task = new vscode.Task({ type: TASK_TYPE, task: name, runId }, folder, name, MANIFEST.displayName, execution, []);
    task.presentationOptions = { reveal: options.reveal ?? vscode.TaskRevealKind.Silent, panel: vscode.TaskPanelKind.Dedicated, clear: true };
    const isThisRun = (candidate: vscode.Task) => candidate.definition.runId === runId;

    return new Promise<number | undefined>((resolve, reject) => {
        let settled = false;
        let started = false;
        let exitCode: number | undefined;
        let running: vscode.TaskExecution | undefined;
        const disposables: vscode.Disposable[] = [];

        const settle = (complete: () => void) => {
            if (settled) {
                return;
            }
            settled = true;
            clearTimeout(watchdog);
            disposables.forEach(disposable => disposable.dispose());
            complete();
        };

        // VS Code resolves executeTask before the task starts and drops start failures, so a missing start event is the only sign of one
        const watchdog = setTimeout(() => {
            if (!started) {
                settle(() => reject(new TaskStartError(name)));
            }
        }, TASK_START_TIMEOUT_MS);

        disposables.push(
            vscode.tasks.onDidStartTask(event => {
                if (isThisRun(event.execution.task)) {
                    started = true;
                }
            }),
            vscode.tasks.onDidEndTaskProcess(event => {
                if (isThisRun(event.execution.task)) {
                    exitCode = event.exitCode;
                }
            }),
            vscode.tasks.onDidEndTask(event => {
                if (isThisRun(event.execution.task)) {
                    settle(() => resolve(exitCode));
                }
            }),
        );
        if (options.token) {
            disposables.push(options.token.onCancellationRequested(() => {
                running?.terminate();
                settle(() => reject(new vscode.CancellationError()));
            }));
        }

        vscode.tasks.executeTask(task).then(
            taskExecution => {
                running = taskExecution;
            },
            error => settle(() => reject(error)),
        );
    });
}
