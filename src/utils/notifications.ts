import * as vscode from 'vscode';
import { MANIFEST } from '../constants';

type MessageArguments<T extends string> = T[] | [vscode.MessageOptions, ...T[]];

function prefixed(message: string): string {
    return `${MANIFEST.displayName}: ${message}`;
}

export function showInfo<T extends string>(message: string, ...args: MessageArguments<T>): Thenable<T | undefined> {
    return vscode.window.showInformationMessage(prefixed(message), ...args as [vscode.MessageOptions, ...T[]]);
}

export function showWarning<T extends string>(message: string, ...args: MessageArguments<T>): Thenable<T | undefined> {
    return vscode.window.showWarningMessage(prefixed(message), ...args as [vscode.MessageOptions, ...T[]]);
}

export function showError<T extends string>(message: string, ...args: MessageArguments<T>): Thenable<T | undefined> {
    return vscode.window.showErrorMessage(prefixed(message), ...args as [vscode.MessageOptions, ...T[]]);
}

export function withNotificationProgress<R>(
    title: string,
    task: (progress: vscode.Progress<{ message?: string; increment?: number }>, token: vscode.CancellationToken) => Thenable<R>,
    cancellable?: boolean,
): Thenable<R> {
    return vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: prefixed(title), cancellable }, task);
}
