import { useEffect } from 'react';

interface Disposable {
  dispose(): void;
}

/** Disposes GPU resources created with `new` (textures, materials, geometries) when the owner unmounts. */
export function useDispose(...items: Disposable[]): void {
  useEffect(
    () => () => {
      for (const it of items) it.dispose();
    },
    items,
  );
}
