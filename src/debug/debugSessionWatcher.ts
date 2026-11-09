import * as vscode from 'vscode';
import { VORTEX_PROBE_INTERVAL_MS } from '../constants';
import { Logger } from '../utils/logger';
import { HTTP_CDP, type CdpProbe } from './cdpProbe';

const POLL_INTERVAL_MS = 4 * VORTEX_PROBE_INTERVAL_MS;
/** Vortex restarts itself to apply an update, so one missed probe shouldn't end the session */
const MISSES_BEFORE_STOP = 3;
/** The source map scheme the generated rollup config writes, which is what marks a session as ours */
const SOURCE_SCHEME_OVERRIDE = /^[A-Za-z][A-Za-z0-9.+-]*:\/\/\/\*$/;

/** VS Code's debug sessions behind an interface, so the watcher can be driven by a test */
export interface DebugHost {
    readonly onDidStartDebugSession: vscode.Event<vscode.DebugSession>;
    readonly onDidTerminateDebugSession: vscode.Event<vscode.DebugSession>;
    stopDebugging(session: vscode.DebugSession): Thenable<void>;
}

export interface WatchOptions {
    readonly probe?: CdpProbe;
    readonly host?: DebugHost;
    readonly intervalMs?: number;
    readonly misses?: number;
}

export const VSCODE_DEBUG: DebugHost = {
    onDidStartDebugSession: (listener, thisArgs, disposables) => vscode.debug.onDidStartDebugSession(listener, thisArgs, disposables),
    onDidTerminateDebugSession: (listener, thisArgs, disposables) => vscode.debug.onDidTerminateDebugSession(listener, thisArgs, disposables),
    stopDebugging: session => vscode.debug.stopDebugging(session),
};

/**
 * Ends a debug session whose Vortex is gone.
 *
 * js-debug's browser attacher reports `blockSessionTermination: true`, overrides its own timeout
 * to infinity and keeps rescheduling attach attempts, so closing Vortex leaves the session running
 * with nothing under it. VS Code then reads F5 as "continue", and the next debug run needs a manual
 * stop first.
 */
export function watchVortexDebugSessions(options: WatchOptions = {}): vscode.Disposable {
    const probe = options.probe ?? HTTP_CDP;
    const host = options.host ?? VSCODE_DEBUG;
    const intervalMs = options.intervalMs ?? POLL_INTERVAL_MS;
    const allowedMisses = options.misses ?? MISSES_BEFORE_STOP;
    const timers = new Map<string, NodeJS.Timeout>();

    const stopWatching = (session: vscode.DebugSession): void => {
        const timer = timers.get(session.id);
        if (timer !== undefined) {
            clearInterval(timer);
            timers.delete(session.id);
        }
    };

    const watch = (session: vscode.DebugSession): void => {
        const port = vortexPortOf(session);
        // js-debug nests a session per target under the one that holds the configuration, and it is
        // that outer session which stays behind, so the children are left alone
        if (port === undefined || session.parentSession !== undefined || timers.has(session.id)) {
            if (port === undefined && session.configuration.request === 'attach') {
                Logger.info(`Not watching the debug session "${session.name}" (${session.type}): ${describeMismatch(session)}`);
            }
            return;
        }
        Logger.info(`Watching the debug session "${session.name}" (${session.type}) on port ${port}.`);
        let misses = 0;
        timers.set(session.id, setInterval(() => {
            void probe.version(port).then(async result => {
                if (result.status !== 'closed') {
                    misses = 0;
                    return;
                }
                misses += 1;
                if (misses < allowedMisses) {
                    return;
                }
                stopWatching(session);
                Logger.info(`Vortex stopped listening on port ${port}, ending the debug session.`);
                await host.stopDebugging(session);
            });
        }, intervalMs));
    };

    const subscriptions = [host.onDidStartDebugSession(watch), host.onDidTerminateDebugSession(stopWatching)];

    return {
        dispose: () => {
            for (const timer of timers.values()) {
                clearInterval(timer);
            }
            timers.clear();
            subscriptions.forEach(subscription => subscription.dispose());
        },
    };
}

/** Whether a session is the one holding an attach to Vortex, rather than one of the sessions js-debug nests under it */
export function isVortexDebugSession(session: vscode.DebugSession): boolean {
    return vortexPortOf(session) !== undefined && session.parentSession === undefined;
}

/**
 * The port of a session that attaches to Vortex, otherwise undefined.
 *
 * The session's type is deliberately not part of this: js-debug contributes `chrome` but matches
 * its own `pwa-chrome` internally, and which of the two a session reports is its business. The
 * source map scheme below is ours, so it identifies the session without guessing at type names.
 */
function vortexPortOf(session: vscode.DebugSession): number | undefined {
    const configuration = session.configuration;
    if (configuration.request !== 'attach' || typeof configuration.port !== 'number') {
        return undefined;
    }
    const overrides = configuration.sourceMapPathOverrides as Record<string, string> | undefined;
    const keys = overrides === undefined ? [] : Object.keys(overrides);
    return keys.length === 1 && SOURCE_SCHEME_OVERRIDE.test(keys[0]) ? configuration.port : undefined;
}

/** Why a session that looked like a candidate isn't one, so a miss can be read out of the log */
function describeMismatch(session: vscode.DebugSession): string {
    const configuration = session.configuration;
    const overrides = configuration.sourceMapPathOverrides as Record<string, string> | undefined;
    return [
        typeof configuration.port === 'number' ? undefined : `port is ${JSON.stringify(configuration.port)}`,
        overrides === undefined ? 'it has no sourceMapPathOverrides' : `its sourceMapPathOverrides keys are ${JSON.stringify(Object.keys(overrides))}`,
    ].filter(Boolean).join(', ');
}
