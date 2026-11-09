// Starts Vortex with its DevTools port open and waits until its window is attachable, so the
// debugger never races Electron's startup. A release Vortex opens no port on its own, and its
// single instance lock makes a second launch quit instead of opening a window, so Vortex has to
// be closed before this runs.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { request } from 'node:http';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { deployedDir, readPackInfo } from './vortex-paths.mjs';

const PORT = Number(process.env.VORTEX_DEBUG_PORT ?? {{debugPort}});
const READY_TIMEOUT_MS = 90_000;
const PROBE_INTERVAL_MS = 250;
const REQUEST_TIMEOUT_MS = 3_000;
/** What the debugger can attach to, so these are what "Vortex is ready" is decided by */
const ATTACHABLE_TYPES = new Set(['page', 'iframe']);
const SPLASH_WINDOW = /\/splash\.html(\?|$)/i;
const MAIN_WINDOW = /\/index\.html(\?|$)/i;

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

try {
    await main();
} catch (error) {
    console.error(error.message);
    process.exitCode = 1;
}

async function main() {
    const deployedEntry = join(deployedDir(readPackInfo().id), 'index.js');

    if ((await probeVortex()).window) {
        console.warn([
            `WARNING: Vortex is already running with the debugging port open on ${PORT}.`,
            '         Vortex loads extensions once, so the build that was just deployed is NOT loaded,',
            '         and breakpoints may bind to the lines of the build Vortex still has.',
            '         Close Vortex and start the debug session again to load it.',
        ].join('\n'));
        return;
    }

    const candidates = exeCandidates();
    const exe = candidates.find(candidate => existsSync(candidate));
    if (exe === undefined) {
        throw new Error(`Vortex was not found. Looked in:\n${candidates.join('\n')}\nSet VORTEX_EXE to the Vortex you want to debug against.`);
    }

    const child = spawn(exe, [`--remote-debugging-port=${PORT}`, '--remote-allow-origins=*'], { detached: true, stdio: 'ignore' });
    console.log(`Started ${exe} with the debugging port on ${PORT}.`);
    try {
        const window = await waitForWindow(child);
        // Vortex deletes extension folders while it starts, for a removal that is still pending
        // from its Extensions page or for an id a bundled extension already claims
        if (!existsSync(deployedEntry)) {
            throw new Error([
                `Vortex deleted ${deployedEntry} while it started, so there is nothing to debug.`,
                'Vortex finishes a removal from its Extensions page at its next start, and it also drops',
                'an extension whose id a bundled one already claims. The removal is done now, so closing',
                'Vortex and starting the debug session again deploys it for good.',
            ].join('\n'));
        }
        console.log(`Vortex is ready to attach to: ${window.url}`);
    } finally {
        // stops this script from outliving its own work by waiting on the process it started
        child.unref();
    }
}

/** @returns The window to attach to, once Vortex has one. @throws if Vortex quits or takes too long. */
async function waitForWindow(child) {
    let quitCode;
    child.once('exit', code => { quitCode = code ?? 0; });

    const deadline = Date.now() + READY_TIMEOUT_MS;
    let sawPort = false;
    while (Date.now() < deadline) {
        if (quitCode !== undefined) {
            throw new Error(quitCode === 0
                ? 'Vortex quit right after starting, which happens when another Vortex already holds its single instance lock. Close every Vortex window and try again.'
                : `Vortex exited with code ${quitCode} before its window appeared.`);
        }
        const { portOpen, window } = await probeVortex();
        if (window) {
            return window;
        }
        sawPort ||= portOpen;
        await wait(PROBE_INTERVAL_MS);
    }

    throw new Error(sawPort
        ? 'Vortex opened the debugging port but no window appeared in time. It may be waiting on a dialog or an update.'
        : `Vortex didn't open the debugging port on ${PORT} in time.`);
}

/** Whether the debugging port answers, and the window to attach to if Vortex has finished starting */
async function probeVortex() {
    if (await getJson('/json/version') === undefined) {
        return { portOpen: false };
    }
    const targets = await getJson('/json/list');
    return { portOpen: true, window: Array.isArray(targets) ? attachableWindow(targets) : undefined };
}

function attachableWindow(targets) {
    const attachable = targets.filter(target => ATTACHABLE_TYPES.has(target.type) && !String(target.url).startsWith('devtools://'));
    // the splash closes when the main window is shown, so while it is up the renderer is still
    // starting; attaching then leaves a breakpoint in a game's setup paused with no debugger
    // session able to report it, which looks like Vortex hanging
    if (attachable.some(target => SPLASH_WINDOW.test(String(target.url)))) {
        return undefined;
    }
    return attachable.find(target => MAIN_WINDOW.test(String(target.url))) ?? attachable[0];
}

function getJson(path) {
    return new Promise(resolve => {
        const req = request({ host: '127.0.0.1', port: PORT, path }, response => {
            let body = '';
            response.setEncoding('utf8');
            response.on('data', chunk => { body += chunk; });
            response.on('end', () => {
                try {
                    resolve(JSON.parse(body));
                } catch {
                    resolve(undefined);
                }
            });
        });
        req.setTimeout(REQUEST_TIMEOUT_MS, () => req.destroy());
        req.on('error', () => resolve(undefined));
        req.end();
    });
}

function exeCandidates() {
    if (process.env.VORTEX_EXE) {
        return [process.env.VORTEX_EXE];
    }
    if (process.platform === 'win32') {
        return [
            [process.env.PROGRAMFILES, ''],
            [process.env.LOCALAPPDATA, 'Programs'],
        ].flatMap(([root, middle]) => root ? ['Black Tree Gaming Ltd', ''].map(publisher => join(root, middle, publisher, 'Vortex', 'Vortex.exe')) : []);
    }
    if (process.platform === 'darwin') {
        return ['/Applications/Vortex.app/Contents/MacOS/Vortex'];
    }
    return [join(homedir(), '.local', 'bin', 'Vortex'), '/usr/bin/vortex', '/usr/local/bin/vortex'];
}
