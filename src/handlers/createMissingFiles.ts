import * as path from 'path';
import * as vscode from 'vscode';
import type { VortexDiagnostics } from '../checks/vortexDiagnostics';
import { DISPLAY_NAME_PREFIX, GAMEART_EXTENSION, GAMEART_PATH, PACKAGE_JSON_PATH } from '../constants';
import { addonRecordOf } from '../project/projectManifest';
import { pickVortexProject } from '../project/projectPicker';
import type { VortexWorkspaceTracker } from '../project/vortexWorkspaceTracker';
import { writeMissingFiles } from '../templates/projectWriter';
import { compositionOf, independentOutputs, restorableOutputs, restorationOf, unrestorablePaths } from '../templates/registry';
import { restoreValues } from '../templates/render';
import type { GeneratedOutput } from '../types/project';
import { errorMessage } from '../utils/errors';
import { fileExists, readCurrentText } from '../utils/fileSystemUtils';
import { isRecord, parseLenientJson } from '../utils/jsonUtils';
import { Logger } from '../utils/logger';
import { showError, showInfo } from '../utils/notifications';

/** Restores the generated files a project lacks from the templates; never overwrites a file */
export async function handleCreateMissingFiles(tracker: VortexWorkspaceTracker, diagnostics: VortexDiagnostics): Promise<void> {
    const project = await pickVortexProject(tracker);
    if (!project) {
        return;
    }
    const root = project.folder.uri;
    const manifest = parseLenientJson(await readCurrentText(vscode.Uri.joinPath(root, PACKAGE_JSON_PATH)) ?? '');
    if (!isRecord(manifest) || typeof manifest.name !== 'string' || !manifest.name) {
        showError(`${project.folder.name}/package.json needs a "name" before missing files can be created.`);
        return;
    }

    // Exactly the add-ons the project recorded; when one isn't available in that version, only what doesn't depend on add-ons
    const restoration = restorationOf(addonRecordOf(manifest));
    const composition = restoration.ok ? compositionOf(restoration) : undefined;
    const values = restoreValues(manifest.name, gameNameOf(manifest));
    const outputs = (composition ? restorableOutputs(values, composition) : independentOutputs(values))
        .map(output => withGameartPath(output, manifest.gameart));
    let written: string[];
    try {
        written = await writeMissingFiles(root, outputs);
    } catch (e) {
        Logger.error(`Failed to create missing files in ${root.fsPath}: ${errorMessage(e)}`);
        showError(`Failed to create the missing files. ${errorMessage(e)}`);
        return;
    }

    const notRestored = composition ? await missingFiles(root, unrestorablePaths(composition)) : [];
    const created = written.length > 0
        ? `Created ${written.length} missing file${written.length === 1 ? '' : 's'} in ${project.folder.name}: ${written.join(', ')}.`
        : `No generated files are missing in ${project.folder.name}.`;
    const manual = notRestored.length > 0 ? ` Create ${notRestored.join(' and ')} yourself, since they hold the game's details.` : '';
    const partial = restoration.ok ? '' : ` ${restoration.problem} So only the files that don't depend on add-ons were restored.`;
    Logger.info(`${created}${manual}${partial}`);
    showInfo(`${created}${manual}${partial}`);
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
