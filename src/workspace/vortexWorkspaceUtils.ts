import * as vscode from 'vscode';
import { RequiredFiles } from '../constants/requiredFile';
import { VortexCompletionProvider } from '../completions/vortexCompletionProvider';
import { Logger } from '../utils/logger';

export enum VortexWorkspaceType {
    None,
    JavaScript,
    TypeScript
}

export async function getWorkspaceFolder(): Promise<vscode.WorkspaceFolder> {
    Logger.debug(`Getting workspace folder`);
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        Logger.error(`No workspace folder is open.`);
        throw new Error('Open a folder first to get the workspace root URI.');
    }

    if (workspaceFolders.length === 1) {
        Logger.debug(`Single workspace folder detected: "${workspaceFolders[0].name}"`);
        return workspaceFolders[0];
    }

    const workspaceChoice = await vscode.window.showQuickPick(
        [...workspaceFolders.map(wf => wf.name)],
        {
            placeHolder: 'Select which workspace folder to use',
            ignoreFocusOut: true,
        }
    );

    const selectedWorkspace = workspaceFolders.find(wf => wf.name === workspaceChoice);
    if (!selectedWorkspace) {
        Logger.error(`Selected workspace folder not found.`);
        throw new Error('Selected workspace folder not found.');
    }
    Logger.debug(`User selected workspace folder: "${workspaceChoice}"`);

    return selectedWorkspace;
}

export async function getWorkspaceRootUri(workspaceFolder?: vscode.WorkspaceFolder): Promise<vscode.Uri> {
    Logger.debug(`Getting workspace root URI`);
    if (!workspaceFolder) {
        workspaceFolder = await getWorkspaceFolder();
    }

    return workspaceFolder.uri;
}

export async function getVortexWorkspaceType(rootUri?: vscode.Uri) {
    Logger.debug(`Determining Vortex workspace type`);
    try {
        if (!rootUri) {
            rootUri = await getWorkspaceRootUri();
        }

        const matchesJs = await vscode.workspace.findFiles(
            '**/jsconfig.json',
            '**/node_modules/**',
            1
        );

        const matchesTs = await vscode.workspace.findFiles(
            '**/tsconfig.json',
            '**/node_modules/**',
            1
        );

        Logger.debug(`Found ${matchesJs.length} jsconfig.json files`);
        Logger.debug(`Found ${matchesTs.length} tsconfig.json files`);

        if (matchesTs.length !== 0) {
            return VortexWorkspaceType.TypeScript;
        }
        if (matchesJs.length !== 0) {
            return VortexWorkspaceType.JavaScript;
        }

        return VortexWorkspaceType.None;
    } catch {
        return VortexWorkspaceType.None;
    }
}

export function isVortexWorkspaceType(type: VortexWorkspaceType) {
    Logger.debug(`Checking if workspace type "${type}" is Vortex workspace type`);
    return type === VortexWorkspaceType.JavaScript || type === VortexWorkspaceType.TypeScript;
}

export function ensureVortexWorkspaceType(type: VortexWorkspaceType) {
    Logger.debug(`Ensuring Vortex workspace type`);
    if (!isVortexWorkspaceType(type)) {
        Logger.error(`The current workspace is not a Vortex API workspace.`);
        throw new Error('The current workspace is not a Vortex API workspace.');
    }
}

export async function getRequiredFilesForWorkspace(rootUri?: vscode.Uri) {
    Logger.debug(`Determining required files for workspace`);
    let workspaceType;
    try {
        workspaceType = await getVortexWorkspaceType(rootUri);
        ensureVortexWorkspaceType(workspaceType);
    } catch (err) {
        Logger.error(`No Vortex workspace type detected: ${String(err)}`);
        vscode.window.showErrorMessage(String(err));
        return [];
    }

    return getRequiredFiles(workspaceType);
}

export function getRequiredFiles(workspaceType: VortexWorkspaceType) {
    switch (workspaceType) {
        case VortexWorkspaceType.JavaScript:
            Logger.debug(`Providing Js required files: ${RequiredFiles.JS.map(f => f.fileName).join(', ')}`);
            return RequiredFiles.JS;
        case VortexWorkspaceType.TypeScript:
            Logger.debug(`Providing Ts required files: ${RequiredFiles.TS.map(f => f.fileName).join(', ')}`);
            return RequiredFiles.TS;
        default:
            Logger.debug(`No required files for workspace type`);
            return [];
    }
}

export async function getVortexCompletionProvider(rootUri?: vscode.Uri) {
    Logger.debug(`Getting VortexCompletionProvider for workspace`);
    let workspaceType;
    try {
        workspaceType = await getVortexWorkspaceType(rootUri);
        ensureVortexWorkspaceType(workspaceType);
    } catch (err) {
        Logger.error(`No Vortex workspace type detected: ${String(err)}`);
        vscode.window.showErrorMessage(String(err));
        return;
    }

    switch (workspaceType) {
        case VortexWorkspaceType.JavaScript:
            Logger.debug(`Providing VortexCompletionProviderJs`);
            return { instance: new VortexCompletionProvider.JS(), language: 'javascript' };
        case VortexWorkspaceType.TypeScript:
            Logger.debug(`Providing VortexCompletionProviderTs`);
            return { instance: new VortexCompletionProvider.TS(), language: 'typescript' };
        default:
            Logger.debug(`No completion provider for workspace type`);
            return;
    }
}
