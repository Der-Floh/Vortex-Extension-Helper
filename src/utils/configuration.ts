import * as vscode from 'vscode';
import { CONFIG_ASK_EXECUTABLE, CONFIG_ASK_STEAM_APP_ID, CONFIG_AUTHOR, CONFIG_SECTION, CONFIG_USE_NEXUS_API } from '../constants';

export interface HelperConfiguration {
    useNexusApi: boolean | undefined;
    author: string | undefined;
    askSteamAppId: boolean | undefined;
    askExecutable: boolean | undefined;
}

// No inline fallbacks: the defaults contributed in package.json are the single source of truth,
// so a mistyped key surfaces as `undefined` instead of silently falling back to a default.
export function getConfiguration(): HelperConfiguration {
    const configuration = vscode.workspace.getConfiguration(CONFIG_SECTION);
    return {
        useNexusApi: configuration.get<boolean>(CONFIG_USE_NEXUS_API),
        author: configuration.get<string>(CONFIG_AUTHOR),
        askSteamAppId: configuration.get<boolean>(CONFIG_ASK_STEAM_APP_ID),
        askExecutable: configuration.get<boolean>(CONFIG_ASK_EXECUTABLE),
    };
}
