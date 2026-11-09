import type { VortexDiagnostics } from '../checks/vortexDiagnostics';
import { installProjectDependencies } from '../project/dependencyInstaller';
import { pickVortexProject } from '../project/projectPicker';
import type { VortexWorkspaceTracker } from '../project/vortexWorkspaceTracker';
import { requireTrust } from '../utils/trust';

export async function handleInstallDependencies(tracker: VortexWorkspaceTracker, diagnostics: VortexDiagnostics): Promise<void> {
    const project = await pickVortexProject(tracker);
    if (!project || !requireTrust()) {
        return;
    }
    await installProjectDependencies(project.folder, diagnostics);
}
