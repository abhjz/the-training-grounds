import { useSyncExternalStore } from 'react';

/**
 * App setting: animate the 3D scenery (water, palms, birds, boats, fish...) or keep it still.
 * The drone has its own Play / Pause. The computer's "reduce motion" setting also keeps it still.
 */
const KEY = 'tg.sceneryMotion';
let enabled = (() => {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
})();
const listeners = new Set<() => void>();

export function setSceneryMotion(on: boolean) {
  enabled = on;
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {
    /* private mode: just don't remember it */
  }
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** The user's switch only (for the button). */
export const useSceneryMotionSetting = () => useSyncExternalStore(subscribe, () => enabled, () => true);

const prefersReduced = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Should the scenery move right now? Off when the user switched it off or the computer asks for reduced motion. */
export function useSceneryMotion() {
  const on = useSceneryMotionSetting();
  return on && !prefersReduced();
}
