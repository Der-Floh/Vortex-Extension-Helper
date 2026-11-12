import * as path from 'path';
import { log, types } from 'vortex-api';
import { GAME } from '../common/constants';
import { fileExistsAsync } from '../common/files';
import { getDiscovery } from '../detection/discovery';
import { removeStaleGmlCaches } from './caches';
import { GML } from './constants';

/**
 * Start hook for every program Vortex starts. For this game with Godot Mod
 * Loader installed, it adds the loader's setup arguments, which set the loader
 * up again after game updates and do nothing otherwise, and removes caches
 * left from an older game version.
 *
 * Never rejects, since a rejected start hook cancels the launch.
 *
 * @param api - Vortex extension API.
 * @param call - The program, arguments and options Vortex is about to start.
 * @returns A promise resolving to the call to start.
 */
export async function prepareGameLaunch(api: types.IExtensionApi, call: types.IRunParameters): Promise<types.IRunParameters> {
    try {
        return await withGmlSetup(api, call);
    } catch (err) {
        log('warn', `Failed to add the ${GML.name} setup to the launch: ${err}`);
        return call;
    }
}

/**
 * Adds the setup arguments if the call starts this game and the working
 * directory has Godot Mod Loader's setup script.
 *
 * @param api - Vortex extension API.
 * @param call - The program, arguments and options Vortex is about to start.
 * @returns A promise resolving to the call to start.
 */
async function withGmlSetup(api: types.IExtensionApi, call: types.IRunParameters): Promise<types.IRunParameters> {
    const discovery = getDiscovery(api);
    if (discovery?.path === undefined || !isGameExecutable(call.executable, discovery) || call.args.includes(GML.scriptArgument)) {
        return call;
    }
    if (!(await fileExistsAsync(path.join(workingDirectory(call), GML.setupScript)))) {
        return call;
    }
    await removeStaleGmlCaches(discovery)
        .catch(err => log('warn', `Failed to remove stale ${GML.name} caches: ${err}`));
    return { ...call, args: [...GML.setupArgs, ...call.args] };
}

/**
 * Checks whether an executable is the discovered game's executable.
 *
 * @param executable - Absolute path of the program being started.
 * @param discovery - The game discovery result from Vortex.
 * @returns True if both paths point to the same file.
 */
function isGameExecutable(executable: string, discovery: types.IDiscoveryResult): boolean {
    return path.relative(executable, path.join(discovery.path!, discovery.executable ?? GAME.exePath)) === '';
}

/**
 * Resolves the working directory the same way Vortex does when it starts a program.
 *
 * @param call - The program, arguments and options Vortex is about to start.
 * @returns The absolute working directory.
 */
function workingDirectory(call: types.IRunParameters): string {
    return call.options.cwd || path.dirname(call.executable);
}
