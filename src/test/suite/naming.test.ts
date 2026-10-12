import * as assert from 'assert';
import {
    normalizeExecutable,
    packageNameFor,
    suggestExecutable,
    suggestGameId,
    toShortName,
    validateExecutable,
    validateGameId,
    validateShortName,
    validateSteamAppId,
} from '../../utils/naming';

suite('Naming', () => {
    test('suggests a Nexus Mods domain from a game name', () => {
        assert.strictEqual(suggestGameId('Coal LLC'), 'coalllc');
        assert.strictEqual(suggestGameId('Vampire Survivors'), 'vampiresurvivors');
        assert.strictEqual(suggestGameId('Baldur\'s Gate 3'), 'baldursgate3');
    });

    test('derives a short name from a domain', () => {
        assert.strictEqual(toShortName('coalllc'), 'coalllc');
        assert.strictEqual(toShortName('steins;gateelite'), 'steins-gateelite');
        assert.strictEqual(toShortName('NO-SKIN'), 'no-skin');
        assert.strictEqual(toShortName('outcast1.1'), 'outcast1-1');
        assert.strictEqual(packageNameFor('coalllc'), 'coalllc-support');
    });

    test('short names start with a letter, so the source map scheme stays valid', () => {
        assert.strictEqual(validateShortName('coalllc'), undefined);
        assert.strictEqual(validateShortName('terra-memoria'), undefined);
        assert.ok(validateShortName('7daystodie'));
        assert.ok(validateShortName(''));
        assert.ok(validateShortName('Coal'));
        assert.ok(validateShortName('a--b'));
        assert.ok(validateShortName('a-'));
    });

    test('validates the Nexus Mods domain', () => {
        assert.strictEqual(validateGameId('steins;gateelite'), undefined);
        assert.ok(validateGameId(' '));
        assert.ok(validateGameId('two words'));
        assert.ok(validateGameId('quo\'te'));
    });

    test('Steam app ids are digits; empty selects the placeholder', () => {
        assert.strictEqual(validateSteamAppId('3361510'), undefined);
        assert.strictEqual(validateSteamAppId(''), undefined);
        assert.ok(validateSteamAppId('abc'));
    });

    test('executables are relative to the game folder', () => {
        assert.strictEqual(normalizeExecutable(' .\\Bin\\Game.exe '), 'Bin/Game.exe');
        assert.strictEqual(validateExecutable('Bin\\Game.exe'), undefined);
        assert.strictEqual(validateExecutable(''), undefined);
        assert.ok(validateExecutable('C:\\Games\\Game.exe'));
        assert.ok(validateExecutable('/Game.exe'));
        assert.ok(validateExecutable('../Game.exe'));
        assert.strictEqual(suggestExecutable('Coal LLC: Deluxe?'), 'Coal LLC Deluxe.exe');
    });
});
