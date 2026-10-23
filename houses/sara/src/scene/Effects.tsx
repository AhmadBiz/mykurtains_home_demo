/**
 * Post-processing (high quality only): N8AO ambient occlusion → SMAA → ACES tone mapping → a light
 * vignette. On 'low' quality nothing renders here and the Canvas falls back to MSAA.
 *
 * The composer renders the scene into a linear HalfFloat buffer. postprocessing's final pass only
 * converts to sRGB — it never applies the renderer's tone mapping — so the ACES curve is an explicit
 * <ToneMapping> effect here (it reads `gl.toneMappingExposure`), placed before the display-referred
 * vignette so colours match the no-post path. No contrast boost: the sun / fill balance in
 * Lighting.tsx sets the tonal range and a post curve only crushed the shaded dark materials.
 */
import { EffectComposer, N8AO, SMAA, ToneMapping, Vignette } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import { useStore } from '../store/useStore';

/** The pass's configuration object (n8ao ships no typings; only the keys we touch are declared). */
interface N8aoPassLike {
  configuration: { gammaCorrection: boolean };
}

/**
 * N8AOPostPass defaults to `gammaCorrection: true`, i.e. it applies an sRGB OETF to the linear HDR
 * buffer in the middle of the chain (and the final pass converts again). The wrapper does not
 * expose the flag, so it is cleared through the ref.
 */
function linearN8ao(pass: N8aoPassLike | null) {
  if (pass) pass.configuration.gammaCorrection = false;
}

/** World-space AO radius (m): corners, crown / wall and under-furniture contact at walking distance. */
const AO_RADIUS_WALK = 0.9;
/** In the dollhouse the rooms are 25–30 m away: a 0.9 m radius is ~4 px, so the radius grows. */
const AO_RADIUS_ORBIT = 2.5;

export function Effects() {
  const quality = useStore((s) => s.quality);
  const orbit = useStore((s) => s.mode) === 'orbit';
  if (quality !== 'high') return null;
  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      {/* 'medium' = 16 AO samples, 8 denoise samples at radius 12: enough to hide the
          interleaved-gradient dot lattice on plain walls while staying half-resolution. */}
      <N8AO ref={linearN8ao} aoRadius={orbit ? AO_RADIUS_ORBIT : AO_RADIUS_WALK} intensity={2.5} distanceFalloff={1} quality="medium" halfRes depthAwareUpsampling />
      <SMAA />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <Vignette eskil={false} offset={0.3} darkness={0.15} />
    </EffectComposer>
  );
}
