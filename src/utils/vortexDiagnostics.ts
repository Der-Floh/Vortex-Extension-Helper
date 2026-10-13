import * as vscode from 'vscode';
import { DIAGNOSTIC_COLLECTION, DIAGNOSTIC_SOURCE, REVALIDATE_DEBOUNCE_MS } from '../constants';
import { CONSTANTS_PATH, PACKAGE_JSON_PATH } from '../templates/registry';
import type { Finding, Severity, VortexProject } from '../types/project';
import { errorMessage } from './errors';
import { offsetToPosition } from './jsonUtils';
import { Logger } from './logger';
import { readProjectSnapshot } from './projectSnapshot';
import { PACKAGE_LOCK_PATH, validateProject, type ProjectSnapshot } from './validation';
import type { FolderState, VortexWorkspaceTracker } from './vortexWorkspaceTracker';

const SEVERITIES: Readonly<Record<Severity, vscode.DiagnosticSeverity>> = {
    error: vscode.DiagnosticSeverity.Error,
    warning: vscode.DiagnosticSeverity.Warning,
    information: vscode.DiagnosticSeverity.Information,
};

/** Shows the findings of every detected project as diagnostics and keeps them current */
export class VortexDiagnostics implements vscode.Disposable {
    private readonly _collection = vscode.languages.createDiagnosticCollection(DIAGNOSTIC_COLLECTION);
    /** The URIs that have diagnostics, per project folder, so they can be cleared */
    private readonly _reported = new Map<string, vscode.Uri[]>();
    /** Increases with every validation of a folder, so a slower, older run can't overwrite a newer one */
    private readonly _generations = new Map<string, number>();
    private readonly _timers = new Map<string, ReturnType<typeof setTimeout>>();
    private readonly _disposables: vscode.Disposable[];

    constructor(private readonly tracker: VortexWorkspaceTracker) {
        this._disposables = [
            this._collection,
            tracker.onDidRefresh(state => this.onFolderRefreshed(state)),
            vscode.workspace.onDidChangeTextDocument(event => this.onDocumentChanged(event.document)),
            vscode.workspace.onDidCloseTextDocument(document => this.onDocumentChanged(document)),
        ];
    }

    /** Validates every detected project and returns its findings */
    async validateAll(): Promise<Map<VortexProject, Finding[]>> {
        const projects = this.tracker.projects;
        const findings = await Promise.all(projects.map(project => this.validate(project)));
        return new Map(projects.map((project, index) => [project, findings[index]]));
    }

    async validateFolder(folder: vscode.WorkspaceFolder): Promise<void> {
        const project = this.tracker.find(folder.uri);
        if (project) {
            await this.validate(project);
        }
    }

    async validate(project: VortexProject): Promise<Finding[]> {
        const key = project.folder.uri.toString();
        const generation = this.nextGeneration(key);
        const snapshot = await readProjectSnapshot(project);
        const findings = validateProject(snapshot);
        if (this._generations.get(key) === generation) {
            this.publish(project, snapshot, findings);
        }
        return findings;
    }

    dispose(): void {
        for (const timer of this._timers.values()) {
            clearTimeout(timer);
        }
        this._disposables.forEach(disposable => disposable.dispose());
    }

    private onFolderRefreshed({ folder, project }: FolderState): void {
        if (!project) {
            const key = folder.uri.toString();
            this.nextGeneration(key);
            this.clear(key);
            return;
        }
        this.validate(project).catch(e => Logger.error(`Failed to check ${folder.uri.fsPath}: ${errorMessage(e)}`));
    }

    private onDocumentChanged(document: vscode.TextDocument): void {
        const project = this.tracker.find(document.uri);
        if (!project || !isLiveValidated(project, document.uri)) {
            return;
        }
        const key = project.folder.uri.toString();
        clearTimeout(this._timers.get(key));
        this._timers.set(key, setTimeout(() => {
            this._timers.delete(key);
            this.validate(project).catch(e => Logger.error(`Failed to check ${project.folder.uri.fsPath}: ${errorMessage(e)}`));
        }, REVALIDATE_DEBOUNCE_MS));
    }

    private publish(project: VortexProject, snapshot: ProjectSnapshot, findings: readonly Finding[]): void {
        const key = project.folder.uri.toString();
        this.clear(key);

        const byFile = new Map<string, vscode.Diagnostic[]>();
        for (const finding of findings) {
            const diagnostics = byFile.get(finding.file) ?? [];
            diagnostics.push(toDiagnostic(finding, textOf(snapshot, finding.file)));
            byFile.set(finding.file, diagnostics);
        }

        const uris: vscode.Uri[] = [];
        for (const [file, diagnostics] of byFile) {
            const uri = vscode.Uri.joinPath(project.folder.uri, file);
            this._collection.set(uri, diagnostics);
            uris.push(uri);
        }
        this._reported.set(key, uris);
    }

    private nextGeneration(folderKey: string): number {
        const generation = (this._generations.get(folderKey) ?? 0) + 1;
        this._generations.set(folderKey, generation);
        return generation;
    }

    private clear(folderKey: string): void {
        for (const uri of this._reported.get(folderKey) ?? []) {
            this._collection.delete(uri);
        }
        this._reported.delete(folderKey);
    }
}

function isLiveValidated(project: VortexProject, uri: vscode.Uri): boolean {
    return [PACKAGE_JSON_PATH, CONSTANTS_PATH]
        .some(file => vscode.Uri.joinPath(project.folder.uri, file).toString() === uri.toString());
}

function textOf(snapshot: ProjectSnapshot, file: string): string | undefined {
    if (file === PACKAGE_JSON_PATH) {
        return snapshot.packageJsonText;
    }
    if (file === PACKAGE_LOCK_PATH) {
        return snapshot.packageLockText;
    }
    return file === snapshot.constants?.path ? snapshot.constants.text : undefined;
}

function toDiagnostic(finding: Finding, text: string | undefined): vscode.Diagnostic {
    const diagnostic = new vscode.Diagnostic(rangeOf(finding, text), finding.message, SEVERITIES[finding.severity]);
    diagnostic.source = DIAGNOSTIC_SOURCE;
    diagnostic.code = finding.rule;
    return diagnostic;
}

function rangeOf(finding: Finding, text: string | undefined): vscode.Range {
    if (text === undefined || finding.offset === undefined) {
        return new vscode.Range(0, 0, 0, 0);
    }
    const start = offsetToPosition(text, finding.offset);
    const end = offsetToPosition(text, finding.offset + (finding.length ?? 0));
    return new vscode.Range(start.line, start.character, end.line, end.character);
}
