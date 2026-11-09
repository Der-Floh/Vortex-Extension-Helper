import * as assert from 'assert';
import { SNIPPETS } from '../../snippets/snippets';

suite('Snippets', () => {
    test('no snippet uses the patterns of the old template', () => {
        for (const [label, snippet] of Object.entries(SNIPPETS)) {
            assert.ok(!/bluebird|Bloodstained|substr\(|findByAppId\(\[|\bGAME\.(exe|modsDir|requiredFiles)\b/.test(snippet.body), label);
            assert.ok(snippet.description, label);
        }
    });

    test('the patterns of the standard are used', () => {
        assert.ok(SNIPPETS.tregisterGame.body.includes('util.toBlue(findGame)'));
        assert.ok(SNIPPETS.tfindGameSteam.body.includes('\'steam\''));
    });
});
