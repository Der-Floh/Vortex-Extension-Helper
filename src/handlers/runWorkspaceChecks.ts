import * as vscode from 'vscode';
import { MANIFEST } from '../constants';
import type { Finding, Severity, VortexProject } from '../types/project';
import { Logger } from '../utils/logger';
import { NO_PROJECT_MESSAGE } from '../utils/projectPicker';
import type { VortexDiagnostics } from '../utils/vortexDiagnostics';
import type { VortexWorkspaceTracker } from '../utils/vortexWorkspaceTracker';

const SHOW_PROBLEMS = 'Show Problems';
const SHOW_LOG = 'Show Log';
const SEVERITY_ORDER: readonly Severity[] = ['error', 'warning', 'information'];

/** Checks every detected project, logs each finding and shows a summary */
export async function handleRunWorkspaceChecks(tracker: VortexWorkspaceTracker, diagnostics: VortexDiagnostics): Promise<void> {
    await tracker.refreshAll();
    for (const folder of tracker.legacyFolders) {
        const message = `${folder.name} has a root info.json, the old layout, which is no longer recognised. Move its fields into package.json (name, displayName, version, description, author and gameart); the build generates .pack/info.json from them.`;
        Logger.warn(message);
        vscode.window.showWarningMessage(`${MANIFEST.displayName}: ${message}`);
    }
    if (tracker.projects.length === 0) {
        if (tracker.legacyFolders.length === 0) {
            vscode.window.showInformationMessage(`${MANIFEST.displayName}: ${NO_PROJECT_MESSAGE}`);
        }
        return;
    }

    const results = await diagnostics.validateAll();
    for (const [project, findings] of results) {
        logFindings(project, findings);
    }

    const all = [...results.values()].flat();
    vscode.window.showInformationMessage(`${MANIFEST.displayName}: ${summarize(all)} in ${pluralize(results.size, 'project')}.`, SHOW_PROBLEMS, SHOW_LOG)
        .then(choice => {
            if (choice === SHOW_PROBLEMS) {
                void vscode.commands.executeCommand('workbench.actions.view.problems');
            } else if (choice === SHOW_LOG) {
                Logger.show();
            }
        });
}

function logFindings(project: VortexProject, findings: readonly Finding[]): void {
    Logger.info(`${project.folder.name}: ${summarize(findings)}.`);
    for (const finding of [...findings].sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity))) {
        Logger.info(`[${finding.severity}] ${project.folder.name}/${finding.file}: ${finding.message} (${finding.rule})`);
    }
}

function summarize(findings: readonly Finding[]): string {
    if (findings.length === 0) {
        return 'No problems';
    }
    return SEVERITY_ORDER
        .map(severity => [severity, findings.filter(finding => finding.severity === severity).length] as const)
        .filter(([, count]) => count > 0)
        .map(([severity, count]) => pluralize(count, severity === 'information' ? 'note' : severity))
        .join(', ');
}

function pluralize(count: number, noun: string): string {
    return `${count} ${noun}${count === 1 ? '' : 's'}`;
}
