import * as path from 'path';
import * as vscode from 'vscode';
import { DISPLAY_NAME_PREFIX, GAMEART_EXTENSION, GAMEART_PATH, MANIFEST } from '../constants';
import { restoreValues } from '../templates/render';
import { PACKAGE_JSON_PATH, restorableOutputs, unrestorablePaths } from '../templates/registry';
import type { GeneratedOutput } from '../types/project';
import { errorMessage } from '../utils/errors';
import { fileExists, readCurrentText } from '../utils/fileSystemUtils';
import { isRecord, parseLenientJson } from '../utils/jsonUtils';
import { Logger } from '../utils/logger';
import { pickVortexProject } from '../utils/projectPicker';
import { writeMissingFiles } from '../utils/projectWriter';
import type { VortexDiagnostics } from '../utils/vortexDiagnostics';
import type { VortexWorkspaceTracker } from '../utils/vortexWorkspaceTracker';

/** Restores the generated files a project lacks from the templates; never overwrites a file */
export async function handleCreateMissingFiles(tracker: VortexWorkspaceTracker, diagnostics: VortexDiagnostics): Promise<void> {
    const project = await pickVortexProject(tracker);
    if (!project) {
        return;
    }
    const root = project.folder.uri;
    const manifest = parseLenientJson(await readCurrentText(vscode.Uri.joinPath(root, PACKAGE_JSON_PATH)) ?? '');
    if (!isRecord(manifest) || typeof manifest.name !== 'string' || !manifest.name) {
        vscode.window.showErrorMessage(`${MANIFEST.displayName}: ${project.folder.name}/package.json needs a "name" before missing files can be created.`);
        return;
    }

    const outputs = restorableOutputs(restoreValues(manifest.name, gameNameOf(manifest)))
        .map(output => withGameartPath(output, manifest.gameart));
    let written: string[];
    try {
        written = await writeMissingFiles(root, outputs);
    } catch (e) {
        Logger.error(`Failed to create missing files in ${root.fsPath}: ${errorMessage(e)}`);
        vscode.window.showErrorMessage(`${MANIFEST.displayName}: Failed to create the missing files. ${errorMessage(e)}`);
        return;
    }

    const notRestored = await missingFiles(root, unrestorablePaths());
    const created = written.length > 0
        ? `Created ${written.length} missing file${written.length === 1 ? '' : 's'} in ${project.folder.name}: ${written.join(', ')}.`
        : `No generated files are missing in ${project.folder.name}.`;
    const manual = notRestored.length > 0 ? ` Create ${notRestored.join(' and ')} yourself, since they hold the game's details.` : '';
    Logger.info(`${created}${manual}`);
    vscode.window.showInformationMessage(`${MANIFEST.displayName}: ${created}${manual}`);
    await diagnostics.validateFolder(project.folder);
}

function gameNameOf(manifest: Record<string, unknown>): string {
    const displayName = typeof manifest.displayName === 'string' ? manifest.displayName : '';
    return displayName.startsWith(DISPLAY_NAME_PREFIX) ? displayName.slice(DISPLAY_NAME_PREFIX.length) : displayName || String(manifest.name);
}

/** Writes the placeholder game art where package.json expects it, if that is a .jpg inside the project */
function withGameartPath(output: GeneratedOutput, gameart: unknown): GeneratedOutput {
    if (output.path !== GAMEART_PATH || typeof gameart !== 'string') {
        return output;
    }
    const normalized = path.posix.normalize(gameart.replace(/\\/g, '/'));
    const isInside = !path.posix.isAbsolute(normalized) && !/^[A-Za-z]:/.test(normalized) && !normalized.startsWith('../');
    return isInside && path.posix.extname(normalized).toLowerCase() === GAMEART_EXTENSION ? { ...output, path: normalized } : output;
}

async function missingFiles(root: vscode.Uri, paths: readonly string[]): Promise<string[]> {
    const exists = await Promise.all(paths.map(file => fileExists(vscode.Uri.joinPath(root, file))));
    return paths.filter((_, index) => !exists[index]);
}
