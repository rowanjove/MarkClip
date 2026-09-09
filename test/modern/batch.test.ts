import { describe, expect, it } from 'vitest';
import { BatchQueue } from '../../src/core/batch/queue';

describe('v1.5 batch queue', () => {
  it('limits concurrency and preserves warning state', async () => {
    const queue = new BatchQueue(2); const tasks = queue.enqueue([{ id: 1, url: 'https://a.test', title: 'a' }, { id: 2, url: 'https://b.test', title: 'b' }, { id: 3, url: 'chrome://settings', title: 'blocked' }]);
    let active = 0; let maxActive = 0;
    await queue.run({}, async (_task, _request, signal) => { active += 1; maxActive = Math.max(maxActive, active); await new Promise((resolve) => setTimeout(resolve, 10)); active -= 1; if (signal.aborted) throw new Error('cancelled'); return { id: 'x', markdown: '', metadata: {} as any, assets: [], warnings: ['image'], diagnostics: {} as any }; });
    expect(tasks).toHaveLength(2); expect(maxActive).toBeLessThanOrEqual(2); expect(tasks.every((task) => task.state === 'warning')).toBe(true);
  });

  it('shares one active run when resume/retry callers race', async () => {
    const queue = new BatchQueue(1); queue.enqueue([{ id: 1, url: 'https://a.test', title: 'a' }]);
    let calls = 0;
    const worker = async () => { calls += 1; await new Promise((resolve) => setTimeout(resolve, 5)); return { id: 'x', markdown: '', metadata: {}, assets: [], warnings: [], diagnostics: {} } as any; };
    const first = queue.run({}, worker); const second = queue.run({}, worker);
    expect(second).toBe(first); await Promise.all([first, second]); expect(calls).toBe(1);
  });
});
