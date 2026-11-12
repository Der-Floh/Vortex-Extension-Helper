import { log, types } from 'vortex-api';
import { removeStaleGmlCaches } from './caches';
import { GML, GML_NOTIFICATIONS } from './constants';
import { isGmlInstalled } from './detection';
import { notifyGmlMissing } from './install';

/**
 * Removes Godot Mod Loader caches left from an older game version, and warns
 * if the loader is missing, offering to install it.
 *
 * @param discovery - The game discovery result from Vortex.
 * @param api - Vortex extension API.
 * @returns A promise that resolves once the check is complete.
 */
export async function prepareGodotModLoader(discovery: types.IDiscoveryResult, api: types.IExtensionApi): Promise<void> {
    await removeStaleGmlCaches(discovery)
        .catch(err => log('warn', `Failed to remove stale ${GML.name} caches: ${err}`));

    if (isGmlInstalled(discovery)) {
        api.dismissNotification?.(GML_NOTIFICATIONS.missing);
        return;
    }
    notifyGmlMissing(api, discovery);
}
