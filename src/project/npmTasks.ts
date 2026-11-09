import * as vscode from 'vscode';
import { PACKAGE_JSON_PATH } from '../constants';
import { readTextIfExists, saveDirtyDocuments } from '../utils/fileSystemUtils';
import { parseLenientJson } from '../utils/jsonUtils';
import { runTask } from '../utils/taskUtils';
import { declaresScript } from './projectManifest';

const INSTALL_DEPS_SCRIPT = 'install-deps';
const BUILD_SCRIPT = 'build';
const PACKAGE_SCRIPT = 'package';

interface RequiredTool {
    readonly command: string;
    readonly name: string;
    readonly reason: string;
}

const REQUIRED_TOOLS: readonly RequiredTool[] = [
    { command: 'node', name: 'Node.js', reason: 'Node.js and npm install the dependencies and build the extension' },
    { command: 'git', name: 'Git', reason: 'npm installs vortex-api from GitHub' },
];

export class MissingScriptError extends Error {
    constructor(readonly script: string, folderName: string) {
        super(`${folderName} has no "${script}" script in its package.json.`);
        this.name = 'MissingScriptError';
    }
}

export class CommandFailedError extends Error {
    constructor(readonly commandLine: string, readonly exitCode: number | undefined, hint?: string) {
        super(`${exitCode === undefined ? `"${commandLine}" ended without an exit code.` : `"${commandLine}" exited with code ${exitCode}.`}${hint ? ` ${hint}` : ''}`);
        this.name = 'CommandFailedError';
    }
}

export class UnsavedFilesError extends Error {
    constructor() {
        super('Some of the project\'s files couldn\'t be saved, so the build would not match the editor.');
        this.name = 'UnsavedFilesError';
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

export async function uninstallDependency(folder: vscode.WorkspaceFolder, name: string): Promise<void> {
    await runNpm(folder, ['uninstall', '--ignore-scripts', name]);
}

/** A build reads the files on disk, so what the editor shows has to be saved first */
export async function saveForBuild(folder: vscode.WorkspaceFolder): Promise<void> {
    if (!await saveDirtyDocuments(folder.uri)) {
        throw new UnsavedFilesError();
    }
}

/** Runs `npm run build`, which bundles src into .pack and generates .pack/info.json */
export function runBuild(folder: vscode.WorkspaceFolder, token?: vscode.CancellationToken): Promise<void> {
    return runScript(folder, BUILD_SCRIPT, token);
}

/** Runs `npm run package`, which type checks, builds and zips .pack into dist */
export function runPackage(folder: vscode.WorkspaceFolder, token?: vscode.CancellationToken): Promise<void> {
    return runScript(folder, PACKAGE_SCRIPT, token);
}

async function runScript(folder: vscode.WorkspaceFolder, script: string, token?: vscode.CancellationToken): Promise<void> {
    if (!await hasScript(folder, script)) {
        throw new MissingScriptError(script, folder.name);
    }
    await runNpm(folder, ['run', script], undefined, token);
}

async function runNpm(folder: vscode.WorkspaceFolder, args: string[], hint?: string, token?: vscode.CancellationToken): Promise<void> {
    const commandLine = ['npm', ...args].join(' ');
    const exitCode = await runTask(folder, terminalNameOf(args), new vscode.ShellExecution('npm', args), { reveal: vscode.TaskRevealKind.Always, token });
    if (exitCode !== 0) {
        throw new CommandFailedError(commandLine, exitCode, ['See the terminal for npm\'s output.', hint].filter(Boolean).join(' '));
    }
}

/** A terminal per script and one for each other npm command, so installing another library doesn't open another terminal */
function terminalNameOf(args: readonly string[]): string {
    return ['npm', ...args.slice(0, args[0] === 'run' ? 2 : 1)].join(' ');
}

async function hasScript(folder: vscode.WorkspaceFolder, script: string): Promise<boolean> {
    const text = await readTextIfExists(vscode.Uri.joinPath(folder.uri, PACKAGE_JSON_PATH));
    return text !== undefined && declaresScript(parseLenientJson(text), script);
}
