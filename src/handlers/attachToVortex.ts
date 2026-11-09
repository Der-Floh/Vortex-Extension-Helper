import { DEBUG_PORT_DEFAULT } from '../constants';
import { confirmTopLevelBreakpoints, reportFailure, reportOutcome, requireJsDebug } from '../debug/debugDialogs';
import { runAttachFlow } from '../debug/debugFlow';
import { pickVortexProject } from '../project/projectPicker';
import type { VortexWorkspaceTracker } from '../project/vortexWorkspaceTracker';
import type { ProjectTarget } from '../types/project';
import { getConfiguration } from '../utils/configuration';
import { withNotificationProgress } from '../utils/notifications';
import { requireTrust } from '../utils/trust';

/** Attaches to the running Vortex as it is, without building or restarting anything */
export async function handleAttachToVortex(tracker: VortexWorkspaceTracker, target?: ProjectTarget): Promise<void> {
    const project = await pickVortexProject(tracker, target);
    if (!project || !requireTrust() || !requireJsDebug() || !await confirmTopLevelBreakpoints(project)) {
        return;
    }
    const port = getConfiguration().debugPort ?? DEBUG_PORT_DEFAULT;
    try {
        reportOutcome(await withNotificationProgress(`Attaching to Vortex for ${project.folder.name}`, (progress, token) => runAttachFlow({
            project,
            port,
            report: message => progress.report({ message }),
            token,
        }), true));
    } catch (e) {
        reportFailure(project, e, 'attach to Vortex for');
    }
}
