import * as assert from 'assert';
import { SNIPPETS_TS } from '../../utils/snippetsTs';

suite('Snippets', () => {
    test('no snippet uses the patterns of the old template', () => {
        for (const [label, snippet] of Object.entries(SNIPPETS_TS)) {
            assert.ok(!/bluebird|Bloodstained|substr\(|findByAppId\(\[/.test(snippet.body), label);
            assert.ok(snippet.description, label);
        }
    });

    test('the patterns of the standard are used', () => {
        assert.ok(SNIPPETS_TS.tregisterGame.body.includes('util.toBlue(findGame)'));
        assert.ok(SNIPPETS_TS.tfindGameSteam.body.includes('\'steam\''));
    });
});
