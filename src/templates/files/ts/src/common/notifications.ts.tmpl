import { fs, log, types, util } from 'vortex-api';
import { NOTIFICATION_IDS } from './constants';

/**
 * Ensures that a directory exists and is writable, otherwise warns the user.
 *
 * If the directory is not writable, an error is logged and a Vortex notification
 * is shown describing the problem and offering to open the folder.
 *
 * @param api - Vortex extension API.
 * @param absPath - Absolute path of the directory to check.
 * @returns A promise resolving to true if the directory is writable, false otherwise.
 */
export async function ensureWritableDirOrWarn(api: types.IExtensionApi, absPath: string): Promise<boolean> {
    try {
        await fs.ensureDirWritableAsync(absPath);
        return true;
    } catch (err) {
        log('error', `Directory "${absPath}" is not writable: ${err}`);
        api.sendNotification?.({
            id: NOTIFICATION_IDS.directoryNotWritable,
            type: 'warning',
            title: 'Directory Permissions Warning',
            message: `Directory "${absPath}" is not writable. Please ensure you have the necessary permissions to write to this directory.`,
            actions: [
                apiMakeOpenUrlFunction('Open folder', absPath),
            ],
        });
        return false;
    }
}

/**
 * Creates a Vortex notification action that opens a URL using `util.opn`.
 *
 * @param title - Display title of the action button.
 * @param url - URL to open when the action is invoked.
 * @returns A notification action descriptor.
 */
export function apiMakeOpenUrlFunction(title: string, url: string): types.INotificationAction {
    return {
        title,
        action: () => util.opn(url).catch(() => undefined),
    };
}

/**
 * Creates a Vortex notification action that re-checks a condition and
 * dismisses a notification if the condition is now satisfied.
 *
 * Typically used to allow the user to click "Check again" after installing
 * a mod loader manually.
 *
 * @param title - Display title of the action button.
 * @param notificationId - ID of the notification to potentially dismiss.
 * @param api - Vortex extension API.
 * @param checkFunction - Function that returns true when the condition is satisfied.
 * @returns A notification action descriptor.
 */
export function apiMakeCheckAndDismissFunction(title: string, notificationId: string, api: types.IExtensionApi, checkFunction: () => boolean): types.INotificationAction {
    return {
        title,
        action: () => apiCheckAndDismissFunction(notificationId, api, checkFunction),
    };
}

/**
 * Checks a condition and dismisses the specified notification if it holds.
 *
 * @param notificationId - ID of the notification to dismiss.
 * @param api - Vortex extension API.
 * @param checkFunction - Condition function; if it returns true, the notification is dismissed.
 */
function apiCheckAndDismissFunction(notificationId: string, api: types.IExtensionApi, checkFunction: () => boolean): void {
    if (checkFunction()) {
        api.dismissNotification?.(notificationId);
    }
}
