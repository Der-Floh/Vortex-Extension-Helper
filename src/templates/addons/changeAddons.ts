import * as path from 'path';
import { CONSTANTS_PATH, ENTRY_PATH } from '../../constants';
import type { AddonManifestChange, AddonRecord, EntryChange, GeneratedOutput } from '../../types/project';
import { lineEndingOf, linesOf, mergeTexts, wholeFileConflict, type MergeLabels } from '../../utils/threeWayMerge';
import { BASELINE_SCRIPTS } from '../packageJson';
import { readProjectValues } from '../projectValues';
import { GENERATED_FILES, renderFiles } from '../registry';
import { dependencyClosure, findAddon, listing, supportsEngine, type Addon, type Catalogue } from './addon';
import { composeAddons, outputPathOf, type Composition } from './composeAddons';
import { DISCOVERED_CATALOGUE } from './discoveredCatalogue';
import { mergeImportClash } from './importMerge';
import { NO_ADDONS, resolveAddons, resolveRecordedSet, type Resolution, type ResolvedAddons } from './resolveAddons';

export const YOUR_PROJECT = 'Your project';

/** A project generated earlier, as the planner needs to see it */
export interface ExistingProject {
    /** package.json, parsed leniently */
    readonly manifest: unknown;
    /** Its `vortex.addons` and `vortex.addonOptions`; none for a project without add-ons */
    readonly record?: AddonRecord;
    /** Its `vortex.engine` */
    readonly engine?: string;
    /** Its files by path, as text or bytes; a path that isn't there doesn't exist. See {@link addonChangePaths} */
    readonly files: ReadonlyMap<string, string | Uint8Array>;
}

export type AddonChangeRequest =
    | { readonly kind: 'add'; readonly addons: readonly string[]; readonly options: Readonly<Record<string, string>>; readonly engine?: string }
    | { readonly kind: 'remove'; readonly addons: readonly string[] };

export interface FileUpdate {
    readonly path: string;
    readonly content: string;
    /** The conflict blocks left in it for the author to resolve */
    readonly conflicts: number;
}

export interface AddonChangePlan {
    readonly before: ResolvedAddons;
    readonly after: ResolvedAddons;
    /** Every add-on that joins, the ones brought in by others included */
    readonly added: readonly Addon[];
    readonly removed: readonly Addon[];
    readonly creates: readonly GeneratedOutput[];
    readonly updates: readonly FileUpdate[];
    readonly deletes: readonly string[];
    /** Files the change would edit that the author deleted, so they were left out */
    readonly skipped: readonly string[];
    /** Files that would go but are kept as a conflict, with the files that still import them */
    readonly stillImported: Readonly<Record<string, readonly string[]>>;
    readonly manifest: AddonManifestChange;
    readonly conflicts: number;
}

export type AddonChangeResult = { readonly ok: true; readonly plan: AddonChangePlan } | { readonly ok: false; readonly problem: string };

type FileContent = string | Uint8Array;

