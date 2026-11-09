import { execFile, spawn } from 'child_process';
import { Logger } from '../utils/logger';

const PROCESS_NAME = 'Vortex';
const WINDOWS_IMAGE = 'Vortex.exe';

export interface LaunchedVortex {
    readonly pid: number | undefined;
    /** The exit code once the process ends; never rejects */
    readonly exited: Promise<number | null>;
    /** Stops the extension host from waiting on Vortex */
    release(): void;
}

export interface VortexLauncher {
    launch(exe: string, args: readonly string[]): LaunchedVortex;
    /** Whether a Vortex process exists, or undefined when the platform can't be asked */
    isVortexRunning(): Promise<boolean | undefined>;
    /** Asks Vortex to close, or forces it, which loses whatever Vortex hadn't written to its state database */
    requestClose(force: boolean): Promise<void>;
}

/** The switches that make a release Vortex attachable; it opens no port on its own */
export function debugArguments(port: number): string[] {
    return [`--remote-debugging-port=${port}`, '--remote-allow-origins=*'];
}

function run(command: string, args: readonly string[]): Promise<{ code: number; stdout: string } | undefined> {
    return new Promise(resolve => {
        execFile(command, [...args], { windowsHide: true }, (error, stdout) => {
            const code = (error as { code?: unknown } | null)?.code;
            if (error && typeof code !== 'number') {
                resolve(undefined);
                return;
            }
            resolve({ code: typeof code === 'number' ? code : 0, stdout });
        });
    });
}

export const SYSTEM_LAUNCHER: VortexLauncher = {
    launch(exe, args) {
        // detached so closing VS Code doesn't take Vortex down, and never shell: the path has spaces
        const child = spawn(exe, [...args], { detached: true, stdio: 'ignore', windowsHide: false });
        const exited = new Promise<number | null>(resolve => {
            child.once('exit', code => resolve(code));
            child.once('error', () => resolve(null));
        });
        return {
            pid: child.pid,
            exited,
            release: () => child.unref(),
        };
    },
    async isVortexRunning() {
        if (process.platform === 'win32') {
            const result = await run('tasklist', ['/FI', `IMAGENAME eq ${WINDOWS_IMAGE}`, '/NH']);
            return result === undefined ? undefined : result.stdout.includes(WINDOWS_IMAGE);
        }
        const result = await run('pgrep', ['-x', PROCESS_NAME]);
        return result === undefined ? undefined : result.code === 0;
    },
    async requestClose(force) {
        const result = process.platform === 'win32'
            ? await run('taskkill', force ? ['/F', '/IM', WINDOWS_IMAGE] : ['/IM', WINDOWS_IMAGE])
            : await run('pkill', [force ? '-KILL' : '-TERM', '-x', PROCESS_NAME]);
        if (result === undefined) {
            Logger.warn('Could not ask Vortex to close: the platform has no process tool.');
        }
    },
};
