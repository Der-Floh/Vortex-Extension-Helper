import type { VortexDiagnostics } from '../checks/vortexDiagnostics';
import { DEBUG_PORT_DEFAULT } from '../constants';
import { confirmTopLevelBreakpoints, reportBlockers, reportOutcome, requireJsDebug, resolveInstall, runProjectAction, WINDOW_UI } from '../debug/debugDialogs';
import { runDebugFlow } from '../debug/debugFlow';
import { ACTIVITY_DEBUG, type ProjectActivity } from '../project/projectActivity';
import { pickVortexProject } from '../project/projectPicker';
import type { VortexWorkspaceTracker } from '../project/vortexWorkspaceTracker';
import type { ProjectTarget } from '../types/project';
import { getConfiguration } from '../utils/configuration';
import { withNotificationProgress } from '../utils/notifications';
import { requireTrust } from '../utils/trust';

/**
 * Builds the extension, deploys it to Vortex, starts Vortex with its DevTools port open and attaches to the renderer.
 *
 * Game extension code runs in Vortex's renderer, which loads the built bundle from the plugins
 * folder, so debugging means getting a current build there and attaching over the DevTools protocol.
 */
export async function handleDebugInVortex(tracker: VortexWorkspaceTracker, diagnostics: VortexDiagnostics, activity: ProjectActivity, target?: ProjectTarget): Promise<void> {
    const project = await pickVortexProject(tracker, target);
    if (!project || !requireTrust() || !requireJsDebug() || !await reportBlockers(project, diagnostics)) {
        return;
    }
    const port = getConfiguration().debugPort ?? DEBUG_PORT_DEFAULT;
    const install = await resolveInstall();
    if (!install || !await confirmTopLevelBreakpoints(project)) {
        return;
    }

    await runProjectAction({ project, validator: diagnostics, activity }, ACTIVITY_DEBUG, 'debug', async () => {
        reportOutcome(await withNotificationProgress(`Debugging ${project.folder.name}`, (progress, token) => runDebugFlow({
            project,
            install,
            port,
            ui: WINDOW_UI,
            report: message => progress.report({ message }),
            token,
        }), true));
    });
}
