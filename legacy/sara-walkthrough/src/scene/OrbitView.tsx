/**
 * Dollhouse camera for the orbit mode: drei <OrbitControls/> around the middle of the house, the
 * camera placed on mount at a three-quarter aerial view. Tab (or M / L / H for the panels) keeps
 * working here so the keyboard shortcuts the Player offers do not go dead in orbit mode.
 */
import { useEffect, useRef } from 'react';
import type { ComponentRef } from 'react';
import { OrbitControls } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useStore } from '../store/useStore';

const TARGET: [number, number, number] = [6, 1.5, 5];
const START: [number, number, number] = [-8, 15, 17];

function isEditable(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.tagName !== 'string') return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable === true;
}

export function OrbitView() {
  const camera = useThree((s) => s.camera);
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);

  useEffect(() => {
    camera.position.set(START[0], START[1], START[2]);
    camera.lookAt(TARGET[0], TARGET[1], TARGET[2]);
    camera.updateMatrixWorld();
    controls.current?.update();
  }, [camera]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditable(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      const s = useStore.getState();
      if (!s.hasStarted) return;
      if (e.code === 'Tab') {
        e.preventDefault();
        if (!e.repeat) s.setMode('walk');
        return;
      }
      if (e.repeat) return;
      switch (e.key.toLowerCase()) {
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
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      target={TARGET}
      maxPolarAngle={Math.PI / 2.05}
      minDistance={6}
      maxDistance={70}
      enableDamping
    />
  );
}
