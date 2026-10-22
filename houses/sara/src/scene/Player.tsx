/**
 * First-person controller. Renders nothing; drives the default camera from the mutable
 * `playerState` (src/store/useStore.ts) and the shared `input` object (src/scene/input.ts).
 *
 *  - Pointer lock (own implementation, no drei PointerLockControls): a click on the canvas locks,
 *    mouse deltas rotate yaw / pitch, a left click while locked selects the aimed window. Opening a
 *    panel that needs the mouse releases the lock; the next click on the canvas re-locks.
 *  - Keyboard: WASD / arrows by PHYSICAL key (so ZQSD works on AZERTY), Shift = sprint,
 *    E / Enter = select, 1 / 2 / 3 = level, M / L / H = panels, C = ceilings, Tab = walk ⇄ orbit.
 *  - Touch: <TouchControls/> writes `input`; look deltas and select requests are consumed here.
 *  - Movement: yaw-relative, wall collisions (resolvePlayerCollisions), then the walking surface
 *    (groundHeightAt) is followed smoothly so stairs and ramps feel like stairs and ramps.
 *  - Every 3 frames a centre raycast finds the window under the crosshair → playerState.aimedWindowId.
 *  - Every 10 frames the storey is derived from the feet height → store.setLevel.
 */
import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { playerState, useStore } from '../store/useStore';
import type { Panel } from '../store/useStore';
import { input } from './input';
import { PLAYER_EYE_HEIGHT, START_POSITION, START_YAW } from '../data/house';
import { LEVEL_BY_ID, groundHeightAt, levelForY, pointInLevelOutline, resolvePlayerCollisions } from '../data/geometry';
import type { LevelId } from '../data/types';

const WALK_SPEED = 2.4; // m/s
const SPRINT_SPEED = 4.5;
const MOUSE_SENSITIVITY = 0.0022; // rad per pixel
const TOUCH_SENSITIVITY = 0.005;
const PITCH_LIMIT = 1.45;
const MAX_DT = 0.05;
const GROUND_FOLLOW_RATE = 12; // 1/s
const SNAP_DISTANCE = 1.5; // m — larger jumps (teleports) snap instead of easing
const AIM_DISTANCE = 6; // m
const BOB_AMPLITUDE = 0.015; // m
const RAYCAST_EVERY = 3;
const LEVEL_EVERY = 10;

const EXIT_LOCK_PANELS: ReadonlySet<Panel> = new Set<Panel>(['covering', 'windows', 'help', 'settings', 'map']);
const NDC_CENTRE = new THREE.Vector2(0, 0);

type MoveKey = 'f' | 'b' | 'l' | 'r';
const MOVE_KEYS: Record<string, MoveKey> = {
  KeyW: 'f', ArrowUp: 'f',
  KeyS: 'b', ArrowDown: 'b',
  KeyA: 'l', ArrowLeft: 'l',
  KeyD: 'r', ArrowRight: 'r',
};

/** Module-level so a remount (walk → orbit → walk) neither re-applies an old teleport nor resets the pose. */
let consumedTeleportSeq = 0;
let initialised = false;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const clampPitch = (p: number) => clamp(p, -PITCH_LIMIT, PITCH_LIMIT);

function isEditable(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.tagName !== 'string') return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable === true;
}

function isButtonLike(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.tagName !== 'string') return false;
  return el.tagName === 'BUTTON' || el.tagName === 'A';
}

function isVisibleChain(obj: THREE.Object3D): boolean {
  let o: THREE.Object3D | null = obj;
  while (o) {
    if (!o.visible) return false;
    o = o.parent;
  }
  return true;
}

/**
 * Window id carried by the object or any ancestor: `userData.windowId` (the invisible hit box) or,
 * as a fallback, the `window:<id>` group name — so aiming at a curtain hanging in front of the hit
 * box still resolves to its window.
 */
function windowIdOf(obj: THREE.Object3D): string | null {
  let o: THREE.Object3D | null = obj;
  while (o) {
    const id = (o.userData as { windowId?: unknown }).windowId;
    if (typeof id === 'string') return id;
    if (o.name.startsWith('window:')) return o.name.slice('window:'.length);
    o = o.parent;
  }
  return null;
}

function selectAimed() {
  const id = playerState.aimedWindowId;
  if (id) useStore.getState().selectWindow(id);
}

function applyCamera(camera: THREE.Camera, bob = 0) {
  camera.position.set(playerState.x, playerState.y + PLAYER_EYE_HEIGHT + bob, playerState.z);
  camera.rotation.order = 'YXZ';
  camera.rotation.set(playerState.pitch, playerState.yaw, 0, 'YXZ');
}

/**
 * Storey the player is on. Outside the house (on the lawn, below the ground floor but not within
 * the basement footprint) the ground floor is reported, not the basement.
 */
