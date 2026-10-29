/**
 * App state (zustand). Covering choices and language persist to localStorage.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { COVERING_BY_ID, DEFAULT_COVERINGS, defaultStateFor } from '../data/coverings';
import type { CoveringType, WindowCoveringState } from '../data/coverings';
import { WINDOWS, WINDOW_BY_ID } from '../data/geometry';
import type { LevelId } from '../data/types';

export type Lang = 'fr' | 'en';
export type LevelFilter = 'all' | LevelId;

interface State {
  lang: Lang;
  /** Which storey the model focuses on ('all' = whole house). */
  levelFilter: LevelFilter;
  selectedWindowId: string | null;
  hoveredWindowId: string | null;
  coverings: Record<string, WindowCoveringState>;
  /** Idle sway / light pulses paused by the visitor (also forced by prefers-reduced-motion). */
  motionPaused: boolean;

  setLang: (l: Lang) => void;
  setLevelFilter: (l: LevelFilter) => void;
  /** Select a window (null = back to the overview). Also focuses its storey. */
  selectWindow: (id: string | null) => void;
  setHovered: (id: string | null) => void;
  setMotionPaused: (v: boolean) => void;

  setCoveringType: (id: string, type: CoveringType) => void;
  updateCovering: (id: string, patch: Partial<WindowCoveringState>) => void;
  applyToRoom: (id: string) => void;
  applyToLevel: (id: string) => void;
  applyToAll: (id: string) => void;
  resetCovering: (id: string) => void;
  resetAllCoverings: () => void;
}

export const useStore = create<State>()(
  persist(
    (set) => ({
      lang: 'fr',
      levelFilter: 'all',
      selectedWindowId: null,
      hoveredWindowId: null,
      coverings: { ...DEFAULT_COVERINGS },
      motionPaused: false,

      setLang: (lang) => set({ lang }),
      setLevelFilter: (levelFilter) => set({ levelFilter }),
      selectWindow: (id) =>
        set(() => {
          const w = id ? WINDOW_BY_ID.get(id) : undefined;
          return w ? { selectedWindowId: id, levelFilter: w.level } : { selectedWindowId: null };
        }),
      setHovered: (hoveredWindowId) => set({ hoveredWindowId }),
      setMotionPaused: (motionPaused) => set({ motionPaused }),

      setCoveringType: (id, type) =>
        set((s) => {
          const prev = s.coverings[id];
          const next = defaultStateFor(type);
          if (prev && COVERING_BY_ID[prev.type].hasOpen && COVERING_BY_ID[type].hasOpen) next.open = prev.open;
          return { coverings: { ...s.coverings, [id]: next } };
        }),
      updateCovering: (id, patch) =>
        set((s) => ({ coverings: { ...s.coverings, [id]: { ...(s.coverings[id] ?? defaultStateFor('none')), ...patch } } })),
      applyToRoom: (id) =>
        set((s) => {
          const src = s.coverings[id];
          const w = WINDOW_BY_ID.get(id);
          if (!src || !w?.room) return {};
          const next = { ...s.coverings };
          for (const o of WINDOWS) if (o.room?.id === w.room.id) next[o.id] = { ...src };
          return { coverings: next };
        }),
      applyToLevel: (id) =>
        set((s) => {
          const src = s.coverings[id];
          const w = WINDOW_BY_ID.get(id);
          if (!src || !w) return {};
          const next = { ...s.coverings };
          for (const o of WINDOWS) if (o.level === w.level) next[o.id] = { ...src };
          return { coverings: next };
        }),
      applyToAll: (id) =>
        set((s) => {
          const src = s.coverings[id];
          if (!src) return {};
          const next = { ...s.coverings };
          for (const o of WINDOWS) next[o.id] = { ...src };
          return { coverings: next };
        }),
      resetCovering: (id) => set((s) => ({ coverings: { ...s.coverings, [id]: { ...(DEFAULT_COVERINGS[id] ?? defaultStateFor('none')) } } })),
      resetAllCoverings: () => set({ coverings: { ...DEFAULT_COVERINGS } }),
    }),
    {
      name: 'maison-sara-v3',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ coverings: s.coverings, lang: s.lang }),
    },
  ),
);

/** Covering state of a window with the catalogue default as fallback. */
export function useCovering(id: string): WindowCoveringState {
  return useStore((s) => s.coverings[id]) ?? DEFAULT_COVERINGS[id] ?? defaultStateFor('none');
}

/** Tiny i18n helper: t('Français', 'English'). */
export function useT() {
  const lang = useStore((s) => s.lang);
  return (fr: string, en: string) => (lang === 'fr' ? fr : en);
}

/** True when the OS asks for reduced motion. */
export const prefersReducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Automation hook for the screenshot script: window.__house.select('w-ch1-e'), .set(id, patch), .level('upper'). */
export function exposeDebugApi() {
  const api = {
    select: (id: string | null) => useStore.getState().selectWindow(id),
    level: (l: LevelFilter) => useStore.getState().setLevelFilter(l),
    set: (id: string, patch: Partial<WindowCoveringState>) => {
      if (patch.type) useStore.getState().setCoveringType(id, patch.type);
      useStore.getState().updateCovering(id, patch);
    },
    pause: (v = true) => useStore.getState().setMotionPaused(v),
    lang: (l: Lang) => useStore.getState().setLang(l),
    state: () => useStore.getState(),
    windows: WINDOWS.map((w) => w.id),
  };
  (window as unknown as { __house: typeof api }).__house = api;
}
