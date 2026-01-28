import * as vscode from 'vscode';
import { IGameListEntry } from "@nexusmods/nexus-api";
import { NEXUS_API } from "../constants/strings";

export async function getNexusGames(token?: vscode.CancellationToken, timeoutMs: number = 5000) {
    const controller = new AbortController();
    const { signal } = controller;

    let tokenListener: vscode.Disposable | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    if (token) {
        if (token.isCancellationRequested) {
            controller.abort();
        } else {
            tokenListener = token.onCancellationRequested(() => {
                controller.abort();
            });
        }
    }

    if (timeoutMs > 0) {
        timeoutId = setTimeout(() => {
            controller.abort();
        }, timeoutMs);
    }

    try {
        const response = await fetch(NEXUS_API.GAMES_URL, {
            headers: {
                'Accept': 'application/json',
            },
            signal,
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch games: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        return data as IGameListEntry[];
    } catch (err: any) {
        // If cancelled via token/AbortController, fetch throws an AbortError
        if (err?.name === 'AbortError') {
            // Let callers distinguish cancellation from real errors
            throw new vscode.CancellationError();
        }
        throw err;
    } finally {
        tokenListener?.dispose();
        if (timeoutId) {
            clearTimeout(timeoutId);
        }
    }
}
