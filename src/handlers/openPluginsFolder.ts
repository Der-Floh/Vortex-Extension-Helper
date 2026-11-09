import * as vscode from 'vscode';
import { BUILTIN_REVEAL_IN_OS } from '../constants';
import { resolveDeployTarget } from '../debug/debugDialogs';
import { readPackId } from '../debug/packDeployment';
import { pickVortexProject } from '../project/projectPicker';
import type { VortexWorkspaceTracker } from '../project/vortexWorkspaceTracker';
import type { ProjectTarget, VortexProject } from '../types/project';
import { fileExists } from '../utils/fileSystemUtils';
import { showInfo } from '../utils/notifications';

/** Shows Vortex's plugins folder, with the project's deployed extension selected once it has one */
export async function handleOpenPluginsFolder(tracker: VortexWorkspaceTracker, target?: ProjectTarget): Promise<void> {
    const project = await pickVortexProject(tracker, target);
    const pluginsFolder = project && await resolveDeployTarget();
    if (!project || !pluginsFolder) {
        return;
    }
    const revealed = await deployedFolder(project, pluginsFolder) ?? pluginsFolder;
    if (!await fileExists(revealed)) {
        showInfo(`${revealed.fsPath} doesn't exist yet. Vortex creates it the first time it has an extension to keep there.`);
        return;
    }
    await vscode.commands.executeCommand(BUILTIN_REVEAL_IN_OS, revealed);
}

async function deployedFolder(project: VortexProject, pluginsFolder: vscode.Uri): Promise<vscode.Uri | undefined> {
    const id = await readPackId(project.folder.uri).catch(() => undefined);
    if (id === undefined) {
        return undefined;
    }
    const folder = vscode.Uri.joinPath(pluginsFolder, id);
    return await fileExists(folder) ? folder : undefined;
}
