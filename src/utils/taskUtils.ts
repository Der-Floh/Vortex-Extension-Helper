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
 * VS Code picks a task's terminal by its definition, so the definition has to stay the same from
 * run to run for a task to get its old terminal back.
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

    const task = new vscode.Task({ type: TASK_TYPE, task: name }, folder, name, MANIFEST.displayName, execution, []);
    task.presentationOptions = { reveal: options.reveal ?? vscode.TaskRevealKind.Silent, panel: vscode.TaskPanelKind.Dedicated, clear: true };
    const isThisTask = (candidate: vscode.Task) => candidate.definition.type === TASK_TYPE
        && candidate.definition.task === name
        && typeof candidate.scope === 'object'
        && candidate.scope.uri.toString() === folder.uri.toString();

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

        // an end only counts after this run's start: a cancelled earlier run of the same task can still be ending
        disposables.push(
            vscode.tasks.onDidStartTask(event => {
                if (isThisTask(event.execution.task)) {
                    started = true;
                }
            }),
            vscode.tasks.onDidEndTaskProcess(event => {
                if (started && isThisTask(event.execution.task)) {
                    exitCode = event.exitCode;
                }
            }),
            vscode.tasks.onDidEndTask(event => {
                if (started && isThisTask(event.execution.task)) {
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