const MODULE_IMPORT = /(?:from\s+|import\s*\(\s*|require\s*\(\s*)(['"])([^'"]+)\1/g;
const NAMED_IMPORT = /import\s+(?:type\s+)?(?:\{([^}]*)\}|[^'";]*?)\s+from\s+(['"])([^'"]+)\2/g;
const GAME_MEMBER = /\bGAME\.([A-Za-z_$][\w$]*)/g;
const TYPESCRIPT = '.ts';

/** The files a change can read or write, besides every file below `src`, which it scans for imports */
export function addonChangePaths(catalogue: Catalogue = DISCOVERED_CATALOGUE): readonly string[] {
    return [...new Set([...GENERATED_FILES.map(file => file.path), ...catalogue.addons.flatMap(addon => addon.files.map(file => outputPathOf(addon, file.path)))])];
}

/**
 * Works out what adding or removing add-ons does to a project generated earlier: each file the change affects is
 * the three-way merge of its rendering for the project's add-ons, the project's version and its rendering for the
 * new set, so an untouched file ends up as a new project would have it and the author's edits stay. Where both
 * changed the same lines, the file gets conflict markers.
 */
export function planAddonChange(project: ExistingProject, request: AddonChangeRequest, catalogue: Catalogue = DISCOVERED_CATALOGUE): AddonChangeResult {
    const before = project.record ? resolveRecordedSet(project.record, catalogue) : { ok: true as const, resolved: NO_ADDONS };
    if (!before.ok) {
        return before;
    }
    const after = nextSet(before.resolved, request, project.engine ?? (request.kind === 'add' ? request.engine : undefined), catalogue);
    if (!after.ok) {
        return after;
    }
    const stale = staleVersions(project.record, before.resolved, after.resolved, catalogue);
    return stale ? failure(stale) : planFiles(project, before.resolved, after.resolved, request);
}

function nextSet(before: ResolvedAddons, request: AddonChangeRequest, engine: string | undefined, catalogue: Catalogue): Resolution {
    const present = new Set(before.addons.map(addon => addon.manifest.id));
    const picks = before.addons.filter(addon => !addon.manifest.hidden).map(addon => addon.manifest.id);
    if (request.kind === 'add') {
        const problem = additionProblem(request.addons, present, engine, catalogue);
        return problem
            ? failure(problem)
            : resolveAddons({ addons: [...picks, ...request.addons], options: { ...request.options, ...before.options } }, catalogue);
    }
    const problem = removalProblem(request.addons, picks, present, catalogue);
    return problem ? failure(problem) : resolveAddons({ addons: picks.filter(id => !request.addons.includes(id)), options: before.options }, catalogue);
}

function additionProblem(ids: readonly string[], present: ReadonlySet<string>, engine: string | undefined, catalogue: Catalogue): string | undefined {
    const unknown = ids.filter(id => !findAddon(catalogue, id));
    if (unknown.length > 0) {
        return `No add-on is called ${listing(unknown)}.`;
    }
    const addons = ids.map(id => findAddon(catalogue, id)!);
    const named = (list: readonly Addon[]) => listing(list.map(addon => addon.manifest.name));
    const already = addons.filter(addon => present.has(addon.manifest.id));
    if (already.length > 0) {
        return `The project has ${named(already)} already.`;
    }
    const hidden = addons.filter(addon => addon.manifest.hidden);
    if (hidden.length > 0) {
        return `${named(hidden)} can't be added by itself; it comes with the add-ons that need it.`;
    }
    const foreign = engine === undefined ? [] : addons.filter(addon => !supportsEngine(addon, engine));
    const engineLabel = catalogue.engines.find(entry => entry.id === engine)?.label ?? engine;
    return foreign.length > 0 ? `${named(foreign)} isn't offered for ${engineLabel}.` : undefined;
}

function removalProblem(ids: readonly string[], picks: readonly string[], present: ReadonlySet<string>, catalogue: Catalogue): string | undefined {
    const name = (id: string) => findAddon(catalogue, id)?.manifest.name ?? id;
    const absent = ids.filter(id => !present.has(id));
    if (absent.length > 0) {
        return `The project has no ${listing(absent.map(name))}.`;
    }
    const brought = ids.filter(id => !picks.includes(id));
    if (brought.length > 0) {
        return `${listing(brought.map(name))} came with other add-ons and goes when they do.`;
    }
    const remaining = picks.filter(id => !ids.includes(id));
    for (const id of ids) {
        const needing = remaining.find(other => dependencyClosure([other], catalogue).has(id));
        if (needing) {
            return `${name(id)} can't be removed, because ${name(needing)} needs it.`;
        }
    }
    return undefined;
}

/** A recorded add-on in another version can't take part in a change, since its files would mix both versions */
function staleVersions(record: AddonRecord | undefined, before: ResolvedAddons, after: ResolvedAddons, catalogue: Catalogue): string | undefined {
    if (!record) {
        return undefined;
    }
    const touched = touchedIds(before, after, catalogue);
    const stale = Object.entries(record.addons).flatMap(([id, version]) => {
        const addon = findAddon(catalogue, id);
        return addon && touched.has(id) && addon.manifest.version !== version ? [`${addon.manifest.name} ${version}, which this version of the helper has as ${addon.manifest.version}`] : [];
    });
    return stale.length > 0 ? `The project has ${listing(stale)}. The change involves it, so it isn't made: the files would mix both versions.` : undefined;
}

/** The add-ons that join, leave or change hands, and what they depend on */
function touchedIds(before: ResolvedAddons, after: ResolvedAddons, catalogue: Catalogue): Set<string> {
    const beforeIds = new Set(before.addons.map(addon => addon.manifest.id));
    const afterIds = new Set(after.addons.map(addon => addon.manifest.id));
    const changed = [...new Set([...beforeIds, ...afterIds])]
        .filter(id => beforeIds.has(id) !== afterIds.has(id) || before.superseded.has(id) !== after.superseded.has(id));
    return dependencyClosure(changed, catalogue);
}

function planFiles(project: ExistingProject, before: ResolvedAddons, after: ResolvedAddons, request: AddonChangeRequest): AddonChangeResult {
    const values = readProjectValues(project.manifest, project.files);
    const labels = labelsFor(before, after, request);
    const compositions = { before: composeAddons(before), after: composeAddons(after) };
    const previous = byPath(renderFiles(values, compositions.before));
    const next = byPath(renderFiles(values, compositions.after));
    const lineEnding = lineEndingOf(textOf(project.files.get(ENTRY_PATH)) ?? '\n');

    const creates: GeneratedOutput[] = [];
    const updates: FileUpdate[] = [];
    const skipped: string[] = [];
    for (const [file, wanted] of next) {
        const old = previous.get(file);
        const current = project.files.get(file);
        if (old !== undefined && sameContent(old, wanted)) {
            continue;
        }
        if (old === undefined) {
            if (current === undefined) {
                creates.push({ path: file, content: withLineEnding(wanted, lineEnding) });
            } else if (!sameContent(current, wanted)) {
                updates.push({ path: file, content: wholeFileConflict(textOf(current) ?? '', textOf(wanted) ?? '', labels), conflicts: 1 });
            }
        } else if (current === undefined) {
            skipped.push(file);
        } else {
            const merged = mergeFile(old, current, wanted, labels);
            if (merged && merged.text !== current) {
                updates.push({ path: file, content: merged.text, conflicts: merged.conflicts });
            }
        }
    }

    const leaving = [...previous].filter(([file]) => !next.has(file) && project.files.has(file));
    for (const [file] of leaving.filter(([file, old]) => !sameContent(project.files.get(file)!, old))) {
        updates.push({ path: file, content: wholeFileConflict(textOf(project.files.get(file)) ?? '', '', labels), conflicts: 1 });
    }
    const { deletes, stillImported, kept } = unimportedDeletions(leaving.filter(([file, old]) => sameContent(project.files.get(file)!, old)).map(([file]) => file), project, creates, updates);
    updates.push(...kept.map(file => ({ path: file, content: wholeFileConflict(textOf(project.files.get(file)) ?? '', '', labels), conflicts: 1 })));

    const contract = contractProblem(creates, project, updates, deletes, after);
    if (contract) {
        return failure(contract);
    }
    const plan: AddonChangePlan = {
        before,
        after,
        added: after.addons.filter(addon => !before.addons.includes(addon)),
        removed: before.addons.filter(addon => !after.addons.includes(addon)),
        creates,
        updates,
        deletes,
        skipped,
        stillImported,
        manifest: manifestChange(project, after, request, compositions),
        conflicts: updates.reduce((sum, update) => sum + update.conflicts, 0),
    };
    return { ok: true, plan };
}

function mergeFile(old: FileContent, current: FileContent, wanted: FileContent, labels: MergeLabels): { text: string; conflicts: number } | undefined {
    const [base, ours, theirs] = [old, current, wanted].map(textOf);
    return base === undefined || ours === undefined || theirs === undefined ? undefined : mergeTexts(base, ours, theirs, labels, mergeImportClash);
}

/**
 * The files that can go: a file still imported by one that stays is kept as a conflict instead, and so is
 * whatever that one imports in turn.
 */
function unimportedDeletions(candidates: readonly string[], project: ExistingProject, creates: readonly GeneratedOutput[], updates: readonly FileUpdate[]): { deletes: string[]; kept: string[]; stillImported: Record<string, string[]> } {
    const remaining = new Map(project.files);
    creates.forEach(output => remaining.set(output.path, output.content));
    updates.forEach(update => remaining.set(update.path, update.content));
    candidates.forEach(file => remaining.delete(file));
    let deletes = [...candidates];
    const kept: string[] = [];
    const stillImported: Record<string, string[]> = {};
    for (let changed = true; changed;) {
        changed = false;
        for (const file of deletes) {
            const importers = importersOf(file, remaining);
            if (importers.length > 0) {
                stillImported[file] = importers;
                kept.push(file);
                remaining.set(file, project.files.get(file)!);
                deletes = deletes.filter(other => other !== file);
                changed = true;
            }
        }
    }
    return { deletes, kept, stillImported };
}

function importersOf(file: string, files: ReadonlyMap<string, FileContent>): string[] {
    const module = file.endsWith(TYPESCRIPT) ? file.slice(0, -TYPESCRIPT.length) : file;
    return [...files].flatMap(([importer, content]) => {
        const text = textOf(content);
        if (importer === file || !importer.endsWith(TYPESCRIPT) || text === undefined) {
            return [];
        }
        const imports = [...text.matchAll(MODULE_IMPORT)].map(match => match[2]).filter(specifier => specifier.startsWith('.'));
        return imports.some(specifier => path.posix.join(path.posix.dirname(importer), specifier) === module) ? [importer] : [];
    });
}

/**
 * A project generated by an older version of the helper may lack a module, an export or a `GAME` member
 * the new files rely on, and then they wouldn't build.
 */
function contractProblem(creates: readonly GeneratedOutput[], project: ExistingProject, updates: readonly FileUpdate[], deletes: readonly string[], after: ResolvedAddons): string | undefined {
    const final = new Map(project.files);
    creates.forEach(output => final.set(output.path, output.content));
    updates.forEach(update => final.set(update.path, update.content));
    deletes.forEach(file => final.delete(file));
    for (const created of creates) {
        const text = textOf(created.content);
        if (!created.path.endsWith(TYPESCRIPT) || text === undefined) {
            continue;
        }
        const owner = ownerOf(created.path, after)?.manifest.name ?? created.path;
        const problem = importProblem(created.path, text, owner, final) ?? gameMemberProblem(text, owner, textOf(final.get(CONSTANTS_PATH)));
        if (problem) {
            return problem;
        }
    }
    return undefined;
}

function importProblem(file: string, text: string, owner: string, files: ReadonlyMap<string, FileContent>): string | undefined {
    for (const match of text.matchAll(NAMED_IMPORT)) {
        const specifier = match[3];
        if (!specifier.startsWith('.')) {
            continue;
        }
        const target = `${path.posix.join(path.posix.dirname(file), specifier)}${TYPESCRIPT}`;
        const targetText = textOf(files.get(target));
        if (targetText === undefined) {
            return `${owner} needs ${target}, which the project doesn't have.`;
        }
        const names = (match[1] ?? '').split(',').map(name => name.trim().split(/\s+as\s+/)[0]).filter(name => name.length > 0);
        const missing = names.filter(name => !exportsName(targetText, name));
        if (missing.length > 0) {
            return `${target} doesn't export ${listing(missing)}, which ${owner} needs. A project from an older version of the helper may name ${missing.length === 1 ? 'it' : 'them'} differently.`;
        }
    }
    return undefined;
}

function gameMemberProblem(text: string, owner: string, constants: string | undefined): string | undefined {
    const members = [...new Set([...text.matchAll(GAME_MEMBER)].map(match => match[1]))];
    const missing = members.filter(member => constants === undefined || !new RegExp(`(^|[\\s,{])${member}\\s*:`, 'm').test(constants));
    return missing.length > 0
        ? `GAME in ${CONSTANTS_PATH} has no ${listing(missing)}, which ${owner} uses. A project from an older version of the helper may call ${missing.length === 1 ? 'it' : 'them'} differently; rename ${missing.length === 1 ? 'it' : 'them'} first.`
        : undefined;
}

function exportsName(text: string, name: string): boolean {
    return new RegExp(`export\\s+(?:declare\\s+)?(?:async\\s+)?(?:function\\*?|const|let|var|class|interface|type|enum)\\s+${name}\\b`).test(text)
        || new RegExp(`export\\s*\\{[^}]*\\b${name}\\b[^}]*\\}`).test(text);
}

function ownerOf(file: string, set: ResolvedAddons): Addon | undefined {
    return set.addons.find(addon => addon.files.some(candidate => outputPathOf(addon, candidate.path) === file));
}

function manifestChange(project: ExistingProject, after: ResolvedAddons, request: AddonChangeRequest, compositions: { before: Composition; after: Composition }): AddonManifestChange {
    const previous = compositions.before.packageJson;
    const next = compositions.after.packageJson;
    const recorded = (id: string) => project.record && Object.hasOwn(project.record.addons, id) ? project.record.addons[id] : undefined;
    return {
        record: after.addons.length > 0
            ? { addons: Object.fromEntries(after.addons.map(addon => [addon.manifest.id, recorded(addon.manifest.id) ?? addon.manifest.version])), options: { ...after.options } }
            : undefined,
        engine: project.engine === undefined && request.kind === 'add' ? request.engine : undefined,
        devDependencies: entryChange(previous.devDependencies, next.devDependencies),
        scripts: { ...entryChange(previous.scripts, next.scripts), order: [...Object.keys(BASELINE_SCRIPTS), ...Object.keys(next.scripts)] },
        externals: {
            add: next.externals.filter(name => !previous.externals.includes(name)),
            remove: previous.externals.filter(name => !next.externals.includes(name)),
        },
    };
}

function entryChange(before: Readonly<Record<string, string>>, after: Readonly<Record<string, string>>): EntryChange {
    return {
        add: Object.fromEntries(Object.entries(after).filter(([name]) => !Object.hasOwn(before, name))),
        remove: Object.fromEntries(Object.entries(before).filter(([name]) => !Object.hasOwn(after, name))),
    };
}

function labelsFor(before: ResolvedAddons, after: ResolvedAddons, request: AddonChangeRequest): MergeLabels {
    const [from, to] = request.kind === 'add' ? [after, before] : [before, after];
    const names = from.addons.filter(addon => !addon.manifest.hidden && !to.addons.includes(addon)).map(addon => addon.manifest.name);
    return { ours: YOUR_PROJECT, theirs: `${request.kind === 'add' ? 'With' : 'Without'} ${listing(names)}` };
}

function byPath(outputs: readonly GeneratedOutput[]): Map<string, FileContent> {
    return new Map(outputs.map(output => [output.path, output.content]));
}

function textOf(content: FileContent | undefined): string | undefined {
    return typeof content === 'string' ? content : undefined;
}

/** Equal apart from line endings, so a project converted to CRLF still counts as untouched */
function sameContent(left: FileContent, right: FileContent): boolean {
    if (typeof left === 'string' || typeof right === 'string') {
        return typeof left === 'string' && typeof right === 'string' && linesOf(left).join('\n') === linesOf(right).join('\n');
    }
    return left.length === right.length && left.every((byte, index) => byte === right[index]);
}

function withLineEnding(content: FileContent, lineEnding: string): FileContent {
    return typeof content === 'string' && lineEnding !== '\n' ? content.replace(/\n/g, lineEnding) : content;
}

/** A refusal, which both a plan and a resolution can be */
function failure(problem: string): { readonly ok: false; readonly problem: string } {
    return { ok: false, problem };
}
