// Mirrors src/tui/useData.ts — polling hook for live data
import { useState, useEffect, useCallback, useRef } from 'react';

export interface UsePollResult<T> {
  data: T | null;
  error: string;
  reload: () => void;
}

export function usePoll<T>(fn: () => Promise<T>, pollMs = 3000): UsePollResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    let live = true;

    const run = async () => {
      try {
        const d = await fnRef.current();
        if (live) {
          setData(d);
          setError('');
        }
      } catch (e) {
        if (live) setError(String((e as Error).message || e));
      }
    };

    run();

    let interval: ReturnType<typeof setInterval> | null = null;
    if (pollMs && pollMs > 0) {
      interval = setInterval(run, pollMs);
    }

    return () => {
      live = false;
      if (interval) clearInterval(interval);
    };
  }, [tick, pollMs]);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  return { data, error, reload };
}