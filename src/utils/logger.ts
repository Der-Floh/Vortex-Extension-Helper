import * as vscode from 'vscode';
import { EXTENSION } from '../constants/strings';

export class Logger {
    private static _log = vscode.window.createOutputChannel(EXTENSION.NAME, { log: true });

    static debug(message: string, ...optionalParams: unknown[]): void {
        this._log.debug(`${message}`, ...optionalParams);
    }

    static info(message: string, ...optionalParams: unknown[]): void {
        this._log.info(`${message}`, ...optionalParams);
    }

    static warn(message: string, ...optionalParams: unknown[]): void {
        this._log.warn(`${message}`, ...optionalParams);
    }

    static error(message: string, ...optionalParams: unknown[]): void {
        this._log.error(`${message}`, ...optionalParams);
    }
}
