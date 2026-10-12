import * as vscode from 'vscode';
import { NEXUS_FETCH_TIMEOUT_MS, NEXUS_GAMES_URL } from '../constants';
import { isRecord } from './jsonUtils';

/** The fields of a games.json entry the wizard uses */
export interface NexusGame {
    readonly id: number;
    readonly name: string;
    readonly domainName: string;
    readonly genre?: string;
    readonly mods?: number;
    /** Unix time in seconds */
    readonly approvedDate?: number;
}

/**
 * Downloads the public list of games on Nexus Mods.
 *
 * @throws vscode.CancellationError if the token is cancelled.
 * @throws Error if the request fails or times out.
 */
export async function fetchNexusGames(token?: vscode.CancellationToken): Promise<NexusGame[]> {
    const controller = new AbortController();
    const cancellation = token?.onCancellationRequested(() => controller.abort());
    const timeout = setTimeout(() => controller.abort(new Error(`The Nexus Mods game list didn't load within ${NEXUS_FETCH_TIMEOUT_MS / 1000} seconds.`)), NEXUS_FETCH_TIMEOUT_MS);
    try {
        const response = await fetch(NEXUS_GAMES_URL, { headers: { Accept: 'application/json' }, signal: controller.signal });
        if (!response.ok) {
            throw new Error(`Loading the Nexus Mods game list failed: ${response.status} ${response.statusText}`);
        }
        return parseNexusGames(await response.json());
    } catch (e) {
        if (token?.isCancellationRequested) {
            throw new vscode.CancellationError();
        }
        throw controller.signal.aborted && controller.signal.reason instanceof Error ? controller.signal.reason : e;
    } finally {
        clearTimeout(timeout);
        cancellation?.dispose();
    }
}

/** Keeps the entries with a name and a domain */
export function parseNexusGames(data: unknown): NexusGame[] {
    if (!Array.isArray(data)) {
        throw new Error('The Nexus Mods game list has an unexpected format.');
    }
    return data.filter(isRecord).flatMap(entry => typeof entry.name === 'string' && entry.name && typeof entry.domain_name === 'string' && entry.domain_name
        ? [{
            id: typeof entry.id === 'number' ? entry.id : 0,
            name: entry.name,
            domainName: entry.domain_name,
            genre: typeof entry.genre === 'string' ? entry.genre : undefined,
            mods: typeof entry.mods === 'number' ? entry.mods : undefined,
            approvedDate: typeof entry.approved_date === 'number' ? entry.approved_date : undefined,
        }]
        : []);
}
