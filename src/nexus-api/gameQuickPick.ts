import * as vscode from 'vscode';
import type { IGameListEntry } from '@nexusmods/nexus-api';


interface IGameQuickPickItem extends vscode.QuickPickItem {
    game: IGameListEntry;
}

export async function pickGame(entries: IGameListEntry[]) {
    const items: IGameQuickPickItem[] = entries.map(game => ({
        label: game.name,
        description: String(game.id),
        detail: `genre: ${game.genre} | mods: ${formatNumberShort(game.mods)}${getLocaleDateStringOrEmpty(game.approved_date)}`,
        game,
    }));

    const picked = await vscode.window.showQuickPick(items, {
        title: 'Select a game',
        placeHolder: 'Select a game',
        matchOnDescription: true,
        matchOnDetail: true,
        ignoreFocusOut: true,
    });

    if (!picked) {
        return;
    }

    return picked.game;
}

function formatNumberShort(value: number, decimals = 1): string {
    const units = [
        { value: 1e12, symbol: 't' },
        { value: 1e9, symbol: 'b' },
        { value: 1e6, symbol: 'm' },
        { value: 1e3, symbol: 'k' },
    ];

    for (const unit of units) {
        if (Math.abs(value) >= unit.value) {
            return (
                (value / unit.value)
                    .toFixed(decimals)
                    .replace(/\.0+$/, '') + unit.symbol
            );
        }
    }

    return value.toString();
}

function getLocaleDateStringOrEmpty(timestamp: number) {
    if (!timestamp || timestamp <= 1) {
        return '';
    }
    const date = new Date(timestamp * 1000);
    return ` | date: ${date.toLocaleDateString()}`;
}
