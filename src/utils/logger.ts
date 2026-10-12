import * as vscode from 'vscode';
import { MANIFEST } from '../constants';

export class Logger {
    private static _log?: vscode.LogOutputChannel;

    static initialize(context: vscode.ExtensionContext) {
        this._log = vscode.window.createOutputChannel(MANIFEST.displayName, { log: true });
        context.subscriptions.push(this._log);
    }

    static show(): void {
        this._log?.show(true);
    }

    static trace(message: string, ...optionalParams: unknown[]): void {
        this._log?.trace(`${message}`, ...optionalParams);
    }

    static debug(message: string, ...optionalParams: unknown[]): void {
        this._log?.debug(`${message}`, ...optionalParams);
    }

    static info(message: string, ...optionalParams: unknown[]): void {
        this._log?.info(`${message}`, ...optionalParams);
    }

    static warn(message: string, ...optionalParams: unknown[]): void {
        this._log?.warn(`${message}`, ...optionalParams);
    }

    static error(message: string, ...optionalParams: unknown[]): void {
        this._log?.error(`${message}`, ...optionalParams);
    }
}
