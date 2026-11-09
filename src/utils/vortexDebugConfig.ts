import * as path from 'path';
import * as vscode from 'vscode';
import { DEBUG_SESSION_TYPE } from '../constants';

const ENTRY_FILE = 'src/index.ts';
/** The callbacks a generated extension registers, which is everything an attach can reach */
const REACHABLE_CALLBACKS = 'findGame, prepareForModding, queryModPath, executable, testSupported and install';

export interface AttachConfigurationOptions {
    /** The extension id from .pack/info.json, which names the session */
    readonly packId: string;
    readonly folder: vscode.Uri;
    readonly port: number;
}

/** What rollup.config.mjs builds the map's source urls from, and what ${workspaceFolderBasename} resolves to */
function sourceScheme(folder: vscode.Uri): string {
    return path.basename(folder.fsPath);
}

/** Forward slashes, because fsPath is `F:\a\b` on Windows and the override value is concatenated */
function toPosix(uri: vscode.Uri): string {
    return uri.fsPath.replace(/\\/g, '/');
}

/**
 * The attach configuration for Vortex's renderer.
 *
 * `sourceMapPathOverrides` is the whole point: rollup rewrites the bundle's sources to
 * `<packId>:///src/**`, and without the override js-debug would look for them next to the
 * deployed bundle. `outFiles` and `resolveSourceMapLocations` stay unset because the renderer
 * reports the bundle's url as a bare Windows path rather than a `file:` url.
 */
export function vortexAttachConfiguration(options: AttachConfigurationOptions): vscode.DebugConfiguration {
    const workspace = toPosix(options.folder);
    return {
        type: DEBUG_SESSION_TYPE,
        request: 'attach',
        name: `Vortex: ${options.packId}`,
        // 127.0.0.1, not the localhost default, because Chromium binds the port to IPv4 only
        address: '127.0.0.1',
        port: options.port,
        timeout: 30_000,
        // Vortex's splash screen is attachable too and closes moments later, so name the window.
        // No slash before index.html: js-debug turns a file url into a path before matching, and on
        // Windows that path has backslashes, so "*/index.html" matches nothing and the attach hangs.
        urlFilter: '*index.html',
        webRoot: workspace,
        sourceMaps: true,
        sourceMapPathOverrides: { [`${sourceScheme(options.folder)}:///*`]: `${workspace}/*` },
    };
}

/**
 * The warning for breakpoints an attach can never hit, or undefined when there are none.
 *
 * Vortex requires the bundle while its renderer starts, so the module top level and `main()`
 * have already run by the time a debugger can attach.
 */
export function topLevelBreakpointHint(folder: vscode.Uri, breakpoints: readonly vscode.Breakpoint[]): string | undefined {
    const entry = vscode.Uri.joinPath(folder, ENTRY_FILE).toString();
    const inEntry = breakpoints.some(breakpoint => breakpoint instanceof vscode.SourceBreakpoint
        && breakpoint.enabled
        && breakpoint.location.uri.toString() === entry);
    return inEntry
        ? `A breakpoint is set in ${ENTRY_FILE}. Vortex requires the extension while it starts, before a debugger can attach, so breakpoints in the module top level and in main() don't hit. Breakpoints in the callbacks main() registers do: ${REACHABLE_CALLBACKS}.`
        : undefined;
}
