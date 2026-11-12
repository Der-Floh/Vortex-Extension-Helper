import * as vscode from 'vscode';
import type { VortexDiagnostics } from '../checks/vortexDiagnostics';
import { PACKAGE_JSON_PATH } from '../constants';
import type { ProjectActivity } from '../project/projectActivity';
import { addonRecordOf, engineOf } from '../project/projectManifest';
import { pickVortexProject } from '../project/projectPicker';
import type { VortexWorkspaceTracker } from '../project/vortexWorkspaceTracker';
import { findAddon, listing } from '../templates/addons/addon';
import { offeredAddons, projectEngine } from '../templates/addons/addonListing';
import { DISCOVERED_CATALOGUE } from '../templates/addons/discoveredCatalogue';
import type { AddonTarget } from '../types/project';
import { readTextIfExists } from '../utils/fileSystemUtils';
import { parseLenientJson } from '../utils/jsonUtils';
import { showError, showInfo } from '../utils/notifications';
import { requireTrust } from '../utils/trust';
import { runAddonChange } from '../wizard/addonChangeFlow';
import { askAddonsFor, askOptions, VSCODE_ADDON_PROMPTS } from '../wizard/addonPrompts';

/** Adds add-ons to a project: the one a sidebar row names, or those picked in the wizard's menu for its engine */
export async function handleAddAddons(tracker: VortexWorkspaceTracker, diagnostics: VortexDiagnostics, activity: ProjectActivity, target?: AddonTarget): Promise<void> {
    const project = await pickVortexProject(tracker, target);
    if (!project || !requireTrust()) {
        return;
    }
    const packageJson = await readTextIfExists(vscode.Uri.joinPath(project.folder.uri, PACKAGE_JSON_PATH));
    if (packageJson === undefined) {
        showError(`${project.folder.name}/package.json can't be read.`);
        return;
    }
    const manifest = parseLenientJson(packageJson);
    const record = addonRecordOf(manifest);
    const known = projectEngine(engineOf(manifest), record, DISCOVERED_CATALOGUE);
    const engine = DISCOVERED_CATALOGUE.engines.find(entry => entry.id === known) ?? await VSCODE_ADDON_PROMPTS.pickEngine(DISCOVERED_CATALOGUE.engines);
    if (!engine) {
        return;
    }
    const present = Object.keys(record?.addons ?? {});
    if (!target?.addon && offeredAddons(engine.id, present, DISCOVERED_CATALOGUE).length === 0) {
        showInfo(`There is no add-on for ${engine.label} that ${project.folder.name} could still add.`);
        return;
    }
    const names = present.map(id => findAddon(DISCOVERED_CATALOGUE, id)).filter(addon => addon && !addon.manifest.hidden).map(addon => addon!.manifest.name);
    const picks = target?.addon
        ? await withOptions(target.addon, present)
        : await askAddonsFor(engine, { ids: present, nothingPicked: names.length > 0 ? `Adds nothing yet; the project has ${listing(names)}` : 'Adds nothing yet' });
    if (!picks || picks.addons.length === 0) {
        return;
    }
    await runAddonChange(project, { kind: 'add', addons: picks.addons, options: picks.addonOptions, engine: engine.id }, diagnostics, activity);
}

async function withOptions(addon: string, present: readonly string[]): Promise<{ addons: readonly string[]; addonOptions: Record<string, string> } | undefined> {
    const options = await askOptions([addon], present, DISCOVERED_CATALOGUE);
    return options && { addons: [addon], addonOptions: options };
}
