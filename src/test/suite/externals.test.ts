import * as assert from 'assert';
import { addExternal, readExternals, removeExternal } from '../../project/projectManifest';

suite('Externals', () => {
    test('adds vortex.externals with the file\'s indentation and keeps everything else', () => {
        const text = '{\n    "name": "x-support",\n    "devDependencies": {\n        "rollup": "^4.64.5"\n    }\n}\n';
        const edited = addExternal(text, 'winapi-bindings');
        assert.deepStrictEqual(JSON.parse(edited).vortex, { externals: ['winapi-bindings'] });
        assert.ok(edited.startsWith('{\n    "name": "x-support",\n    "devDependencies": {\n        "rollup": "^4.64.5"\n    },\n    "vortex": {\n        "externals": [\n            "winapi-bindings"\n        ]\n    }\n}'));
        assert.ok(edited.endsWith('}\n'));
    });

    test('keeps two spaces, tabs and CRLF', () => {
        assert.ok(addExternal('{\n  "name": "x"\n}', 'node-7z').includes('\n  "vortex": {\n    "externals": ['));
        assert.ok(addExternal('{\n\t"name": "x"\n}', 'node-7z').includes('\n\t"vortex": {\n\t\t"externals": ['));
        const crlf = addExternal('{\r\n    "name": "x"\r\n}\r\n', 'node-7z');
        assert.ok(!/[^\r]\n/.test(crlf));
    });

    test('appends to an existing list and is idempotent', () => {
        const once = addExternal('{\n    "vortex": {\n        "externals": ["turbowalk"]\n    }\n}', 'node-7z');
        assert.deepStrictEqual(readExternals(once), ['turbowalk', 'node-7z']);
        assert.strictEqual(addExternal(once, 'node-7z'), once);
    });

    test('removing the only external restores the file byte for byte', () => {
        const lf = '{\n    "name": "x-support",\n    "devDependencies": {\n        "rollup": "^4.64.5"\n    }\n}\n';
        const crlf = lf.replace(/\n/g, '\r\n');
        const twoSpaces = lf.replace(/ {4}/g, '  ');
        const tabs = lf.replace(/ {4}/g, '\t');
        for (const text of [lf, crlf, twoSpaces, tabs]) {
            assert.strictEqual(removeExternal(addExternal(text, 'winapi-bindings'), 'winapi-bindings'), text);
        }
    });

    test('removing one of several externals keeps the others', () => {
        const text = addExternal(addExternal('{\n    "name": "x"\n}\n', 'turbowalk'), 'node-7z');
        assert.deepStrictEqual(readExternals(removeExternal(text, 'turbowalk')), ['node-7z']);
    });

    test('removing the last external keeps other keys of vortex', () => {
        const text = '{\n    "vortex": {\n        "externals": ["node-7z"],\n        "other": true\n    }\n}\n';
        assert.deepStrictEqual(JSON.parse(removeExternal(text, 'node-7z')).vortex, { other: true });
    });

    test('removing a module that isn\'t listed changes nothing', () => {
        const text = '{\n    "vortex": {\n        "externals": ["turbowalk"]\n    }\n}\n';
        assert.strictEqual(removeExternal(text, 'node-7z'), text);
        assert.strictEqual(removeExternal('{}', 'node-7z'), '{}');
    });

    test('reads nothing from a manifest without the field', () => {
        assert.deepStrictEqual(readExternals('{}'), []);
        assert.deepStrictEqual(readExternals('{ "vortex": { "externals": "node-7z" } }'), []);
        assert.deepStrictEqual(readExternals('not json'), []);
    });
});
