import type { VortexDiagnostics } from '../checks/vortexDiagnostics';
import { reportBlockers, runProjectAction } from '../debug/debugDialogs';
import { runBuild, saveForBuild } from '../project/npmTasks';
import { ACTIVITY_BUILD, type ProjectActivity } from '../project/projectActivity';
import { pickVortexProject } from '../project/projectPicker';
import type { VortexWorkspaceTracker } from '../project/vortexWorkspaceTracker';
import type { ProjectTarget } from '../types/project';
import { showInfo, withNotificationProgress } from '../utils/notifications';
import { requireTrust } from '../utils/trust';

export async function handleBuild(tracker: VortexWorkspaceTracker, diagnostics: VortexDiagnostics, activity: ProjectActivity, target?: ProjectTarget): Promise<void> {
    const project = await pickVortexProject(tracker, target);
    if (!project || !requireTrust() || !await reportBlockers(project, diagnostics)) {
        return;
    }
    await runProjectAction({ project, validator: diagnostics, activity }, ACTIVITY_BUILD, 'build', async () => {
        await saveForBuild(project.folder);
        await withNotificationProgress(`Building ${project.folder.name}`, (_progress, token) => runBuild(project.folder, token), true);
        showInfo(`Built ${project.folder.name}.`);
    });
}
