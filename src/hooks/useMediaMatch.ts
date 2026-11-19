import { useEffect, useState } from 'react';

/** Keep responsive rendering choices in sync with the current browser settings. */
export function useMediaMatch(queryText: string) {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' && !!window.matchMedia?.(queryText).matches
  );

  useEffect(() => {
    const query = window.matchMedia?.(queryText);
    if (!query) return;
    const update = () => setMatches(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, [queryText]);

  return matches;
}
