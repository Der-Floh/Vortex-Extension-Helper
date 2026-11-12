import * as vscode from 'vscode';
import { PACKAGE_JSON_PATH, PACKAGE_LOCK_PATH, SOURCE_FOLDER } from '../constants';
import { ensureToolsAvailable, installDependencies } from '../project/npmTasks';
import { ACTIVITY_ADDONS, type ProjectActivity } from '../project/projectActivity';
import { addonRecordOf, applyAddonChange, engineOf } from '../project/projectManifest';
import { listing, type Addon, type Catalogue } from '../templates/addons/addon';
import { addonChangePaths, planAddonChange, type AddonChangePlan, type AddonChangeRequest, type ExistingProject } from '../templates/addons/changeAddons';
import { DISCOVERED_CATALOGUE } from '../templates/addons/discoveredCatalogue';
import type { FolderValidator, VortexProject } from '../types/project';
import { errorMessage } from '../utils/errors';
import { filesBelow, readBytesIfExists, saveDirtyDocuments, toBytes } from '../utils/fileSystemUtils';
import { parseLenientJson } from '../utils/jsonUtils';
import { Logger } from '../utils/logger';
import { showError, showInfo, showWarning, withNotificationProgress } from '../utils/notifications';

type FileContent = string | Uint8Array;

/** What the flow asks and runs that tests replace */
export interface AddonChangeDeps {
    readonly catalogue: Catalogue;
    /** @returns Whether the author goes ahead */
    confirm(message: string, action: string): Thenable<boolean>;
    /** Installs the project's dependencies once package.json lists different ones */
    install(folder: vscode.WorkspaceFolder): Promise<void>;
    /** Opens the files the change left with conflict markers */
    showConflicts(files: readonly vscode.Uri[]): Thenable<void>;
}

export const DEFAULT_ADDON_CHANGE_DEPS: AddonChangeDeps = {
    catalogue: DISCOVERED_CATALOGUE,
    confirm: async (message, action) => await showWarning(message, { modal: true }, action) === action,
    install: async folder => {
        await ensureToolsAvailable(folder);
        await installDependencies(folder);
    },
    showConflicts: async files => {
        for (const file of files) {
            await vscode.window.showTextDocument(file, { preview: false });
        }
    },
};

/** A project as the planner sees it, and its package.json as text */
export interface ReadProject {
    readonly existing: ExistingProject;
    readonly packageJson: string;
}

/** package.json and every file a change can touch or scan; undefined if package.json can't be read */
export async function readExistingProject(project: VortexProject, catalogue: Catalogue): Promise<ReadProject | undefined> {
    const root = project.folder.uri;
    const packageJson = await readFileContent(root, PACKAGE_JSON_PATH);
    if (typeof packageJson !== 'string') {
        return undefined;
    }
    const paths = [...new Set([...addonChangePaths(catalogue), ...await filesBelow(root, SOURCE_FOLDER)])];
    const files = await readFiles(root, paths);
    const manifest = parseLenientJson(packageJson);
    return { existing: { manifest, record: addonRecordOf(manifest), engine: engineOf(manifest), files }, packageJson };
}

/**
 * Adds or removes add-ons in a project: works out the change, asks to go ahead with what it creates, changes and
 * deletes, writes it and runs npm when the dependencies changed. If writing or npm fails, every touched file is
 * put back as it was.
 *
 * @returns Whether the change was made.
 */
export async function runAddonChange(project: VortexProject, request: AddonChangeRequest, validator: FolderValidator, activity: ProjectActivity, deps: AddonChangeDeps = DEFAULT_ADDON_CHANGE_DEPS): Promise<boolean> {
    const name = project.folder.name;
    if (!await saveDirtyDocuments(project.folder.uri)) {
        showError(`Some files of ${name} couldn't be saved, so its add-ons weren't changed.`);
        return false;
    }
    const read = await readExistingProject(project, deps.catalogue);
    if (!read) {
        showError(`${name}/package.json can't be read.`);
        return false;
    }
    const result = planAddonChange(read.existing, request, deps.catalogue);
    if (!result.ok) {
        showError(result.problem);
        return false;
    }
    const { plan } = result;
    if (plan.creates.length + plan.updates.length + plan.deletes.length === 0 && plan.added.length + plan.removed.length === 0) {
        showInfo(`Nothing changes in ${name}.`);
        return false;
    }
    if (!await deps.confirm(confirmationOf(plan, request, name), request.kind === 'add' ? 'Add' : 'Remove')) {
        return false;
    }
    return await activity.run(project.folder, ACTIVITY_ADDONS, () => applyPlan(project, plan, request, read, validator, deps)) ?? false;
}

