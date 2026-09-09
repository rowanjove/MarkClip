import type { ClipRequest, ClipResult } from '../../shared/contracts';

export type BatchState = 'queued' | 'running' | 'success' | 'warning' | 'failed' | 'cancelled';
export interface BatchTask { id: string; tabId: number; url: string; title: string; state: BatchState; error?: string; result?: ClipResult; startedAt?: string; finishedAt?: string; }

export class BatchQueue {
  readonly tasks: BatchTask[] = [];
  private paused = false;
  private readonly controllers = new Map<string, AbortController>();
  private runPromise: Promise<void> | null = null;

  constructor(private readonly concurrency = 2) {}

  enqueue(tabs: Array<{ id: number; url?: string; title?: string }>): BatchTask[] {
    const added = tabs.filter((tab) => /^https?:/i.test(tab.url || '')).map((tab) => ({ id: crypto.randomUUID(), tabId: tab.id, url: tab.url || '', title: tab.title || tab.url || 'page', state: 'queued' as const }));
    this.tasks.push(...added); return added;
  }

  pause(): void { this.paused = true; }
  resume(): void { this.paused = false; }
  cancel(id?: string): void {
    const targets = id ? this.tasks.filter((task) => task.id === id) : this.tasks.filter((task) => ['queued', 'running'].includes(task.state));
    for (const task of targets) { task.state = 'cancelled'; this.controllers.get(task.id)?.abort(); }
  }
  retryFailed(): void { this.tasks.filter((task) => task.state === 'failed').forEach((task) => { task.state = 'queued'; task.error = undefined; }); }

  run(request: Partial<ClipRequest>, worker: (task: BatchTask, request: Partial<ClipRequest>, signal: AbortSignal) => Promise<ClipResult>): Promise<void> {
    if (this.runPromise) return this.runPromise;
    this.runPromise = this.runInternal(request, worker).finally(() => { this.runPromise = null; });
    return this.runPromise;
  }

  private async runInternal(request: Partial<ClipRequest>, worker: (task: BatchTask, request: Partial<ClipRequest>, signal: AbortSignal) => Promise<ClipResult>): Promise<void> {
    const active = new Set<Promise<void>>();
    const next = async (): Promise<void> => {
      while (!this.paused) {
        const task = this.tasks.find((item) => item.state === 'queued');
        if (!task) break;
        task.state = 'running'; task.startedAt = new Date().toISOString();
        const controller = new AbortController(); this.controllers.set(task.id, controller);
        const run = worker(task, request, controller.signal).then((result) => { if (task.state !== 'cancelled') { task.result = result; task.state = result.warnings.length ? 'warning' : 'success'; } }).catch((error) => { if (task.state !== 'cancelled') { task.state = 'failed'; task.error = error instanceof Error ? error.message : String(error); } }).finally(() => { task.finishedAt = new Date().toISOString(); this.controllers.delete(task.id); });
        active.add(run); void run.finally(() => active.delete(run));
        if (active.size >= this.concurrency) await Promise.race(active);
      }
      await Promise.all(active);
    };
    await next();
  }
}
