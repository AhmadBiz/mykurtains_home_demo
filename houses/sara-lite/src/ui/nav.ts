/**
 * Navigation helpers: storey focus and browser-history sync for the selected window and the storey.
 *
 * - Opening a window from the overview pushes a history entry (`#w-ch1-e`), so the phone Back gesture returns
 *   to the list instead of leaving the app. Moving between windows (stepper, model) replaces it.
 * - The storey lives in the hash (`#etage`, `#rez`, `#sous-sol`) via replaceState; a reload or a shared link
 *   reopens the same view.
 * - Whoever changes the storey (tabs, model chips, debug API), a selected window on another storey is closed,
 *   so the panel never edits a window the model is not showing.
 */
import { useEffect } from 'react';
import { WINDOW_BY_ID } from '../data/geometry';
import type { LevelId } from '../data/types';
import { useStore } from '../store/useStore';
import type { LevelFilter } from '../store/useStore';
import { LEVEL_HASH } from './text';

type HistState = { w?: string | null } | null;

const hashFor = (f: LevelFilter) => (f === 'all' ? '' : '#' + LEVEL_HASH[f]);
const levelFromHash = (h: string): LevelId | undefined =>
  (Object.keys(LEVEL_HASH) as LevelId[]).find((l) => '#' + LEVEL_HASH[l] === h);
const url = (hash: string) => location.pathname + location.search + hash;
const histW = () => (history.state as HistState)?.w ?? null;

/** Focus a storey: closes the selected window when it is on another storey, then sets the filter. */
export function focusLevel(l: LevelFilter) {
  const s = useStore.getState();
  const sel = s.selectedWindowId ? WINDOW_BY_ID.get(s.selectedWindowId) : undefined;
  if (sel && l !== 'all' && sel.level !== l) s.selectWindow(null);
  s.setLevelFilter(l);
}

/** Back to the overview: through browser history when the window was opened with a history entry. */
export function closeWindow() {
  if (histW()) history.back();
  else useStore.getState().selectWindow(null);
}

/** Apply the URL hash: a window id opens it (over its storey's list), a storey slug focuses it. */
function applyHash() {
  const h = location.hash;
  const wid = h.length > 1 ? decodeURIComponent(h.slice(1)) : '';
  const w = WINDOW_BY_ID.get(wid);
  const s = useStore.getState();
  if (w) {
    // Overview entry underneath, so Back from a shared window link lands on its storey's list.
    history.replaceState({ w: null }, '', url(hashFor(w.level)));
    s.selectWindow(null);
    s.setLevelFilter(w.level);
    s.selectWindow(w.id); // pushes the window entry (subscription)
  } else {
    const l = levelFromHash(h);
    if (s.selectedWindowId) s.selectWindow(null);
    if (l) s.setLevelFilter(l);
  }
}

let started = false;
let fromPop = false;

function start() {
  if (started) return;
  started = true;

  useStore.subscribe((s, prev) => {
    // Storey changed under a selected window on another storey (e.g. a model chip): close it.
    if (s.levelFilter !== prev.levelFilter && s.selectedWindowId && s.levelFilter !== 'all') {
      const sel = WINDOW_BY_ID.get(s.selectedWindowId);
      if (sel && sel.level !== s.levelFilter) {
        useStore.getState().selectWindow(null);
        return; // the nested update has synced history
      }
    }
    if (fromPop) return;
    if (s.selectedWindowId !== prev.selectedWindowId) {
      if (s.selectedWindowId && !prev.selectedWindowId && !histW()) {
        history.pushState({ w: s.selectedWindowId }, '', url('#' + s.selectedWindowId));
      } else if (s.selectedWindowId) {
        history.replaceState({ w: s.selectedWindowId }, '', url('#' + s.selectedWindowId));
      } else {
        // Closed without going back (storey change): keep the entry but make it the overview.
        history.replaceState({ w: null }, '', url(hashFor(s.levelFilter)));
      }
    } else if (s.levelFilter !== prev.levelFilter && !s.selectedWindowId) {
      history.replaceState(history.state, '', url(hashFor(s.levelFilter)));
    }
  });

  applyHash();
  // Mark the landing entry as ours, so returning to it restores the overview through the normal path.
  if (history.state == null) history.replaceState({ w: null }, '');

  window.addEventListener('popstate', (e) => {
    // A hand-edited hash or an outside link (no state of ours): apply it like a fresh load.
    if (e.state == null) {
      applyHash();
      return;
    }
    const id = (e.state as HistState)?.w ?? null;
    const target = id && WINDOW_BY_ID.has(id) ? id : null;
    fromPop = true;
    try {
      useStore.getState().selectWindow(target);
    } finally {
      fromPop = false;
    }
    // Back to the overview keeps the storey the visitor was on; write it into this entry.
    if (!target) history.replaceState({ w: null }, '', url(hashFor(useStore.getState().levelFilter)));
  });
}

/** Mount once (SidePanel): starts the history sync. */
export function useHistorySync() {
  useEffect(start, []);
}
