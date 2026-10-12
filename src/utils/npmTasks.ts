import * as vscode from 'vscode';
import { PACKAGE_JSON_PATH } from '../templates/registry';
import { readTextIfExists } from './fileSystemUtils';
import { isRecord, parseLenientJson } from './jsonUtils';
import { runTask } from './taskUtils';

const INSTALL_DEPS_SCRIPT = 'install-deps';

interface RequiredTool {
    readonly command: string;
    readonly name: string;
    readonly reason: string;
}

const REQUIRED_TOOLS: readonly RequiredTool[] = [
    { command: 'node', name: 'Node.js', reason: 'Node.js and npm install the dependencies and build the extension' },
    { command: 'git', name: 'Git', reason: 'npm installs vortex-api from GitHub' },
];

export class CommandFailedError extends Error {
    constructor(readonly commandLine: string, readonly exitCode: number | undefined, hint?: string) {
        super(`${exitCode === undefined ? `"${commandLine}" ended without an exit code.` : `"${commandLine}" exited with code ${exitCode}.`}${hint ? ` ${hint}` : ''}`);
        this.name = 'CommandFailedError';
    }
}

/** Runs `node --version` and `git --version` in the folder's shell, which may find other tools than the extension host */
export async function ensureToolsAvailable(folder: vscode.WorkspaceFolder): Promise<void> {
    for (const tool of REQUIRED_TOOLS) {
        const exitCode = await runTask(folder, `${tool.command} --version`, new vscode.ShellExecution(tool.command, ['--version']), { reveal: vscode.TaskRevealKind.Never });
        if (exitCode !== 0) {
            throw new CommandFailedError(`${tool.command} --version`, exitCode, `${tool.name} is needed because ${tool.reason}. Install it, restart VS Code and try again.`);
        }
    }
}

/** Runs `npm run install-deps`, or `npm install --ignore-scripts` for a project without that script */
export async function installDependencies(folder: vscode.WorkspaceFolder): Promise<void> {
    const args = await hasScript(folder, INSTALL_DEPS_SCRIPT) ? ['run', INSTALL_DEPS_SCRIPT] : ['install', '--ignore-scripts'];
    await runNpm(folder, args, 'If npm reports ERESOLVE, @types/bluebird must equal the version vortex-api requires as a peer.');
}

/** Installs a package as a devDependency without running its install scripts, which would build native modules */
export async function installDevDependency(folder: vscode.WorkspaceFolder, source: string): Promise<void> {
    await runNpm(folder, ['install', '--ignore-scripts', '--save-dev', source]);
}

async function runNpm(folder: vscode.WorkspaceFolder, args: string[], hint?: string): Promise<void> {
    const commandLine = ['npm', ...args].join(' ');
    const exitCode = await runTask(folder, commandLine, new vscode.ShellExecution('npm', args), { reveal: vscode.TaskRevealKind.Always });
    if (exitCode !== 0) {
        throw new CommandFailedError(commandLine, exitCode, ['See the terminal for npm\'s output.', hint].filter(Boolean).join(' '));
    }
}

async function hasScript(folder: vscode.WorkspaceFolder, script: string): Promise<boolean> {
    const text = await readTextIfExists(vscode.Uri.joinPath(folder.uri, PACKAGE_JSON_PATH));
    const manifest = text === undefined ? undefined : parseLenientJson(text);
    return isRecord(manifest) && isRecord(manifest.scripts) && typeof manifest.scripts[script] === 'string';
}