async function applyPlan(project: VortexProject, plan: AddonChangePlan, request: AddonChangeRequest, read: ReadProject, validator: FolderValidator, deps: AddonChangeDeps): Promise<boolean> {
    const root = project.folder.uri;
    const touched = [...plan.creates.map(output => output.path), ...plan.updates.map(update => update.path), ...plan.deletes, PACKAGE_JSON_PATH];
    const before = new Map([...read.existing.files, [PACKAGE_JSON_PATH, read.packageJson] as const]);
    const now = await readFiles(root, touched);
    if (touched.some(file => !sameContent(now.get(file), before.get(file)))) {
        showWarning(`Files of ${project.folder.name} changed in the meantime, so nothing was changed. Try again.`);
        return false;
    }
    const backup = await readFiles(root, [...touched, PACKAGE_LOCK_PATH]);
    const names = changedNames(plan, request);
    try {
        await writePlan(root, plan, applyAddonChange(read.packageJson, plan.manifest));
        if (changesDependencies(plan)) {
            await withNotificationProgress(`Installing the packages of ${listing(names)}…`, () => deps.install(project.folder));
        }
    } catch (e) {
        await restore(root, [...touched, PACKAGE_LOCK_PATH], backup);
        Logger.error(`Failed to change the add-ons of ${root.fsPath}: ${errorMessage(e)}`);
        showError(`Failed to ${request.kind} ${listing(names)}, so ${project.folder.name} was put back as it was. ${errorMessage(e)}`);
        return false;
    } finally {
        await validator.validateFolder(project.folder);
    }
    showInfo(resultOf(plan, request, project.folder.name));
    const conflicted = plan.updates.filter(update => update.conflicts > 0).map(update => vscode.Uri.joinPath(root, update.path));
    if (conflicted.length > 0) {
        await deps.showConflicts(conflicted);
    }
    return true;
}

/** One workspace edit, so every file is written the same way and VS Code's undo knows about it */
async function writePlan(root: vscode.Uri, plan: AddonChangePlan, packageJson: string): Promise<void> {
    const edit = new vscode.WorkspaceEdit();
    plan.creates.forEach(output => edit.createFile(vscode.Uri.joinPath(root, output.path), { contents: toBytes(output.content) }));
    plan.updates.forEach(update => edit.createFile(vscode.Uri.joinPath(root, update.path), { overwrite: true, contents: toBytes(update.content) }));
    edit.createFile(vscode.Uri.joinPath(root, PACKAGE_JSON_PATH), { overwrite: true, contents: toBytes(packageJson) });
    plan.deletes.forEach(file => edit.deleteFile(vscode.Uri.joinPath(root, file), { ignoreIfNotExists: true }));
    if (!await vscode.workspace.applyEdit(edit)) {
        throw new Error('VS Code didn\'t write the files.');
    }
    await removeEmptiedFolders(root, plan.deletes);
}

async function restore(root: vscode.Uri, paths: readonly string[], backup: ReadonlyMap<string, FileContent>): Promise<void> {
    for (const file of paths) {
        const uri = vscode.Uri.joinPath(root, file);
        const content = backup.get(file);
        try {
            if (content === undefined) {
                await vscode.workspace.fs.delete(uri, { useTrash: false });
            } else {
                await vscode.workspace.fs.writeFile(uri, toBytes(content));
            }
        } catch (e) {
            Logger.error(`Couldn't put ${uri.fsPath} back: ${errorMessage(e)}`);
        }
    }
    await removeEmptiedFolders(root, paths.filter(file => !backup.has(file)));
}

/** The folders the deleted files leave empty, deepest first, so an add-on's folder goes with its last file */
async function removeEmptiedFolders(root: vscode.Uri, deleted: readonly string[]): Promise<void> {
    const folders = [...new Set(deleted.flatMap(file => file.split('/').slice(0, -1).map((_segment, index, segments) => segments.slice(0, index + 1).join('/'))))]
        .sort((left, right) => right.split('/').length - left.split('/').length);
    for (const folder of folders) {
        const uri = vscode.Uri.joinPath(root, folder);
        try {
            if ((await vscode.workspace.fs.readDirectory(uri)).length === 0) {
                await vscode.workspace.fs.delete(uri, { useTrash: false });
            }
        } catch {
            continue;
        }
    }
}

