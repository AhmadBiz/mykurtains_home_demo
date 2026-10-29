/**
 * Global UI / simulation state (zustand). Covering choices persist to localStorage.
 *
 * High-frequency player data (position / yaw) is NOT kept in React state — see `playerState`
 * below, a mutable object updated every frame by the Player and read by the minimap / debug API.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { COVERING_BY_ID, DEFAULT_COVERINGS, defaultStateFor } from '../data/coverings';
import type { CoveringType, WindowCoveringState } from '../data/coverings';
import { HOUSE, PLAYER_EYE_HEIGHT, START_POSITION, START_YAW } from '../data/house';
import { LEVEL_BY_ID, LEVEL_ENTRY, WINDOWS, WINDOW_BY_ID, viewpointForWindow } from '../data/geometry';
import type { LevelId } from '../data/types';

/**
 * walk = first-person (Player), orbit = dollhouse (OrbitView), photo = a fixed still camera
 * (PhotoCamera, driven by `photoCam`) used by scripts/photos.mjs: no UI, no highlights, best quality.
 */
export type ViewMode = 'walk' | 'orbit' | 'photo';
export type Panel = 'none' | 'covering' | 'windows' | 'help' | 'map' | 'settings';
export type Lang = 'fr' | 'en';

/** Still camera of the photo mode (metres; `fov` is the VERTICAL field of view in degrees). */
export interface PhotoCam {
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
  /** Renderer tone-mapping exposure for this still; default = RENDER_EXPOSURE (0.85). */
  exposure?: number;
}

export interface TeleportRequest {
  position: [number, number, number];
  yaw: number;
  /** monotonically increasing so identical targets still trigger. */
  seq: number;
}

/** Mutable, frame-rate data. Not reactive on purpose. */
export const playerState = {
  x: START_POSITION[0],
  y: START_POSITION[1],
  z: START_POSITION[2],
  /** camera yaw (radians about +Y); camera looks along (-sin yaw, 0, -cos yaw). */
  yaw: START_YAW,
  pitch: 0,
  /** which window the crosshair is on (walk mode) */
  aimedWindowId: null as string | null,
};

interface State {
  lang: Lang;
  mode: ViewMode;
  level: LevelId;
  panel: Panel;
  selectedWindowId: string | null;
  hoveredWindowId: string | null;
  coverings: Record<string, WindowCoveringState>;
  teleport: TeleportRequest | null;
  pointerLocked: boolean;
  isTouch: boolean;
  quality: 'high' | 'low';
  showCeilings: boolean;
  /** Orbit (dollhouse) view: which level is the top-most shown. */
  orbitLevel: LevelId;
  hasStarted: boolean;
  /** Photo mode camera (only used while mode === 'photo'). */
  photoCam: PhotoCam | null;

  setLang: (l: Lang) => void;
  setMode: (m: ViewMode) => void;
  setLevel: (l: LevelId) => void;
  setPanel: (p: Panel) => void;
  togglePanel: (p: Panel) => void;
  selectWindow: (id: string | null, openPanel?: boolean) => void;
  setHovered: (id: string | null) => void;
  setPointerLocked: (v: boolean) => void;
  setIsTouch: (v: boolean) => void;
  setQuality: (q: 'high' | 'low') => void;
  setShowCeilings: (v: boolean) => void;
  setOrbitLevel: (l: LevelId) => void;
  setHasStarted: (v: boolean) => void;
  setPhotoCam: (cam: PhotoCam | null) => void;

  getCovering: (id: string) => WindowCoveringState;
  setCoveringType: (id: string, type: CoveringType) => void;
  updateCovering: (id: string, patch: Partial<WindowCoveringState>) => void;
  applyToRoom: (id: string) => void;
  applyToLevel: (id: string) => void;
  applyToAll: (id: string) => void;
  resetCovering: (id: string) => void;
  resetAllCoverings: () => void;

  requestTeleport: (position: [number, number, number], yaw: number) => void;
  goToWindow: (id: string) => void;
  goToLevel: (l: LevelId) => void;
  goToStart: () => void;
}

