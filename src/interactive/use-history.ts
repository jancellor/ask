import { useEffect, useRef, useState } from 'react';
import { appendHistory, loadHistory } from '../agent/history-store.js';

export function useHistory() {
  const [history, setHistory] = useState<string[]>([]);
  const historyIndexRef = useRef<number | null>(null);
  const draftRef = useRef<string>('');

  useEffect(() => {
    void loadHistory().then(setHistory);
  }, []);

  const navigateUp = (currentInput: string): string | null => {
    if (historyIndexRef.current === null) {
      if (history.length === 0) return null;
      draftRef.current = currentInput;
      historyIndexRef.current = history.length - 1;
    } else if (historyIndexRef.current > 0) {
      historyIndexRef.current -= 1;
    } else {
      return null;
    }
    return history[historyIndexRef.current] ?? null;
  };

  const navigateDown = (): string | null => {
    if (historyIndexRef.current === null) return null;
    historyIndexRef.current += 1;
    if (historyIndexRef.current >= history.length) {
      historyIndexRef.current = null;
      return draftRef.current;
    }
    return history[historyIndexRef.current] ?? null;
  };

  const onSubmit = (entry: string): void => {
    setHistory((prev) => [...prev, entry]);
    void appendHistory(entry);
    historyIndexRef.current = null;
    draftRef.current = '';
  };

  return { navigateUp, navigateDown, onSubmit };
}
