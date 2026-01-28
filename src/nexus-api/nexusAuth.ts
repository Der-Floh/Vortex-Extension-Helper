/*
import * as vscode from 'vscode';
import WebSocket from 'ws';
import { randomUUID } from 'crypto';
import { NEXUS_API } from '../constants/strings';
import { Logger } from '../utils/logger';

let secretStorage: vscode.SecretStorage | undefined;

export function initializeNexusSecretStorage(context: vscode.ExtensionContext) {
    secretStorage = context.secrets;
}

async function saveApiKey(apiKey: string): Promise<void> {
    if (!secretStorage) {
        throw new Error('Secret storage not initialized. Call initializeNexusSecretStorage(context) in activate().');
    }

    await secretStorage.store(NEXUS_API.API_KEY_SECRET, apiKey);
}

export async function getStoredApiKey(): Promise<string | undefined> {
    if (!secretStorage) {
        throw new Error('Secret storage not initialized. Call initializeNexusSecretStorage(context) in activate().');
    }

    return (await secretStorage.get(NEXUS_API.API_KEY_SECRET)) ?? undefined;
}

export async function authenticateWithNexusMods(): Promise<string> {
    return new Promise<string>((resolve, reject) => {
        const id = randomUUID();
        const ws = new WebSocket(NEXUS_API.SSO_URL);

        let pingTimer: NodeJS.Timeout | undefined;
        let resolved = false;

        const cleanUp = () => {
            if (pingTimer) {
                clearInterval(pingTimer);
            }
            if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
                ws.close();
            }
        };

        ws.on('open', async () => {
            // 1) Send id + appid
            ws.send(JSON.stringify({
                id,
                appid: NEXUS_API.APP_ID
            }));

            // 2) Start pinging every 30s
            pingTimer = setInterval(() => {
                try {
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.ping();
                    }
                } catch {
                    // ignore ping errors
                }
            }, 30_000);

            // 3) Open browser so user can authorize
            const ssoUri = vscode.Uri.parse(`${NEXUS_API.SSO_BROWSER_URL}?id=${encodeURIComponent(id)}`);
            vscode.env.openExternal(ssoUri);
        });

        ws.on('message', async (data) => {
            if (resolved) {
                return;
            }

            // According to docs, this is just the plain API key
            const apiKey = data.toString().trim();

            if (!apiKey || apiKey.length < 10) { // sanity check
                cleanUp();
                return reject(new Error('Received invalid API key from Nexus SSO.'));
            }

            resolved = true;
            cleanUp();

            try {
                await saveApiKey(apiKey);
            } catch (e) {
                Logger.error('Failed to save Nexus API key:', e);
                // Still resolve with the key, but warn user via VS Code UI
                vscode.window.showWarningMessage('Authenticated with Nexus Mods, but failed to store the API key securely. You may need to re-authenticate later.');
            }

            resolve(apiKey);
        });

        ws.on('error', (err) => {
            if (!resolved) {
                resolved = true;
                cleanUp();
                reject(err);
            }
        });

        ws.on('close', () => {
            if (!resolved) {
                resolved = true;
                cleanUp();
                reject(new Error('Nexus Mods SSO connection closed before receiving API key.'));
            }
        });
    });
}
*/
