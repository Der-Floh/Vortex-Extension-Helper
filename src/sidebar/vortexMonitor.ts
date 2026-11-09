import * as vscode from 'vscode';
import { DEBUG_PORT_DEFAULT, SIDEBAR_PROBE_INTERVAL_MS, SIDEBAR_PROBES_PER_SLOW_TICK } from '../constants';
import { HTTP_CDP, type CdpProbe, vortexWindowState } from '../debug/cdpProbe';
import { isVortexDebugSession, VSCODE_DEBUG, type DebugHost } from '../debug/debugSessionWatcher';
import { SYSTEM_LAUNCHER, type VortexLauncher } from '../debug/vortexLauncher';
import { getConfiguration } from '../utils/configuration';

export type VortexPhase = 'unknown' | 'stopped' | 'running-without-port' | 'starting' | 'ready' | 'foreign';

const RUNNING_PHASES: ReadonlySet<VortexPhase> = new Set<VortexPhase>(['running-without-port', 'starting', 'ready']);
const PORT_CLOSED_PHASES: ReadonlySet<VortexPhase> = new Set<VortexPhase>(['stopped', 'running-without-port']);

export interface VortexMonitorDeps {
    readonly cdp?: CdpProbe;
    readonly launcher?: VortexLauncher;
    readonly debug?: Pick<DebugHost, 'onDidStartDebugSession' | 'onDidTerminateDebugSession'>;
    readonly port?: () => number;
    readonly intervalMs?: number;
    readonly probesPerSlowTick?: number;
}

/** Watches Vortex while somebody can see the result: the port every probe, the process list only now and then */
export class VortexMonitor implements vscode.Disposable {
    private readonly _onDidChange = new vscode.EventEmitter<void>();
    /** Fires when the phase changes and when a debug session attaches or ends */
    readonly onDidChange = this._onDidChange.event;

    private readonly _onDidSlowTick = new vscode.EventEmitter<void>();
    /** Fires every few probes, for whatever else is worth looking at on that schedule */
    readonly onDidSlowTick = this._onDidSlowTick.event;

    private readonly cdp: CdpProbe;
    private readonly launcher: VortexLauncher;
    private readonly port: () => number;
    private readonly intervalMs: number;
    private readonly probesPerSlowTick: number;

    /** The folder of each session attached to Vortex, by session id */
    private readonly _sessions = new Map<string, string | undefined>();
    private readonly _subscriptions: vscode.Disposable[];

    private _phase: VortexPhase = 'unknown';
    private _processRunning: boolean | undefined;
    private _probes = 0;
    private _active = false;
    /** Changes when polling starts or stops, so a probe still under way can't reschedule itself */
    private _run = 0;
    private _timer: ReturnType<typeof setTimeout> | undefined;

    constructor(deps: VortexMonitorDeps = {}) {
        this.cdp = deps.cdp ?? HTTP_CDP;
        this.launcher = deps.launcher ?? SYSTEM_LAUNCHER;
        this.port = deps.port ?? (() => getConfiguration().debugPort ?? DEBUG_PORT_DEFAULT);
        this.intervalMs = deps.intervalMs ?? SIDEBAR_PROBE_INTERVAL_MS;
        this.probesPerSlowTick = deps.probesPerSlowTick ?? SIDEBAR_PROBES_PER_SLOW_TICK;
        const debug = deps.debug ?? VSCODE_DEBUG;
        this._subscriptions = [
            debug.onDidStartDebugSession(session => this.onSessionStarted(session)),
            debug.onDidTerminateDebugSession(session => this.onSessionEnded(session)),
        ];
    }

    get phase(): VortexPhase {
        return this._phase;
    }

    get isVortexRunning(): boolean {
        return RUNNING_PHASES.has(this._phase);
    }

    get currentPort(): number {
        return this.port();
    }

    isAttached(folder: vscode.WorkspaceFolder): boolean {
        return [...this._sessions.values()].includes(folder.uri.toString());
    }

    setActive(active: boolean): void {
        if (active === this._active) {
            return;
        }
        this._active = active;
        this._run += 1;
        clearTimeout(this._timer);
        if (active) {
            void this.probe(this._run);
        }
    }

    dispose(): void {
        this.setActive(false);
        this._subscriptions.forEach(subscription => subscription.dispose());
        this._onDidChange.dispose();
        this._onDidSlowTick.dispose();
    }

    /** Reschedules itself once it is done, so a slow answer can't make probes pile up */
    private async probe(run: number): Promise<void> {
        const phase = await this.readPhase();
        if (run !== this._run) {
            return;
        }
        this.setPhase(phase);
        this._probes += 1;
        if (this._probes % this.probesPerSlowTick === 0) {
            this._onDidSlowTick.fire();
        }
        this._timer = setTimeout(() => void this.probe(run), this.intervalMs);
    }

    private async readPhase(): Promise<VortexPhase> {
        const targets = await this.cdp.targets(this.port());
        if (targets.status === 'foreign') {
            return 'foreign';
        }
        if (targets.status === 'ok') {
            const state = vortexWindowState(targets.value);
            return state === 'other' ? 'foreign' : state;
        }
        return await this.isProcessRunning() ? 'running-without-port' : 'stopped';
    }

    /** Asks at once when the port has just closed, and otherwise only every few probes because it starts a process */
    private async isProcessRunning(): Promise<boolean> {
        if (!PORT_CLOSED_PHASES.has(this._phase) || this._probes % this.probesPerSlowTick === 0) {
            this._processRunning = await this.launcher.isVortexRunning();
        }
        return this._processRunning === true;
    }

    private setPhase(phase: VortexPhase): void {
        if (phase !== this._phase) {
            this._phase = phase;
            this._onDidChange.fire();
        }
    }

    private onSessionStarted(session: vscode.DebugSession): void {
        if (isVortexDebugSession(session)) {
            this._sessions.set(session.id, session.workspaceFolder?.uri.toString());
            this._onDidChange.fire();
        }
    }

    private onSessionEnded(session: vscode.DebugSession): void {
        if (this._sessions.delete(session.id)) {
            this._onDidChange.fire();
        }
    }
}
