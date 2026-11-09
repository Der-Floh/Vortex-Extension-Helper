import * as assert from 'assert';
import * as vscode from 'vscode';
import { ACTIVITY_BUILD, ACTIVITY_DEPLOY, ProjectActivity, type ActivityChange } from '../../project/projectActivity';

function folder(name: string): vscode.WorkspaceFolder {
    return { uri: vscode.Uri.file(`/${name}`), name, index: 0 };
}

/** A task that keeps running until the test ends it */
function heldTask<T>(result: T): { task: () => Promise<T>; finish: () => void } {
    let finish = () => { };
    const task = () => new Promise<T>(resolve => {
        finish = () => resolve(result);
    });
    return { task, finish: () => finish() };
}

suite('Project activity', () => {
    test('a second action on a busy folder never starts', async () => {
        const activity = new ProjectActivity();
        const project = folder('busy');
        const first = heldTask('first');
        const running = activity.run(project, ACTIVITY_BUILD, first.task);

        let started = false;
        const refused = await activity.run(project, ACTIVITY_DEPLOY, async () => {
            started = true;
        });

        assert.strictEqual(refused, undefined);
        assert.strictEqual(started, false);
        assert.strictEqual(activity.current(project), ACTIVITY_BUILD);
        first.finish();
        assert.strictEqual(await running, 'first');
        assert.strictEqual(activity.current(project), undefined);
        activity.dispose();
    });

    test('another folder can run at the same time', async () => {
        const activity = new ProjectActivity();
        const first = heldTask(undefined);
        const running = activity.run(folder('one'), ACTIVITY_BUILD, first.task);

        assert.strictEqual(await activity.run(folder('two'), ACTIVITY_BUILD, async () => 'done'), 'done');

        first.finish();
        await running;
        activity.dispose();
    });

    test('a failed action releases the folder and passes its error on', async () => {
        const activity = new ProjectActivity();
        const project = folder('failing');
        await assert.rejects(activity.run(project, ACTIVITY_BUILD, async () => {
            throw new Error('npm failed');
        }), /npm failed/);
        assert.strictEqual(activity.current(project), undefined);
        assert.strictEqual(await activity.run(project, ACTIVITY_BUILD, async () => 'again'), 'again');
        activity.dispose();
    });

    test('the start and the end are reported, and a refused action reports neither', async () => {
        const activity = new ProjectActivity();
        const project = folder('reported');
        const changes: Pick<ActivityChange, 'activity' | 'running'>[] = [];
        activity.onDidChange(change => changes.push({ activity: change.activity, running: change.running }));
        const first = heldTask(undefined);
        const running = activity.run(project, ACTIVITY_BUILD, first.task);
        await activity.run(project, ACTIVITY_DEPLOY, async () => undefined);
        first.finish();
        await running;
        assert.deepStrictEqual(changes, [{ activity: ACTIVITY_BUILD, running: true }, { activity: ACTIVITY_BUILD, running: false }]);
        activity.dispose();
    });
});
