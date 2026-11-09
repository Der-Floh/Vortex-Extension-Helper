import * as http from 'http';
import * as vscode from 'vscode';
import { VORTEX_PROBE_INTERVAL_MS, VORTEX_READY_TIMEOUT_MS } from '../constants';

const REQUEST_TIMEOUT_MS = 3_000;
const MAX_BODY_BYTES = 1024 * 1024;
/** The target types js-debug can attach to */
const ATTACHABLE_TYPES = new Set(['page', 'iframe']);
/** Vortex's splash screen is a page target of its own, and it closes once the main window shows */
const SPLASH_WINDOW = /\/splash\.html(\?|$)/i;
/** The window MainWindow loads, which is where extensions run */
const MAIN_WINDOW = /\/index\.html(\?|$)/i;

export interface CdpTarget {
    readonly id: string;
    readonly type: string;
    readonly url: string;
    readonly title?: string;
    readonly webSocketDebuggerUrl?: string;
}

export interface CdpVersion {
    readonly browser: string;
}

export type ProbeResult<T> =
    | { readonly status: 'ok'; readonly value: T }
    | { readonly status: 'closed' }
    | { readonly status: 'foreign'; readonly detail: string };

export interface CdpProbe {
    version(port: number): Promise<ProbeResult<CdpVersion>>;
    targets(port: number): Promise<ProbeResult<readonly CdpTarget[]>>;
}

export class ForeignPortError extends Error {
    constructor(readonly port: number, detail: string) {
        super(`Port ${port} is answering, but it is ${detail}, not Vortex. Set vortexHelper.debugPort to a free port.`);
        this.name = 'ForeignPortError';
    }
}

export class CdpTimeoutError extends Error {
    constructor(readonly reached: 'nothing' | 'browser-only', port: number, timeoutMs: number) {
        super(reached === 'nothing'
            ? `Vortex didn't open the debugging port on ${port} within ${Math.round(timeoutMs / 1000)} seconds.`
            : `Vortex opened the debugging port but no window appeared within ${Math.round(timeoutMs / 1000)} seconds. It may be waiting on a dialog or an update.`);
        this.name = 'CdpTimeoutError';
    }
}

// node:http rather than fetch: the extension host routes fetch through its proxy settings, and a
// proxy without a localhost bypass turns a loopback probe into a timeout that looks like a dead port
function requestJson(port: number, path: string): Promise<ProbeResult<unknown>> {
    return new Promise(resolve => {
        // 127.0.0.1, not localhost, because Chromium binds the debugging port to IPv4 only
        const request = http.request({ host: '127.0.0.1', port, path, agent: new http.Agent({ keepAlive: false }) }, response => {
            let body = '';
            response.setEncoding('utf8');
            response.on('data', (chunk: string) => {
                if (body.length < MAX_BODY_BYTES) {
                    body += chunk;
                }
            });
            response.on('end', () => {
                if (response.statusCode !== 200) {
                    resolve({ status: 'foreign', detail: `an HTTP server answering ${response.statusCode}` });
                    return;
                }
                try {
                    resolve({ status: 'ok', value: JSON.parse(body) });
                } catch {
                    resolve({ status: 'foreign', detail: 'an HTTP server that doesn\'t speak the DevTools protocol' });
                }
            });
            response.on('error', () => resolve({ status: 'closed' }));
        });
        request.setTimeout(REQUEST_TIMEOUT_MS, () => request.destroy());
        request.on('error', () => resolve({ status: 'closed' }));
        request.end();
    });
}

function asVersion(value: unknown): ProbeResult<CdpVersion> {
    const browser = (value as { Browser?: unknown } | undefined)?.Browser;
    return typeof browser === 'string'
        ? { status: 'ok', value: { browser } }
        : { status: 'foreign', detail: 'an HTTP server that doesn\'t speak the DevTools protocol' };
}

export const HTTP_CDP: CdpProbe = {
    async version(port) {
        const result = await requestJson(port, '/json/version');
        return result.status === 'ok' ? asVersion(result.value) : result;
    },
    async targets(port) {
        const result = await requestJson(port, '/json/list');
        if (result.status !== 'ok') {
            return result;
        }
        return Array.isArray(result.value)
            ? { status: 'ok', value: result.value as readonly CdpTarget[] }
            : { status: 'foreign', detail: 'an HTTP server that doesn\'t speak the DevTools protocol' };
    },
};

/**
 * The window extensions run in, once Vortex has finished starting.
 *
 * Vortex shows a splash screen first, which is an attachable page of its own and closes when the
 * main window is shown, so it doubles as the signal that the renderer is up. Attaching before that
 * lands in the middle of extension initialisation: a breakpoint in a game's `setup` is then hit
 * before the debugger has a session that can report it, which pauses Vortex with no way to resume.
 */
export function pickPageTarget(targets: readonly CdpTarget[]): CdpTarget | undefined {
    const attachable = targets.filter(target => ATTACHABLE_TYPES.has(target.type) && !target.url.startsWith('devtools://'));
    if (attachable.some(target => SPLASH_WINDOW.test(target.url))) {
        return undefined;
    }
    return attachable.find(target => MAIN_WINDOW.test(target.url)) ?? attachable[0];
}

export interface WaitOptions {
    readonly timeoutMs?: number;
    readonly intervalMs?: number;
    readonly token?: vscode.CancellationToken;
    readonly onProgress?: (phase: 'waiting' | 'browser') => void;
}

/**
 * Polls until Vortex's window is attachable, so the debugger never races Electron's startup.
 *
 * @throws CdpTimeoutError, ForeignPortError, vscode.CancellationError
 */
export async function waitForPageTarget(probe: CdpProbe, port: number, options: WaitOptions = {}): Promise<CdpTarget> {
    const timeoutMs = options.timeoutMs ?? VORTEX_READY_TIMEOUT_MS;
    const intervalMs = options.intervalMs ?? VORTEX_PROBE_INTERVAL_MS;
    const deadline = Date.now() + timeoutMs;
    let sawBrowser = false;

    while (Date.now() < deadline) {
        if (options.token?.isCancellationRequested) {
            throw new vscode.CancellationError();
        }
        const version = await probe.version(port);
        if (version.status === 'foreign') {
            throw new ForeignPortError(port, version.detail);
        }
        if (version.status === 'ok') {
            if (!sawBrowser) {
                sawBrowser = true;
                options.onProgress?.('browser');
            }
            const targets = await probe.targets(port);
            if (targets.status === 'foreign') {
                throw new ForeignPortError(port, targets.detail);
            }
            if (targets.status === 'ok') {
                const page = pickPageTarget(targets.value);
                if (page) {
                    return page;
                }
            }
        } else {
            options.onProgress?.('waiting');
        }
        await new Promise(resolve => setTimeout(resolve, intervalMs));
    }

    throw new CdpTimeoutError(sawBrowser ? 'browser-only' : 'nothing', port, timeoutMs);
}
