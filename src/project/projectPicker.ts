import * as vscode from 'vscode';
import { MANIFEST } from '../constants';
import type { VortexProject } from '../types/project';
import type { VortexWorkspaceTracker } from './vortexWorkspaceTracker';

export const NO_PROJECT_MESSAGE = 'No Vortex game extension is open. A workspace folder is one when its package.json has vortex-api in devDependencies.';

interface ProjectQuickPickItem extends vscode.QuickPickItem {
    readonly project: VortexProject;
}

/** The project of the active editor, the only project, or the one the user picks */
export async function pickVortexProject(tracker: VortexWorkspaceTracker): Promise<VortexProject | undefined> {
    const projects = tracker.projects;
    if (projects.length === 0) {
        vscode.window.showInformationMessage(`${MANIFEST.displayName}: ${NO_PROJECT_MESSAGE}`);
        return undefined;
    }
    if (projects.length === 1) {
        return projects[0];
    }
    const activeUri = vscode.window.activeTextEditor?.document.uri;
    const activeProject = activeUri ? tracker.find(activeUri) : undefined;
    if (activeProject) {
        return activeProject;
    }

    const items: ProjectQuickPickItem[] = projects.map(project => ({
        label: project.folder.name,
        description: project.folder.uri.fsPath,
        project,
    }));
    const picked = await vscode.window.showQuickPick(items, { title: 'Select the game extension', ignoreFocusOut: true });
    return picked?.project;
}
