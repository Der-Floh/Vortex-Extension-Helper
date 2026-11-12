import * as vscode from 'vscode';
import { showInfo } from '../utils/notifications';

/** Something a project can be busy with. The label finishes the sentence "<folder> is still ..." */
export interface Activity {
    readonly id: string;
    readonly label: string;
}

export interface ActivityChange {
    readonly folder: vscode.WorkspaceFolder;
    readonly activity: Activity;
    readonly running: boolean;
}

export const ACTIVITY_DEPENDENCIES: Activity = { id: 'dependencies', label: 'installing its dependencies' };
export const ACTIVITY_BUILD: Activity = { id: 'build', label: 'building' };
export const ACTIVITY_PACKAGE: Activity = { id: 'package', label: 'being packaged' };
export const ACTIVITY_DEPLOY: Activity = { id: 'deploy', label: 'being deployed' };
export const ACTIVITY_DEBUG: Activity = { id: 'debug', label: 'starting a debug session' };
export const ACTIVITY_ADDONS: Activity = { id: 'addons', label: 'changing its add-ons' };

export function libraryActivityId(name: string): string {
    return `library:${name}`;
}

export function libraryActivity(verb: 'adding' | 'removing', name: string): Activity {
    return { id: libraryActivityId(name), label: `${verb} ${name}` };
}

/** Lets one thing at a time run on a folder, because two npm runs would overwrite each other's package.json */
export class ProjectActivity implements vscode.Disposable {
    private readonly _onDidChange = new vscode.EventEmitter<ActivityChange>();
    readonly onDidChange = this._onDidChange.event;

    private readonly _running = new Map<string, Activity>();

    current(folder: vscode.WorkspaceFolder): Activity | undefined {
        return this._running.get(folder.uri.toString());
    }

    /** @returns What the task returned, or undefined if the folder was busy, which the author is told */
    async run<T>(folder: vscode.WorkspaceFolder, activity: Activity, task: () => Thenable<T>): Promise<T | undefined> {
        const busyWith = this.current(folder);
        if (busyWith) {
            showInfo(`${folder.name} is still ${busyWith.label}. Try again when that has finished.`);
            return undefined;
        }
        const key = folder.uri.toString();
        this._running.set(key, activity);
        this._onDidChange.fire({ folder, activity, running: true });
        try {
            return await task();
        } finally {
            this._running.delete(key);
            this._onDidChange.fire({ folder, activity, running: false });
        }
    }

    dispose(): void {
        this._onDidChange.dispose();
    }
}