function currentLevel(x: number, z: number, feetY: number): LevelId {
  const lvl = levelForY(feetY + 0.5);
  if (lvl === 'basement' && !pointInLevelOutline(LEVEL_BY_ID.basement, x, z)) return 'ground';
  return lvl;
}

interface Sim {
  frame: number;
  bobPhase: number;
  bobAmount: number;
  raycaster: THREE.Raycaster;
}

export function Player() {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const panel = useStore((s) => s.panel);
  const teleport = useStore((s) => s.teleport);
  const sim = useRef<Sim>({ frame: 0, bobPhase: 0, bobAmount: 0, raycaster: new THREE.Raycaster() }).current;

  // Initial pose (first mount only) and immediate camera placement on every mount.
  useEffect(() => {
    if (!initialised) {
      initialised = true;
      playerState.x = START_POSITION[0];
      playerState.y = START_POSITION[1]; // grade = feet height
      playerState.z = START_POSITION[2];
      playerState.yaw = START_YAW;
      playerState.pitch = 0;
    }
    applyCamera(camera);
    camera.updateMatrixWorld();
  }, [camera]);

  // Teleport requests (position[1] is the EYE height, see useStore.goToWindow / goToLevel / goToStart).
  useEffect(() => {
    if (!teleport || teleport.seq === consumedTeleportSeq) return;
    consumedTeleportSeq = teleport.seq;
    playerState.x = teleport.position[0];
    playerState.y = teleport.position[1] - PLAYER_EYE_HEIGHT;
    playerState.z = teleport.position[2];
    playerState.yaw = teleport.yaw;
    playerState.pitch = 0;
    playerState.aimedWindowId = null;
    sim.bobAmount = 0;
    applyCamera(camera);
    camera.updateMatrixWorld();
    // Refresh the storey now rather than on the next LEVEL_EVERY tick (the HUD/minimap would lag).
    const s = useStore.getState();
    const lvl = currentLevel(playerState.x, playerState.z, groundHeightAt(playerState.x, playerState.z, playerState.y));
    if (lvl !== s.level) s.setLevel(lvl);
  }, [teleport, camera, sim]);

  // Release the pointer lock when a panel that needs the mouse opens (no automatic re-lock).
  useEffect(() => {
    if (EXIT_LOCK_PANELS.has(panel) && document.pointerLockElement === gl.domElement) document.exitPointerLock();
  }, [panel, gl]);

  // Pointer lock + mouse look + click-to-select.
  useEffect(() => {
    const el = gl.domElement;
    const locked = () => document.pointerLockElement === el;

    const onClick = () => {
      const s = useStore.getState();
      if (!s.hasStarted || s.mode !== 'walk' || s.isTouch || document.pointerLockElement) return;
      // Browsers reject a re-lock shortly after an Escape; the next click simply tries again.
      Promise.resolve(el.requestPointerLock()).catch(() => undefined);
    };
    const onLockChange = () => useStore.getState().setPointerLocked(locked());
    const onLockError = () => useStore.getState().setPointerLocked(false);
    const onMouseMove = (e: MouseEvent) => {
      if (!locked()) return;
      playerState.yaw -= e.movementX * MOUSE_SENSITIVITY;
      playerState.pitch = clampPitch(playerState.pitch - e.movementY * MOUSE_SENSITIVITY);
    };
    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 0 && locked()) selectAimed();
    };

    el.addEventListener('click', onClick);
    document.addEventListener('pointerlockchange', onLockChange);
    document.addEventListener('pointerlockerror', onLockError);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mousedown', onMouseDown);
    return () => {
      el.removeEventListener('click', onClick);
      document.removeEventListener('pointerlockchange', onLockChange);
      document.removeEventListener('pointerlockerror', onLockError);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mousedown', onMouseDown);
      if (locked()) document.exitPointerLock();
      useStore.getState().setPointerLocked(false);
    };
  }, [gl]);

  // Keyboard.
  useEffect(() => {
    const held = new Set<MoveKey>();
    let shiftHeld = false;

    const syncMove = () => {
      const forward = (held.has('f') ? 1 : 0) - (held.has('b') ? 1 : 0);
      const right = (held.has('r') ? 1 : 0) - (held.has('l') ? 1 : 0);
      if (input.forward !== forward) input.forward = forward;
      if (input.right !== right) input.right = right;
    };
    const releaseAll = () => {
      held.clear();
      syncMove();
      if (shiftHeld) {
        shiftHeld = false;
        input.sprint = false;
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditable(e.target)) return;
      const s = useStore.getState();
      if (!s.hasStarted) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const move = MOVE_KEYS[e.code];
      if (move) {
        e.preventDefault();
        if (!held.has(move)) {
          held.add(move);
          syncMove();
        }
        return;
      }
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        shiftHeld = true;
        input.sprint = true;
        return;
      }
      if (e.code === 'Tab') {
        e.preventDefault();
        if (!e.repeat) s.setMode(s.mode === 'walk' ? 'orbit' : 'walk');
        return;
      }
      if (e.repeat) return;

      switch (e.code) {
        case 'Digit1':
        case 'Numpad1':
          s.goToLevel('basement');
          return;
        case 'Digit2':
        case 'Numpad2':
          s.goToLevel('ground');
          return;
        case 'Digit3':
        case 'Numpad3':
          s.goToLevel('upper');
          return;
      }
      switch (e.key.toLowerCase()) {
        case 'e':
          selectAimed();
          break;
        case 'enter':
          if (!isButtonLike(e.target)) selectAimed();
          break;
        case 'm':
          s.togglePanel('map');
          break;
        case 'l':
          s.togglePanel('windows');
          break;
        case 'h':
          s.togglePanel('help');
          break;
        case 'c':
          s.setShowCeilings(!s.showCeilings);
          break;
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const move = MOVE_KEYS[e.code];
      if (move) {
        held.delete(move);
        syncMove();
      } else if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        shiftHeld = false;
        input.sprint = false;
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') releaseAll();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', releaseAll);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', releaseAll);
      document.removeEventListener('visibilitychange', onVisibility);
      releaseAll();
    };
  }, []);

  useFrame((_, delta) => {
    const dt = Math.min(delta, MAX_DT);
    const s = useStore.getState();
    const ps = playerState;
    sim.frame++;
    let moving = false;

    if (s.hasStarted) {
      // Touch look deltas (accumulated by TouchControls).
      if (input.lookDX !== 0 || input.lookDY !== 0) {
        ps.yaw -= input.lookDX * TOUCH_SENSITIVITY;
        ps.pitch = clampPitch(ps.pitch - input.lookDY * TOUCH_SENSITIVITY);
        input.lookDX = 0;
        input.lookDY = 0;
      }

      // Yaw-relative movement; the joystick gives an analog magnitude, clamped to the unit disc.
      let f = clamp(input.forward, -1, 1);
      let r = clamp(input.right, -1, 1);
      const mag = Math.hypot(f, r);
      if (mag > 1) {
        f /= mag;
        r /= mag;
      }
      moving = mag > 0.02;
      if (moving) {
        const speed = input.sprint ? SPRINT_SPEED : WALK_SPEED;
        const sin = Math.sin(ps.yaw);
        const cos = Math.cos(ps.yaw);
        // forward = (-sin yaw, -cos yaw), right = (cos yaw, -sin yaw) in XZ
        const nx = ps.x + (-sin * f + cos * r) * speed * dt;
        const nz = ps.z + (-cos * f - sin * r) * speed * dt;
        const [cx, cz] = resolvePlayerCollisions(nx, nz, ps.y);
        ps.x = cx;
        ps.z = cz;
      }

      // Follow the walking surface (floors, stairs, ramps, platforms, grade).
      const targetY = groundHeightAt(ps.x, ps.z, ps.y);
      const dy = targetY - ps.y;
      if (Math.abs(dy) > SNAP_DISTANCE) ps.y = targetY;
      else ps.y += dy * (1 - Math.exp(-GROUND_FOLLOW_RATE * dt));

      if (input.selectRequested) {
        input.selectRequested = false;
        selectAimed();
      }

      if (sim.frame % LEVEL_EVERY === 0) {
        const lvl = currentLevel(ps.x, ps.z, ps.y);
        if (lvl !== s.level) s.setLevel(lvl);
      }
    }

    // Head-bob eases in and out so stopping never jolts the view.
    sim.bobAmount += ((moving ? 1 : 0) - sim.bobAmount) * (1 - Math.exp(-8 * dt));
    if (moving) sim.bobPhase += dt * (input.sprint ? 11 : 7.5);
    const bob = Math.sin(sim.bobPhase) * BOB_AMPLITUDE * sim.bobAmount;

    applyCamera(camera, bob);
    camera.updateMatrixWorld();

    // Centre raycast → aimed window. A wall or furniture in front of a window blocks it (correct).
    if (sim.frame % RAYCAST_EVERY === 0) {
      if (s.hasStarted) {
        const ray = sim.raycaster;
        ray.far = AIM_DISTANCE;
        ray.setFromCamera(NDC_CENTRE, camera);
        const hits = ray.intersectObjects(scene.children, true);
        let aimed: string | null = null;
        for (const h of hits) {
          if (!isVisibleChain(h.object)) continue;
          aimed = windowIdOf(h.object);
          break;
        }
        ps.aimedWindowId = aimed;
      } else if (ps.aimedWindowId !== null) {
        ps.aimedWindowId = null;
      }
    }
  });

  return null;
}
