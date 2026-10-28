/** Browser Web Locks model: queued exclusive ownership; abort cancels only waiters. */
export function createTestLocks(): LockManager {
  const held = new Set<string>();
  const queues = new Map<string, (() => void)[]>();
  return {
    request: (name: string, options: LockOptions, callback: LockGrantedCallback) => new Promise((resolve, reject) => {
      let granted = false;
      const queue = queues.get(name) ?? [];
      queues.set(name, queue);
      const cancel = () => {
        if (granted) return;
        const index = queue.indexOf(grant);
        if (index >= 0) queue.splice(index, 1);
        reject(new DOMException('Aborted', 'AbortError'));
      };
      const grant = () => {
        if (options.signal?.aborted) { cancel(); return; }
        granted = true;
        options.signal?.removeEventListener('abort', cancel);
        held.add(name);
        Promise.resolve().then(() => callback({name, mode: 'exclusive'} as Lock)).then(resolve, reject).finally(() => {
          held.delete(name);
          queue.shift()?.();
        });
      };
      if (options.signal?.aborted) { cancel(); return; }
      options.signal?.addEventListener('abort', cancel, {once: true});
      if (held.has(name)) queue.push(grant); else grant();
    }),
  } as unknown as LockManager;
}
