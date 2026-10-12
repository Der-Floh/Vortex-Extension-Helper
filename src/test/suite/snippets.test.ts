import * as assert from 'assert';
import { SNIPPETS_JS } from '../../utils/snippetsJs';
import { SNIPPETS_TS } from '../../utils/snippetsTs';

suite('Snippets', () => {
    test('TypeScript and JavaScript offer the same snippets', () => {
        assert.deepStrictEqual(Object.keys(SNIPPETS_JS), Object.keys(SNIPPETS_TS));
    });

    test('no snippet uses the patterns of the old template', () => {
        for (const [label, snippet] of [...Object.entries(SNIPPETS_TS), ...Object.entries(SNIPPETS_JS)]) {
            assert.ok(!/bluebird|Bloodstained|substr\(|findByAppId\(\[/.test(snippet.body), label);
            assert.ok(snippet.description, label);
        }
    });

    test('the patterns of the standard are used', () => {
        assert.ok(SNIPPETS_TS.tregisterGame.body.includes('util.toBlue(findGame)'));
        assert.ok(SNIPPETS_TS.tfindGameSteam.body.includes('\'steam\''));
        assert.ok(SNIPPETS_JS.tregisterGame.body.includes('util.toBlue(findGame)'));
    });

    test('JavaScript snippets have no type annotations and no @type on async functions', () => {
        for (const [label, snippet] of Object.entries(SNIPPETS_JS)) {
            assert.ok(!/: types\.|\): Promise</.test(snippet.body), label);
            assert.ok(!/@type \{types\.(TestSupported|InstallFunc)\}/.test(snippet.body), label);
        }
    });
});