let teleportSeq = 0;

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      lang: 'fr',
      mode: 'walk',
      level: 'ground',
      panel: 'none',
      selectedWindowId: null,
      hoveredWindowId: null,
      coverings: { ...DEFAULT_COVERINGS },
      teleport: null,
      pointerLocked: false,
      isTouch: false,
      quality: 'high',
      showCeilings: true,
      orbitLevel: 'upper',
      hasStarted: false,
      photoCam: null,

      setLang: (lang) => set({ lang }),
      setMode: (mode) => set({ mode }),
      setLevel: (level) => set({ level }),
      setPanel: (panel) => set({ panel }),
      togglePanel: (p) => set((s) => ({ panel: s.panel === p ? 'none' : p })),
      selectWindow: (id, openPanel = true) =>
        set((s) => ({ selectedWindowId: id, panel: id && openPanel ? 'covering' : s.panel === 'covering' && !id ? 'none' : s.panel })),
      setHovered: (hoveredWindowId) => set({ hoveredWindowId }),
      setPointerLocked: (pointerLocked) => set({ pointerLocked }),
      setIsTouch: (isTouch) => set({ isTouch }),
      setQuality: (quality) => set({ quality }),
      setShowCeilings: (showCeilings) => set({ showCeilings }),
      setOrbitLevel: (orbitLevel) => set({ orbitLevel }),
      setHasStarted: (hasStarted) => set({ hasStarted }),
      setPhotoCam: (photoCam) => set({ photoCam }),

      getCovering: (id) => get().coverings[id] ?? DEFAULT_COVERINGS[id] ?? defaultStateFor('none'),
      setCoveringType: (id, type) =>
        set((s) => {
          const prev = s.coverings[id];
          const next = defaultStateFor(type);
          // keep the open amount when switching between types that both support it
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
          for (const other of WINDOWS) if (other.room?.id === w.room.id) next[other.id] = { ...src };
          return { coverings: next };
        }),
      applyToLevel: (id) =>
        set((s) => {
          const src = s.coverings[id];
          const w = WINDOW_BY_ID.get(id);
          if (!src || !w) return {};
          const next = { ...s.coverings };
          for (const other of WINDOWS) if (other.level === w.level) next[other.id] = { ...src };
          return { coverings: next };
        }),
      applyToAll: (id) =>
        set((s) => {
          const src = s.coverings[id];
          if (!src) return {};
          const next = { ...s.coverings };
          for (const other of WINDOWS) next[other.id] = { ...src };
          return { coverings: next };
        }),
      resetCovering: (id) => set((s) => ({ coverings: { ...s.coverings, [id]: { ...(DEFAULT_COVERINGS[id] ?? defaultStateFor('none')) } } })),
      resetAllCoverings: () => set({ coverings: { ...DEFAULT_COVERINGS } }),

      requestTeleport: (position, yaw) => set({ teleport: { position, yaw, seq: ++teleportSeq } }),
      goToWindow: (id) => {
        const w = WINDOW_BY_ID.get(id);
        if (!w) return;
        const vp = viewpointForWindow(w, PLAYER_EYE_HEIGHT);
        set({ mode: 'walk', level: w.level, selectedWindowId: id, panel: 'covering', teleport: { position: vp.position, yaw: vp.yaw, seq: ++teleportSeq } });
      },
      goToLevel: (l) => {
        const e = LEVEL_ENTRY[l];
        set({ mode: 'walk', level: l, teleport: { position: [e.position[0], LEVEL_BY_ID[l].floorY + PLAYER_EYE_HEIGHT, e.position[1]], yaw: e.yaw, seq: ++teleportSeq } });
      },
      goToStart: () => set({ mode: 'walk', level: 'ground', teleport: { position: [START_POSITION[0], HOUSE.gradeY + PLAYER_EYE_HEIGHT, START_POSITION[2]], yaw: START_YAW, seq: ++teleportSeq } }),
    }),
    {
      name: 'maison-3d-coverings-v1',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ coverings: s.coverings, lang: s.lang, quality: s.quality }),
    },
  ),
);

/** Small i18n helper. */
export function useT() {
  const lang = useStore((s) => s.lang);
  return (fr: string, en: string) => (lang === 'fr' ? fr : en);
}

/**
 * Debug / automation API (used by the Playwright screenshot script and handy in the console):
 *   window.__house.teleport(x, y, z, yaw)   — metres / radians
 *   window.__house.goToWindow('w-ch1-e')
 *   window.__house.setCovering('w-ch1-e', { type: 'roller', color: 'sand', open: 0.3 })
 *   window.__house.photo({ position: [x, y, z], target: [x, y, z], fov: 62, exposure: 0.85 })
 *                                            — photo mode: a fixed still camera, no UI, no highlights,
 *                                              ceilings on, stills quality (see scripts/photos.mjs)
 *   window.__house.applyProposal()           — every window back to DEFAULT_COVERINGS (the proposal)
 *   window.__house.state()                   — current store snapshot
 *   window.__house.scene / .gl               — the three.js scene and renderer (set by Scene.tsx once mounted)
 */
export function exposeDebugApi() {
  const api = {
    teleport: (x: number, y: number, z: number, yaw: number) => useStore.getState().requestTeleport([x, y, z], yaw),
    goToWindow: (id: string) => useStore.getState().goToWindow(id),
    goToLevel: (l: LevelId) => useStore.getState().goToLevel(l),
    setCovering: (id: string, patch: Partial<WindowCoveringState>) => {
      if (patch.type) useStore.getState().setCoveringType(id, patch.type);
      useStore.getState().updateCovering(id, patch);
    },
    setMode: (m: ViewMode) => useStore.getState().setMode(m),
    photo: (cam: PhotoCam) => {
      const s = useStore.getState();
      s.selectWindow(null);
      playerState.aimedWindowId = null;
      if (s.quality !== 'high') s.setQuality('high');
      useStore.setState({
        hoveredWindowId: null,
        panel: 'none',
        hasStarted: true,
        showCeilings: true,
        mode: 'photo',
        photoCam: {
          position: [...cam.position] as [number, number, number],
          target: [...cam.target] as [number, number, number],
          fov: cam.fov,
          exposure: cam.exposure,
        },
      });
    },
    applyProposal: () => useStore.getState().resetAllCoverings(),
    setPanel: (p: Panel) => useStore.getState().setPanel(p),
    start: () => useStore.getState().setHasStarted(true),
    state: () => useStore.getState(),
    player: playerState,
    windows: WINDOWS.map((w) => w.id),
  };
  (window as unknown as { __house: typeof api }).__house = api;
}
