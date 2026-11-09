import type { VortexDiagnostics } from '../checks/vortexDiagnostics';
import { reportBlockers, reportOutcome, resolveDeployTarget, runProjectAction } from '../debug/debugDialogs';
import { buildAndDeploy } from '../debug/debugFlow';
import { SYSTEM_LAUNCHER } from '../debug/vortexLauncher';
import { ACTIVITY_DEPLOY, type ProjectActivity } from '../project/projectActivity';
import { pickVortexProject } from '../project/projectPicker';
import type { VortexWorkspaceTracker } from '../project/vortexWorkspaceTracker';
import type { ProjectTarget } from '../types/project';
import { showInfo, withNotificationProgress } from '../utils/notifications';
import { requireTrust } from '../utils/trust';

/** Builds first, so a deployment can never mark old code as current */
export async function handleDeployToVortex(tracker: VortexWorkspaceTracker, diagnostics: VortexDiagnostics, activity: ProjectActivity, target?: ProjectTarget): Promise<void> {
    const project = await pickVortexProject(tracker, target);
    if (!project || !requireTrust() || !await reportBlockers(project, diagnostics)) {
        return;
    }
    const pluginsFolder = await resolveDeployTarget();
    if (!pluginsFolder) {
        return;
    }

    await runProjectAction({ project, validator: diagnostics, activity }, ACTIVITY_DEPLOY, 'deploy', async () => {
        const deployed = await withNotificationProgress(`Deploying ${project.folder.name}`, (progress, token) => buildAndDeploy({
            project,
            pluginsFolder,
            report: message => progress.report({ message }),
            token,
        }), true);
        if (typeof deployed !== 'string') {
            reportOutcome(deployed);
            return;
        }
        showInfo(await SYSTEM_LAUNCHER.isVortexRunning()
            ? `Deployed ${deployed}. Vortex only loads extensions when it starts, so restart it to load this build.`
            : `Deployed ${deployed}. Vortex loads it the next time it starts.`);
    });
}
