import * as vscode from 'vscode';
import type { VortexDiagnostics } from '../checks/vortexDiagnostics';
import { PACKAGE_JSON_PATH } from '../constants';
import { saveOpenPackageJson } from '../project/dependencyInstaller';
import { uninstallDependency } from '../project/npmTasks';
import { libraryActivity, type ProjectActivity } from '../project/projectActivity';
import { removeExternal } from '../project/projectManifest';
import { pickVortexProject } from '../project/projectPicker';
import type { VortexWorkspaceTracker } from '../project/vortexWorkspaceTracker';
import type { LibraryTarget, VortexLibrary, VortexProject } from '../types/project';
import { errorMessage } from '../utils/errors';
import { readTextIfExists, writeText } from '../utils/fileSystemUtils';
import { Logger } from '../utils/logger';
import { showError, showInfo } from '../utils/notifications';
import { requireTrust } from '../utils/trust';

/** Uninstalls a library the sidebar lists and takes it out of `vortex.externals` */
export async function handleRemoveVortexLibrary(tracker: VortexWorkspaceTracker, diagnostics: VortexDiagnostics, activity: ProjectActivity, target?: LibraryTarget): Promise<void> {
    const library = target?.library;
    const project = library && await pickVortexProject(tracker, target);
    if (!library || !project || !requireTrust()) {
        return;
    }
    const packageJsonUri = vscode.Uri.joinPath(project.folder.uri, PACKAGE_JSON_PATH);
    if (!await saveOpenPackageJson(packageJsonUri)) {
        return;
    }
    await activity.run(project.folder, libraryActivity('removing', library.name), () => removeLibrary(project, library, packageJsonUri, diagnostics));
}

/** npm goes first, so a failed uninstall leaves package.json as it was and nothing has to be restored */
async function removeLibrary(project: VortexProject, library: VortexLibrary, packageJsonUri: vscode.Uri, diagnostics: VortexDiagnostics): Promise<void> {
    try {
        await uninstallDependency(project.folder, library.name);
        await dropExternal(packageJsonUri, library.name);
        showInfo(`Removed ${library.name}.`);
    } catch (e) {
        Logger.error(`Failed to remove ${library.name} from ${project.folder.uri.fsPath}: ${errorMessage(e)}`);
        showError(`Failed to remove ${library.name}. ${errorMessage(e)}`);
    } finally {
        await diagnostics.validateFolder(project.folder);
    }
}

async function dropExternal(packageJsonUri: vscode.Uri, name: string): Promise<void> {
    const text = await readTextIfExists(packageJsonUri);
    const edited = text === undefined ? undefined : removeExternal(text, name);
    if (edited !== undefined && edited !== text) {
        await writeText(packageJsonUri, edited);
    }
}
