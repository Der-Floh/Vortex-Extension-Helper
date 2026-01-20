import * as vscode from 'vscode';
import { EXTENSION_NAME, log } from '../extension';
import { RequiredFiles } from '../constants/requiredFile';
import { VortexCompletionProvider } from '../completions/vortexCompletionProvider';

export enum VortexWorkspaceType {
    None,
    JavaScript,
    TypeScript
}

export async function getWorkspaceRootUri(): Promise<vscode.Uri> {
    log.debug(`${EXTENSION_NAME}: Getting workspace root URI`);
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        log.error(`${EXTENSION_NAME}: No workspace folder is open.`);
        throw new Error('Open a folder first to get the workspace root URI.');
    }

    if (workspaceFolders.length === 1) {
        log.debug(`${EXTENSION_NAME}: Single workspace folder detected: "${workspaceFolders[0].name}"`);
        return workspaceFolders[0].uri;
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
        log.error(`${EXTENSION_NAME}: Selected workspace folder not found.`);
        throw new Error('Selected workspace folder not found.');
    }
    log.debug(`${EXTENSION_NAME}: User selected workspace folder: "${workspaceChoice}"`);

    return selectedWorkspace.uri;
}

export async function getVortexWorkspaceType(rootUri?: vscode.Uri) {
    log.debug(`${EXTENSION_NAME}: Determining Vortex workspace type`);
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

        log.debug(`${EXTENSION_NAME}: Found ${matchesJs.length} jsconfig.json files`);
        log.debug(`${EXTENSION_NAME}: Found ${matchesTs.length} tsconfig.json files`);

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
    log.debug(`${EXTENSION_NAME}: Checking if workspace type "${type}" is Vortex workspace type`);
    return type === VortexWorkspaceType.JavaScript || type === VortexWorkspaceType.TypeScript;
}

export function ensureVortexWorkspaceType(type: VortexWorkspaceType) {
    log.debug(`${EXTENSION_NAME}: Ensuring Vortex workspace type`);
    if (!isVortexWorkspaceType(type)) {
        log.error(`${EXTENSION_NAME}: The current workspace is not a Vortex API workspace.`);
        throw new Error('The current workspace is not a Vortex API workspace.');
    }
}

export async function getRequiredFilesForWorkspace(rootUri?: vscode.Uri) {
    log.debug(`${EXTENSION_NAME}: Determining required files for workspace`);
    let workspaceType;
    try {
        workspaceType = await getVortexWorkspaceType(rootUri);
        ensureVortexWorkspaceType(workspaceType);
    } catch (err) {
        log.error(`${EXTENSION_NAME}: No Vortex workspace type detected: ${String(err)}`);
        vscode.window.showErrorMessage(String(err));
        return [];
    }

    return getRequiredFiles(workspaceType);
}

export function getRequiredFiles(workspaceType: VortexWorkspaceType) {
    switch (workspaceType) {
        case VortexWorkspaceType.JavaScript:
            log.debug(`${EXTENSION_NAME}: Providing Js required files: ${RequiredFiles.JS.map(f => f.fileName).join(', ')}`);
            return RequiredFiles.JS;
        case VortexWorkspaceType.TypeScript:
            log.debug(`${EXTENSION_NAME}: Providing Ts required files: ${RequiredFiles.TS.map(f => f.fileName).join(', ')}`);
            return RequiredFiles.TS;
        default:
            log.debug(`${EXTENSION_NAME}: No required files for workspace type`);
            return [];
    }
}

export async function getVortexCompletionProvider(rootUri?: vscode.Uri) {
    log.debug(`${EXTENSION_NAME}: Getting VortexCompletionProvider for workspace`);
    let workspaceType;
    try {
        workspaceType = await getVortexWorkspaceType(rootUri);
        ensureVortexWorkspaceType(workspaceType);
    } catch (err) {
        log.error(`${EXTENSION_NAME}: No Vortex workspace type detected: ${String(err)}`);
        vscode.window.showErrorMessage(String(err));
        return;
    }

    switch (workspaceType) {
        case VortexWorkspaceType.JavaScript:
            log.debug(`${EXTENSION_NAME}: Providing VortexCompletionProviderJs`);
            return { instance: new VortexCompletionProvider.JS(), language: 'javascript' };
        case VortexWorkspaceType.TypeScript:
            log.debug(`${EXTENSION_NAME}: Providing VortexCompletionProviderTs`);
            return { instance: new VortexCompletionProvider.TS(), language: 'typescript' };
        default:
            log.debug(`${EXTENSION_NAME}: No completion provider for workspace type`);
            return;
    }
}
