import * as vscode from 'vscode';
import type { NexusGame } from './nexusGames';

export interface GameIdentity {
    /** The Nexus Mods domain, which Vortex uses as the game id */
    readonly gameId: string;
    readonly gameName: string;
    /** The game's numerical Nexus Mods id, which info.json needs; undefined when it isn't known */
    readonly nexusGameId?: number;
}

interface GameQuickPickItem extends vscode.QuickPickItem {
    readonly game?: NexusGame;
}

const NUMBER_UNITS = [
    { value: 1e12, symbol: 't' },
    { value: 1e9, symbol: 'b' },
    { value: 1e6, symbol: 'm' },
    { value: 1e3, symbol: 'k' },
];

/**
 * Lets the user pick a game from the Nexus Mods list.
 *
 * @returns The game, `'manual'` for "Enter manually…", or undefined if cancelled.
 */
export async function pickNexusGame(games: readonly NexusGame[]): Promise<GameIdentity | 'manual' | undefined> {
    const items: GameQuickPickItem[] = [
        { label: '$(edit) Enter manually…', description: 'The game is not on Nexus Mods yet' },
        { label: '', kind: vscode.QuickPickItemKind.Separator },
        ...games.map(game => ({
            label: game.name,
            description: game.domainName,
            detail: gameDetail(game),
            game,
        })),
    ];

    const picked = await vscode.window.showQuickPick(items, {
        title: 'Select the game',
        placeHolder: 'Search the games on Nexus Mods',
        matchOnDescription: true,
        matchOnDetail: true,
        ignoreFocusOut: true,
    });
    if (!picked) {
        return undefined;
    }
    return picked.game
        ? { gameId: picked.game.domainName, gameName: picked.game.name, nexusGameId: picked.game.id || undefined }
        : 'manual';
}

export function formatNumberShort(value: number, decimals = 1): string {
    const unit = NUMBER_UNITS.find(candidate => Math.abs(value) >= candidate.value);
    return unit ? `${(value / unit.value).toFixed(decimals).replace(/\.0+$/, '')}${unit.symbol}` : value.toString();
}

function gameDetail(game: NexusGame): string {
    const parts = [
        game.genre ? `genre: ${game.genre}` : undefined,
        game.mods !== undefined ? `mods: ${formatNumberShort(game.mods)}` : undefined,
        game.approvedDate && game.approvedDate > 1 ? `date: ${new Date(game.approvedDate * 1000).toLocaleDateString()}` : undefined,
    ];
    return parts.filter(Boolean).join(' | ');
}
