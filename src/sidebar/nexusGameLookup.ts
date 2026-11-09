import { getConfiguration } from '../utils/configuration';
import { errorMessage } from '../utils/errors';
import { Logger } from '../utils/logger';
import { fetchNexusGames, type NexusGame } from '../wizard/nexusGames';

export interface NexusGameLookupDeps {
    readonly fetchGames?: () => Promise<NexusGame[]>;
    readonly isEnabled?: () => boolean;
}

/** The public Nexus Mods game list by id, downloaded at most once per session unless asked to try again */
export class NexusGameLookup {
    private readonly fetchGames: () => Promise<NexusGame[]>;
    private readonly isEnabled: () => boolean;

    private _games: ReadonlyMap<number, NexusGame> | undefined;
    private _loading: Promise<void> | undefined;
    private _failed = false;

    constructor(private readonly onLoaded: () => void, deps: NexusGameLookupDeps = {}) {
        this.fetchGames = deps.fetchGames ?? fetchNexusGames;
        this.isEnabled = deps.isEnabled ?? (() => getConfiguration().useNexusApi === true);
    }

    /** Undefined while the list isn't available: switched off, still loading or failed */
    get games(): ReadonlyMap<number, NexusGame> | undefined {
        return this.isEnabled() ? this._games : undefined;
    }

    load(): Promise<void> {
        if (this._games !== undefined || this._failed || !this.isEnabled()) {
            return Promise.resolve();
        }
        this._loading ??= this.download().finally(() => {
            this._loading = undefined;
        });
        return this._loading;
    }

    /** A failed download isn't repeated by itself, which would mean a request every few seconds while offline */
    retry(): Promise<void> {
        this._failed = false;
        return this.load();
    }

    private async download(): Promise<void> {
        try {
            const games = await this.fetchGames();
            this._games = new Map(games.filter(game => game.id > 0).map(game => [game.id, game]));
            this.onLoaded();
        } catch (e) {
            this._failed = true;
            Logger.warn(`The Nexus Mods game list couldn't be loaded for the sidebar: ${errorMessage(e)}`);
        }
    }
}