function confirmationOf(plan: AddonChangePlan, request: AddonChangeRequest, folderName: string): string {
    const packages = Object.keys(request.kind === 'add' ? plan.manifest.devDependencies.add : plan.manifest.devDependencies.remove).length;
    const parts = [
        plan.creates.length > 0 ? `creates ${counted(plan.creates.length, 'file')}` : '',
        plan.updates.length > 0 ? `changes ${listing(plan.updates.map(update => update.path))}` : '',
        plan.deletes.length > 0 ? `deletes ${listing(plan.deletes)}` : '',
        packages > 0 ? `${request.kind === 'add' ? 'installs' : 'uninstalls'} ${counted(packages, 'package')}` : '',
    ].filter(part => part.length > 0);
    const conflicts = plan.conflicts > 0 ? ` Where your changes and the add-on's meet, ${counted(plan.conflicts, 'conflict')} will be left to resolve.` : '';
    const does = parts.length > 0 ? ` It ${listing(parts)}.` : '';
    return `${request.kind === 'add' ? 'Add' : 'Remove'} ${listing(changedNames(plan, request))} ${request.kind === 'add' ? 'to' : 'from'} ${folderName}?${does}${conflicts}`;
}

function resultOf(plan: AddonChangePlan, request: AddonChangeRequest, folderName: string): string {
    const done = `${request.kind === 'add' ? 'Added' : 'Removed'} ${listing(changedNames(plan, request))} ${request.kind === 'add' ? 'to' : 'from'} ${folderName}.`;
    const conflicted = plan.updates.filter(update => update.conflicts > 0).map(update => update.path);
    const conflicts = conflicted.length > 0
        ? ` Resolve the ${counted(plan.conflicts, 'conflict')} in ${listing(conflicted)}: Accept Current keeps your version, Accept Incoming takes the add-on's.`
        : '';
    const skipped = plan.skipped.length > 0 ? ` ${listing(plan.skipped)} ${plan.skipped.length === 1 ? 'is' : 'are'} missing, so ${plan.skipped.length === 1 ? 'it wasn\'t' : 'they weren\'t'} changed.` : '';
    const kept = Object.entries(plan.stillImported).map(([file, importers]) => ` ${file} stays, because ${listing(importers)} still import${importers.length === 1 ? 's' : ''} it.`).join('');
    return `${done}${conflicts}${skipped}${kept}`;
}

/** The add-ons the author picked or removed, without the ones that came along */
function changedNames(plan: AddonChangePlan, request: AddonChangeRequest): string[] {
    const visible = (addons: readonly Addon[]) => addons.filter(addon => !addon.manifest.hidden).map(addon => addon.manifest.name);
    return visible(request.kind === 'add' ? plan.added : plan.removed);
}

function changesDependencies(plan: AddonChangePlan): boolean {
    const { add, remove } = plan.manifest.devDependencies;
    return Object.keys(add).length + Object.keys(remove).length > 0;
}

async function readFiles(root: vscode.Uri, paths: readonly string[]): Promise<Map<string, FileContent>> {
    const contents = await Promise.all(paths.map(async file => [file, await readFileContent(root, file)] as const));
    return new Map(contents.filter((entry): entry is readonly [string, FileContent] => entry[1] !== undefined));
}

/** Text, unless the bytes have a NUL, which no text file of a project has */
async function readFileContent(root: vscode.Uri, file: string): Promise<FileContent | undefined> {
    const bytes = await readBytesIfExists(vscode.Uri.joinPath(root, file));
    return bytes === undefined || bytes.includes(0) ? bytes : new TextDecoder().decode(bytes);
}

function sameContent(left: FileContent | undefined, right: FileContent | undefined): boolean {
    if (left === undefined || right === undefined || typeof left === 'string' || typeof right === 'string') {
        return left === right;
    }
    return left.length === right.length && left.every((byte, index) => byte === right[index]);
}

function counted(count: number, singular: string): string {
    return `${count} ${singular}${count === 1 ? '' : 's'}`;
}
