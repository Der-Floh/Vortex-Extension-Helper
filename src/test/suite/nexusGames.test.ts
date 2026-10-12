import * as assert from 'assert';
import { formatNumberShort } from '../../utils/gameQuickPick';
import { parseNexusGames } from '../../utils/nexusGames';

suite('Nexus games', () => {
    test('keeps the entries with a name and a domain', () => {
        const games = parseNexusGames([
            { id: 1, name: 'Coal LLC', domain_name: 'coalllc', genre: 'Simulation', mods: 12, approved_date: 1700000000 },
            { id: 2, name: '', domain_name: 'empty' },
            { id: 3, name: 'No Domain' },
            null,
            'text',
        ]);
        assert.deepStrictEqual(games, [{ id: 1, name: 'Coal LLC', domainName: 'coalllc', genre: 'Simulation', mods: 12, approvedDate: 1700000000 }]);
    });

    test('rejects a list that is no array', () => {
        assert.throws(() => parseNexusGames({ games: [] }));
    });

    test('formats large numbers short', () => {
        assert.strictEqual(formatNumberShort(999), '999');
        assert.strictEqual(formatNumberShort(1000), '1k');
        assert.strictEqual(formatNumberShort(1530), '1.5k');
        assert.strictEqual(formatNumberShort(2_000_000), '2m');
    });
});
