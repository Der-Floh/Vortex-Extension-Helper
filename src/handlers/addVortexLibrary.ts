import * as vscode from 'vscode';
import { MANIFEST } from '../constants';
import { PACKAGE_JSON_PATH } from '../templates/registry';
import { errorMessage } from '../utils/errors';
import { addExternal, readExternals } from '../utils/externals';
import { findOpenDocument, readCurrentText, readTextIfExists, writeText } from '../utils/fileSystemUtils';
import { isRecord, parseLenientJson } from '../utils/jsonUtils';
import { Logger } from '../utils/logger';
import { installDevDependency } from '../utils/npmTasks';
import { pickVortexProject } from '../utils/projectPicker';
import { requireTrust } from '../utils/trust';
import type { VortexDiagnostics } from '../utils/vortexDiagnostics';
import { VORTEX_LIBRARIES, type VortexLibrary } from '../utils/vortexLibraries';
import type { VortexWorkspaceTracker } from '../utils/vortexWorkspaceTracker';

const SAVE_AND_CONTINUE = 'Save and Continue';

interface LibraryQuickPickItem extends vscode.QuickPickItem {
    readonly library: VortexLibrary;
}

/**
 * Installs a library Vortex provides at runtime and lists it in `vortex.externals`, so rollup leaves its import to Vortex.
 * package.json is edited before npm runs, because npm rewrites the file, and restored if npm fails.
 */
export async function handleAddVortexLibrary(tracker: VortexWorkspaceTracker, diagnostics: VortexDiagnostics): Promise<void> {
    const project = await pickVortexProject(tracker);
    if (!project || !requireTrust()) {
        return;
    }
    const packageJsonUri = vscode.Uri.joinPath(project.folder.uri, PACKAGE_JSON_PATH);
    const library = await pickLibrary(await readCurrentText(packageJsonUri) ?? '');
    if (!library || !await saveOpenPackageJson(packageJsonUri)) {
        return;
    }

    const originalText = await readTextIfExists(packageJsonUri);
    if (originalText === undefined) {
        vscode.window.showErrorMessage(`${MANIFEST.displayName}: ${project.folder.name}/package.json can't be read.`);
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
        vscode.window.showErrorMessage(`${MANIFEST.displayName}: Failed to add ${library.name}. ${errorMessage(e)}`);
        return;
    } finally {
        await diagnostics.validateFolder(project.folder);
    }

    vscode.window.showInformationMessage(`${MANIFEST.displayName}: Added ${library.name}. Rollup leaves its import to Vortex, which provides it at runtime.`);
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

/** npm rewrites package.json, so unsaved changes in an open editor must be saved first */
async function saveOpenPackageJson(uri: vscode.Uri): Promise<boolean> {
    const document = findOpenDocument(uri);
    if (!document?.isDirty) {
        return true;
    }
    const choice = await vscode.window.showWarningMessage(`${MANIFEST.displayName}: package.json has unsaved changes. npm rewrites it, so save it first.`, { modal: true }, SAVE_AND_CONTINUE);
    return choice === SAVE_AND_CONTINUE && await document.save();
}

function dependencyNames(manifest: unknown): Set<string> {
    if (!isRecord(manifest)) {
        return new Set();
    }
    return new Set(['devDependencies', 'dependencies'].flatMap(field => {
        const dependencies = manifest[field];
        return isRecord(dependencies) ? Object.keys(dependencies) : [];
    }));
}
