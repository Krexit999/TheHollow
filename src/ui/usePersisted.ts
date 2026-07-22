/**
 * Persisted UI preferences — NOT game state.
 *
 * The line, settled in Phase 11 for bulk-buy mode and again in Phase 14 for the
 * Crucible mixes and the Compendium: anything that is a RECORD OF PLAY belongs
 * in the save (and costs a version bump); anything that is a CONVENIENCE — how
 * you like the controls set, what you last typed — belongs here. A saved mix is
 * a bookmark, not a discovery. Losing one costs the player nothing they earned,
 * which is exactly the test.
 */
import { useCallback, useEffect, useState } from 'react';

const PREFIX = 'hollow.ui.';

function read<T>(key: string, fallback: T): T {
  if (typeof localStorage === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    // A corrupt or hand-edited preference must never stop the game booting.
    return fallback;
  }
}

export function usePersisted<T>(key: string, fallback: T): [T, (next: T) => void] {
  const [value, setValue] = useState<T>(() => read(key, fallback));
  const set = useCallback(
    (next: T) => {
      setValue(next);
      if (typeof localStorage === 'undefined') return;
      try {
        localStorage.setItem(PREFIX + key, JSON.stringify(next));
      } catch {
        // Quota or private mode — the preference simply does not persist.
      }
    },
    [key],
  );
  // Keep the value honest if the key changes under us.
  useEffect(() => { setValue(read(key, fallback)); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [key]);
  return [value, set];
}
