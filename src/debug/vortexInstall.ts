import * as path from 'path';
import * as vscode from 'vscode';
import { SETTING_VORTEX_EXECUTABLE, SETTING_VORTEX_PLUGINS_FOLDER } from '../constants';
import type { HelperConfiguration } from '../utils/configuration';
import { fileExists } from '../utils/fileSystemUtils';

export interface VortexInstall {
    readonly exe: string;
    /** The folder Vortex loads dynamic extensions from */
    readonly pluginsFolder: vscode.Uri;
}

export class VortexNotFoundError extends Error {
    constructor(readonly candidates: readonly string[]) {
        super(candidates.length === 1
            ? `${candidates[0]} doesn't exist. Set ${SETTING_VORTEX_EXECUTABLE} to the Vortex you want to debug against.`
            : `No Vortex installation was found. Set ${SETTING_VORTEX_EXECUTABLE} to the Vortex you want to debug against.`);
        this.name = 'VortexNotFoundError';
    }
}

export class PluginsFolderMissingError extends Error {
    constructor(readonly folder: vscode.Uri) {
        super(`${folder.fsPath} doesn't exist, so Vortex has probably never run on this machine. Start Vortex once, or set ${SETTING_VORTEX_PLUGINS_FOLDER}.`);
        this.name = 'PluginsFolderMissingError';
    }
}

/** Vortex installs for all users or just one, and under its publisher's name or plain */
export function vortexExeCandidates(platform: NodeJS.Platform, env: NodeJS.ProcessEnv): string[] {
    if (platform === 'win32') {
        const roots = [
            [env.PROGRAMFILES, ''],
            [env.LOCALAPPDATA, 'Programs'],
        ] as const;
        return roots.flatMap(([root, middle]) => root === undefined
            ? []
            : ['Black Tree Gaming Ltd', ''].map(publisher => path.join(root, middle, publisher, 'Vortex', 'Vortex.exe')));
    }
    if (platform === 'linux') {
        return [
            ...(env.HOME === undefined ? [] : [path.join(env.HOME, '.local', 'bin', 'Vortex')]),
            '/usr/bin/vortex',
            '/usr/local/bin/vortex',
        ];
    }
    if (platform === 'darwin') {
        return ['/Applications/Vortex.app/Contents/MacOS/Vortex'];
    }
    return [];
}

/** Vortex's user data folder for a platform, which holds `plugins` */
export function vortexUserDataFolder(platform: NodeJS.Platform, env: NodeJS.ProcessEnv): string | undefined {
    if (platform === 'win32') {
        return env.APPDATA === undefined ? undefined : path.join(env.APPDATA, 'Vortex');
    }
    if (platform === 'darwin') {
        return env.HOME === undefined ? undefined : path.join(env.HOME, 'Library', 'Application Support', 'Vortex');
    }
    const configHome = env.XDG_CONFIG_HOME ?? (env.HOME === undefined ? undefined : path.join(env.HOME, '.config'));
    return configHome === undefined ? undefined : path.join(configHome, 'Vortex');
}

export function defaultPluginsFolder(platform: NodeJS.Platform, env: NodeJS.ProcessEnv): string | undefined {
    const userData = vortexUserDataFolder(platform, env);
    return userData === undefined ? undefined : path.join(userData, 'plugins');
}

/**
 * Where Vortex is and where its extensions go.
 *
 * @throws VortexNotFoundError when no executable exists, PluginsFolderMissingError when Vortex has no user data folder
 */
export async function resolveVortexInstall(
    config: HelperConfiguration,
    platform: NodeJS.Platform = process.platform,
    env: NodeJS.ProcessEnv = process.env,
): Promise<VortexInstall> {
    const configured = config.vortexExecutable?.trim();
    const candidates = configured ? [configured] : vortexExeCandidates(platform, env);
    let exe: string | undefined;
    for (const candidate of candidates) {
        if (await fileExists(vscode.Uri.file(candidate))) {
            exe = candidate;
            break;
        }
    }
    if (exe === undefined) {
        throw new VortexNotFoundError(candidates);
    }

    const configuredFolder = config.vortexPluginsFolder?.trim();
    if (configuredFolder) {
        return { exe, pluginsFolder: vscode.Uri.file(configuredFolder) };
    }
    const userData = vortexUserDataFolder(platform, env);
    const pluginsFolder = defaultPluginsFolder(platform, env);
    if (userData === undefined || pluginsFolder === undefined) {
        throw new PluginsFolderMissingError(vscode.Uri.file('Vortex'));
    }
    // plugins itself is created on demand, but a missing user data folder means Vortex never ran
    if (!await fileExists(vscode.Uri.file(userData))) {
        throw new PluginsFolderMissingError(vscode.Uri.file(userData));
    }
    return { exe, pluginsFolder: vscode.Uri.file(pluginsFolder) };
}
