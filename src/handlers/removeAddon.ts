import * as vscode from 'vscode';
import type { VortexDiagnostics } from '../checks/vortexDiagnostics';
import { PACKAGE_JSON_PATH } from '../constants';
import type { ProjectActivity } from '../project/projectActivity';
import { addonRecordOf } from '../project/projectManifest';
import { pickVortexProject } from '../project/projectPicker';
import type { VortexWorkspaceTracker } from '../project/vortexWorkspaceTracker';
import { findAddon, type Addon } from '../templates/addons/addon';
import { DISCOVERED_CATALOGUE } from '../templates/addons/discoveredCatalogue';
import type { AddonTarget } from '../types/project';
import { readTextIfExists } from '../utils/fileSystemUtils';
import { parseLenientJson } from '../utils/jsonUtils';
import { showError, showInfo } from '../utils/notifications';
import { requireTrust } from '../utils/trust';
import { runAddonChange } from '../wizard/addonChangeFlow';

interface AddonQuickPickItem extends vscode.QuickPickItem {
    readonly addon: Addon;
}

/** Removes an add-on from a project: the one a sidebar row names, or one picked from those it has */
export async function handleRemoveAddon(tracker: VortexWorkspaceTracker, diagnostics: VortexDiagnostics, activity: ProjectActivity, target?: AddonTarget): Promise<void> {
    const project = await pickVortexProject(tracker, target);
    if (!project || !requireTrust()) {
        return;
    }
    const packageJson = await readTextIfExists(vscode.Uri.joinPath(project.folder.uri, PACKAGE_JSON_PATH));
    if (packageJson === undefined) {
        showError(`${project.folder.name}/package.json can't be read.`);
        return;
    }
    const record = addonRecordOf(parseLenientJson(packageJson));
    const removable = Object.keys(record?.addons ?? {})
        .map(id => findAddon(DISCOVERED_CATALOGUE, id))
        .filter((addon): addon is Addon => addon !== undefined && !addon.manifest.hidden);
    if (removable.length === 0) {
        showInfo(`${project.folder.name} has no add-ons to remove.`);
        return;
    }
    const id = target?.addon ?? (await pickAddon(removable, project.folder.name))?.manifest.id;
    if (id) {
        await runAddonChange(project, { kind: 'remove', addons: [id] }, diagnostics, activity);
    }
}

async function pickAddon(addons: readonly Addon[], folderName: string): Promise<Addon | undefined> {
    const picked = await vscode.window.showQuickPick<AddonQuickPickItem>(
        addons.map(addon => ({ label: addon.manifest.name, detail: addon.manifest.description, addon })),
        { title: `Remove an add-on from ${folderName}`, placeHolder: 'Its files are deleted where you haven\'t changed them', ignoreFocusOut: true },
    );
    return picked?.addon;
}
