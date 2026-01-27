import * as vscode from 'vscode';
import WebSocket from 'ws';
import { randomUUID } from 'crypto';
import * as keytar from 'keytar';
import { NEXUS_API } from '../constants/strings';

const SSO_URL = 'wss://sso.nexusmods.com';
const SSO_BROWSER_URL = 'https://www.nexusmods.com/sso';

async function saveApiKey(apiKey: string): Promise<void> {
    const machineId = vscode.env.machineId;
    await keytar.setPassword(NEXUS_API.SERVICE_ID, machineId, apiKey);
}

export async function getStoredApiKey(): Promise<string | undefined> {
    const machineId = vscode.env.machineId;
    return await keytar.getPassword(NEXUS_API.SERVICE_ID, machineId) ?? undefined;
}

export async function authenticateWithNexusMods(): Promise<string> {
    return new Promise<string>((resolve, reject) => {
        const id = randomUUID();
        const ws = new WebSocket(SSO_URL);

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
            const ssoUri = vscode.Uri.parse(`${SSO_BROWSER_URL}?id=${encodeURIComponent(id)}`);
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
                console.error('Failed to save Nexus API key:', e);
                // Still resolve with the key, but warn user via VS Code UI
                vscode.window.showWarningMessage(
                    'Authenticated with Nexus Mods, but failed to store the API key securely. You may need to re-authenticate later.'
                );
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
