import * as vscode from 'vscode';
import type { VortexDiagnostics } from '../checks/vortexDiagnostics';
import { PACKAGE_JSON_PATH, VORTEX_LIBRARIES } from '../constants';
import { saveOpenPackageJson } from '../project/dependencyInstaller';
import { installDevDependency } from '../project/npmTasks';
import { libraryActivity, type ProjectActivity } from '../project/projectActivity';
import { addExternal, dependencyNames, readExternals } from '../project/projectManifest';
import { pickVortexProject } from '../project/projectPicker';
import type { VortexWorkspaceTracker } from '../project/vortexWorkspaceTracker';
import type { LibraryTarget, VortexLibrary, VortexProject } from '../types/project';
import { errorMessage } from '../utils/errors';
import { readCurrentText, readTextIfExists, writeText } from '../utils/fileSystemUtils';
import { parseLenientJson } from '../utils/jsonUtils';
import { Logger } from '../utils/logger';
import { showError, showInfo } from '../utils/notifications';
import { requireTrust } from '../utils/trust';

interface LibraryQuickPickItem extends vscode.QuickPickItem {
    readonly library: VortexLibrary;
}

/** Installs a library Vortex provides at runtime and lists it in `vortex.externals`, so rollup leaves its import to Vortex */
export async function handleAddVortexLibrary(tracker: VortexWorkspaceTracker, diagnostics: VortexDiagnostics, activity: ProjectActivity, target?: LibraryTarget): Promise<void> {
    const project = await pickVortexProject(tracker, target);
    if (!project || !requireTrust()) {
        return;
    }
    const packageJsonUri = vscode.Uri.joinPath(project.folder.uri, PACKAGE_JSON_PATH);
    const library = target?.library ?? await pickLibrary(await readCurrentText(packageJsonUri) ?? '');
    if (!library || !await saveOpenPackageJson(packageJsonUri)) {
        return;
    }
    await activity.run(project.folder, libraryActivity('adding', library.name), () => addLibrary(project, library, packageJsonUri, diagnostics));
}

/** package.json is edited before npm runs, because npm rewrites the file, and restored if npm fails */
async function addLibrary(project: VortexProject, library: VortexLibrary, packageJsonUri: vscode.Uri, diagnostics: VortexDiagnostics): Promise<void> {
    const originalText = await readTextIfExists(packageJsonUri);
    if (originalText === undefined) {
        showError(`${project.folder.name}/package.json can't be read.`);
        return;
    }
    const editedText = addExternal(originalText, library.name);
    try {
        if (editedText !== originalText) {
            await writeText(packageJsonUri, editedText);
        }
        await installDevDependency(project.folder, library.source);
    } catch (e) {
        if (editedText !== originalText && await readTextIfExists(packageJsonUri) === editedText) {
            await writeText(packageJsonUri, originalText);
        }
        Logger.error(`Failed to add ${library.name} to ${project.folder.uri.fsPath}: ${errorMessage(e)}`);
        showError(`Failed to add ${library.name}. ${errorMessage(e)}`);
        return;
    } finally {
        await diagnostics.validateFolder(project.folder);
    }

    showInfo(`Added ${library.name}. Rollup leaves its import to Vortex, which provides it at runtime.`);
}

async function pickLibrary(packageJsonText: string): Promise<VortexLibrary | undefined> {
    const installed = dependencyNames(parseLenientJson(packageJsonText));
    const externals = readExternals(packageJsonText);

    const items: LibraryQuickPickItem[] = VORTEX_LIBRARIES.map(library => ({
        label: library.name,
        description: installed.has(library.name) ? (externals.includes(library.name) ? 'added' : 'installed, not in vortex.externals') : undefined,
        detail: library.description,
        library,
    }));
    const picked = await vscode.window.showQuickPick(items, {
        title: 'Add a library Vortex provides at runtime',
        placeHolder: 'Game extensions can only import the libraries Vortex ships',
        matchOnDetail: true,
        ignoreFocusOut: true,
    });
    return picked?.library;
}
