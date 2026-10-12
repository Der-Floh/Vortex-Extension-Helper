import * as fs from 'fs';
import * as path from 'path';
import Mocha from 'mocha';

export function run(): Promise<void> {
    const mocha = new Mocha({ ui: 'tdd', timeout: 60_000 });

    for (const file of fs.readdirSync(__dirname).filter(file => file.endsWith('.test.js'))) {
        mocha.addFile(path.join(__dirname, file));
    }

    return new Promise((resolve, reject) => {
        mocha.run((failures) => {
            if (failures > 0) {
                reject(new Error(`${failures} test(s) failed`));
            } else {
                resolve();
            }
        });
    });
}
