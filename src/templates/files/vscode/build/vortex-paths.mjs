// Where the build output goes and where Vortex loads extensions from. Shared by the deploy and
// start scripts: if they resolved the plugins folder separately and ever disagreed, starting a
// debug session would report the extension as deleted when it was only looked for in the wrong place.
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('../..', import.meta.url));
export const PACK_DIR = join(ROOT, '.pack');

/** The id names a folder inside Vortex's plugins folder, so a value like `..` must not get that far */
const ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/i;

/** Vortex's plugins folder. `VORTEX_PLUGINS` points the scripts at a second installation. */
export function pluginsDir() {
    if (process.env.VORTEX_PLUGINS) {
        return process.env.VORTEX_PLUGINS;
    }
    if (process.platform === 'win32') {
        if (!process.env.APPDATA) {
            throw new Error('APPDATA is not set, so Vortex\'s plugins folder can\'t be found. Set VORTEX_PLUGINS.');
        }
        return join(process.env.APPDATA, 'Vortex', 'plugins');
    }
    if (process.platform === 'darwin') {
        return join(homedir(), 'Library', 'Application Support', 'Vortex', 'plugins');
    }
    return join(process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'), 'Vortex', 'plugins');
}

/** The folder `npm run deploy` copies the extension into, which is the one Vortex loads it from */
export function deployedDir(id) {
    return join(pluginsDir(), id);
}

/** The manifest the build generated, with its id checked */
export function readPackInfo() {
    const infoPath = join(PACK_DIR, 'info.json');
    if (!existsSync(join(PACK_DIR, 'index.js')) || !existsSync(infoPath)) {
        throw new Error('.pack is not built. Run "npm run build" first.');
    }
    const info = JSON.parse(readFileSync(infoPath, 'utf8'));
    if (typeof info.id !== 'string' || !ID_PATTERN.test(info.id)) {
        throw new Error(`.pack/info.json has 'id' set to '${info.id}', which is not a usable extension folder name.`);
    }
    return info;
}
