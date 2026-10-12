import * as assert from 'assert';
import { detectLanguage, isVortexManifest } from '../../utils/detection';

suite('Detection', () => {
    test('a manifest with vortex-api in devDependencies is a Vortex project', () => {
        assert.ok(isVortexManifest({ devDependencies: { 'vortex-api': 'git+https://github.com/Nexus-Mods/vortex-api.git' } }));
    });

    test('anything else is not', () => {
        assert.ok(!isVortexManifest({ dependencies: { 'vortex-api': '1.0.0' } }));
        assert.ok(!isVortexManifest({ devDependencies: { typescript: '^6.0.3' } }));
        assert.ok(!isVortexManifest({ devDependencies: { 'vortex-api': 2 } }));
        assert.ok(!isVortexManifest([]));
        assert.ok(!isVortexManifest('vortex-api'));
        assert.ok(!isVortexManifest(undefined));
    });

    test('the entry file decides the language, then the config file', () => {
        const none = { indexTs: false, indexJs: false, tsconfig: false, jsconfig: false };
        assert.strictEqual(detectLanguage({ ...none, indexTs: true }), 'typescript');
        assert.strictEqual(detectLanguage({ ...none, indexJs: true, tsconfig: true }), 'javascript');
        assert.strictEqual(detectLanguage({ ...none, indexTs: true, indexJs: true }), 'typescript');
        assert.strictEqual(detectLanguage({ ...none, jsconfig: true }), 'javascript');
        assert.strictEqual(detectLanguage({ ...none, jsconfig: true, tsconfig: true }), 'typescript');
        assert.strictEqual(detectLanguage(none), 'typescript');
    });
});
