import type { VortexDiagnostics } from '../checks/vortexDiagnostics';
import { installProjectDependencies } from '../project/dependencyInstaller';
import type { ProjectActivity } from '../project/projectActivity';
import { pickVortexProject } from '../project/projectPicker';
import type { VortexWorkspaceTracker } from '../project/vortexWorkspaceTracker';
import type { ProjectTarget } from '../types/project';
import { requireTrust } from '../utils/trust';

export async function handleInstallDependencies(tracker: VortexWorkspaceTracker, diagnostics: VortexDiagnostics, activity: ProjectActivity, target?: ProjectTarget): Promise<void> {
    const project = await pickVortexProject(tracker, target);
    if (!project || !requireTrust()) {
        return;
    }
    await installProjectDependencies(project.folder, diagnostics, activity);
}
