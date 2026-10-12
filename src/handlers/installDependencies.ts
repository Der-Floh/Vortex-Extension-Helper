import { installProjectDependencies } from '../utils/dependencyInstaller';
import { pickVortexProject } from '../utils/projectPicker';
import { requireTrust } from '../utils/trust';
import type { VortexDiagnostics } from '../utils/vortexDiagnostics';
import type { VortexWorkspaceTracker } from '../utils/vortexWorkspaceTracker';

export async function handleInstallDependencies(tracker: VortexWorkspaceTracker, diagnostics: VortexDiagnostics): Promise<void> {
    const project = await pickVortexProject(tracker);
    if (!project || !requireTrust()) {
        return;
    }
    await installProjectDependencies(project.folder, diagnostics);
}
