/*
import Nexus from '@nexusmods/nexus-api';
import { authenticateWithNexusMods, getStoredApiKey } from './nexusAuth';
import { NEXUS_API } from '../constants/strings';

export async function getNexusClient(useApiKey?: boolean) {
    let apiKey: string | undefined;

    if (useApiKey) {
        apiKey = NEXUS_API.API_KEY;
    } else {
        apiKey = await getStoredApiKey();
        if (!apiKey) {
            apiKey = await authenticateWithNexusMods();
        }
    }

    const nexus = await Nexus.create(
        apiKey,
        NEXUS_API.APP_NAME,
        NEXUS_API.APP_VERSION,
        NEXUS_API.DEFAULT_GAME
    );

    return nexus;
}
*/
