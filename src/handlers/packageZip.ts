import * as vscode from 'vscode';
import type { VortexDiagnostics } from '../checks/vortexDiagnostics';
import { BUILTIN_REVEAL_IN_OS, PACKAGE_JSON_PATH } from '../constants';
import { reportBlockers, runProjectAction } from '../debug/debugDialogs';
import { runPackage, saveForBuild } from '../project/npmTasks';
import { ACTIVITY_PACKAGE, type ProjectActivity } from '../project/projectActivity';
import { pickVortexProject } from '../project/projectPicker';
import type { VortexWorkspaceTracker } from '../project/vortexWorkspaceTracker';
import type { ProjectTarget, VortexProject } from '../types/project';
import { fileExists, readTextIfExists } from '../utils/fileSystemUtils';
import { isRecord, parseLenientJson } from '../utils/jsonUtils';
import { showInfo, withNotificationProgress } from '../utils/notifications';
import { requireTrust } from '../utils/trust';

/** Where .vscode/build/package-zip.mjs writes the archive */
const DIST_FOLDER = 'dist';
const REVEAL = 'Reveal in File Explorer';

export async function handlePackageZip(tracker: VortexWorkspaceTracker, diagnostics: VortexDiagnostics, activity: ProjectActivity, target?: ProjectTarget): Promise<void> {
    const project = await pickVortexProject(tracker, target);
    if (!project || !requireTrust() || !await reportBlockers(project, diagnostics)) {
        return;
    }
    await runProjectAction({ project, validator: diagnostics, activity }, ACTIVITY_PACKAGE, 'package', async () => {
        await saveForBuild(project.folder);
        await withNotificationProgress(`Packaging ${project.folder.name}`, (_progress, token) => runPackage(project.folder, token), true);
        await reportPackaged(project);
    });
}

async function reportPackaged(project: VortexProject): Promise<void> {
    const archive = await findArchive(project.folder.uri);
    if (archive === undefined) {
        showInfo(`Packaged ${project.folder.name}.`);
        return;
    }
    showInfo(`Packaged ${project.folder.name} as ${DIST_FOLDER}/${archive.path.split('/').pop()}.`, REVEAL)
        .then(choice => choice === REVEAL && vscode.commands.executeCommand(BUILTIN_REVEAL_IN_OS, archive));
}

async function findArchive(folder: vscode.Uri): Promise<vscode.Uri | undefined> {
    const manifest = parseLenientJson(await readTextIfExists(vscode.Uri.joinPath(folder, PACKAGE_JSON_PATH)) ?? '');
    if (!isRecord(manifest) || typeof manifest.name !== 'string' || typeof manifest.version !== 'string') {
        return undefined;
    }
    const archive = vscode.Uri.joinPath(folder, DIST_FOLDER, `${manifest.name}-${manifest.version}.zip`);
    return await fileExists(archive) ? archive : undefined;
}
