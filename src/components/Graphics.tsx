import React, { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Bloom, EffectComposer, N8AO, ToneMapping, Vignette } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import * as THREE from 'three';
import { Capacitor } from '@capacitor/core';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Graphics quality for the 3D view.
 *  - low:    plain lighting, no shadows, no effects (the lightest; what the app had before)
 *  - medium: real sun shadows + glow (bloom) + film tone mapping
 *  - high:   the above with sharper shadows, ambient occlusion and a soft vignette
 */
export type GfxQuality = 'low' | 'medium' | 'high';
const KEY = 'tg.graphics';

function defaultQuality(): GfxQuality {
  // Phones and tablets start on Balanced; computers on High
  const small = typeof window !== 'undefined' && (window.matchMedia?.('(pointer: coarse)').matches || window.innerWidth < 900);
  return Capacitor.isNativePlatform() || small ? 'medium' : 'high';
}
let quality: GfxQuality = (() => {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'low' || v === 'medium' || v === 'high') return v;
  } catch {
    /* private mode */
  }
  return defaultQuality();
})();
const listeners = new Set<() => void>();
export function setGraphicsQuality(q: GfxQuality) {
  quality = q;
  try {
    localStorage.setItem(KEY, q);
  } catch {
    /* private mode */
  }
  listeners.forEach((l) => l());
}
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
export const useGraphicsQuality = () => useSyncExternalStore(subscribe, () => quality, () => 'high' as GfxQuality);
/** Current quality, for code that isn't a component. */
export const graphicsQuality = () => quality;
/** With the effects on, lights are drawn in high dynamic range, so glowing parts can be much brighter than white. */
export const glowBoost = () => (quality === 'low' ? 1 : 2.6);

// ---------------------------------------------------------------- sun shadows
const LIT = (m: THREE.Material) =>
  (m as any).isMeshStandardMaterial || (m as any).isMeshPhysicalMaterial || (m as any).isMeshLambertMaterial || (m as any).isMeshPhongMaterial;
const FLAT = new Set(['PlaneGeometry', 'CircleGeometry', 'RingGeometry']);

/**
 * Real shadows from the look's sun (its strongest directional light).
 * The shadow area follows where the camera is looking and grows with the camera's distance, so shadows
 * are crisp in a close-up and still cover the whole site from far away.
 */
export function SunShadows({ mapSize }: { mapSize: number }) {
  const { gl, scene, camera } = useThree();
  const sun = useRef<THREE.DirectionalLight | null>(null);
  const dir = useRef(new THREE.Vector3(0.6, 0.7, 0.2));
  const frame = useRef(0);
  const tmp = useMemo(() => ({ fwd: new THREE.Vector3(), focus: new THREE.Vector3(), right: new THREE.Vector3(), up: new THREE.Vector3() }), []);

  useEffect(() => {
    gl.shadowMap.enabled = true;
    gl.shadowMap.type = THREE.PCFSoftShadowMap;
    gl.shadowMap.needsUpdate = true;
    return () => {
      gl.shadowMap.enabled = false;
      const l = sun.current;
      if (l) {
        l.castShadow = false;
        l.shadow.map?.dispose();
        l.shadow.map = null as any;
      }
      sun.current = null;
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.castShadow = false;
          m.receiveShadow = false;
        }
      });
      // Materials were compiled with shadows on
      scene.traverse((o) => {
        const mat = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
        if (mat) (Array.isArray(mat) ? mat : [mat]).forEach((x) => (x.needsUpdate = true));
      });
    };
  }, [gl, scene]);

  useFrame(() => {
    const n = frame.current++;
    // Pick the sun and flag what casts / receives. Cheap, and re-done regularly because looks, items and
    // sizes change while the app runs.
    if (n % 30 === 0) {
      let best: THREE.DirectionalLight | null = null;
      scene.traverse((o) => {
        const l = o as THREE.DirectionalLight;
        if (l.isDirectionalLight && l.visible && (!best || l.intensity > best.intensity)) best = l;
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        const mat = Array.isArray(m.material) ? m.material[0] : m.material;
        if (!mat || !LIT(mat)) return; // unlit things (sky, halos, lines, water shaders) take no part
        m.receiveShadow = true;
        const flat = FLAT.has(m.geometry?.type);
        m.castShadow = !flat && !mat.transparent && m.visible && !m.userData.noShadow;
      });
      if (best && best !== sun.current) {
        if (sun.current) sun.current.castShadow = false;
        const l = best as THREE.DirectionalLight;
        sun.current = l;
        // Where the look put its sun, relative to the field centre, is the sun's direction
        const d = l.userData.sunDir as [number, number, number] | undefined;
        if (d) dir.current.set(d[0], d[1], d[2]).normalize();
        else dir.current.copy(l.position).normalize();
        if (dir.current.y < 0.12) dir.current.setY(0.12).normalize();
        l.castShadow = true;
        l.shadow.mapSize.set(mapSize, mapSize);
        l.shadow.bias = -0.0004;
        if (!l.target.parent) scene.add(l.target);
      }
    }
    const l = sun.current;
    if (!l) return;

    // Focus: where the camera looks on the ground
    const { fwd, focus } = tmp;
    camera.getWorldDirection(fwd);
    let dist: number;
    if (fwd.y < -0.03) {
      dist = Math.min(600, camera.position.y / -fwd.y);
      focus.copy(camera.position).addScaledVector(fwd, dist);
    } else {
      dist = 40;
      focus.copy(camera.position).addScaledVector(fwd, dist).setY(0);
    }
    // Shadow area half-size, in steps so it doesn't shimmer while zooming
    const want = THREE.MathUtils.clamp(dist * 0.85, 14, 260);
    const S = Math.pow(1.3, Math.ceil(Math.log(want) / Math.log(1.3)));
    // Snap the focus to shadow texels so shadows don't crawl as the camera moves
    const texel = (2 * S) / mapSize;
    focus.x = Math.round(focus.x / texel) * texel;
    focus.z = Math.round(focus.z / texel) * texel;
    focus.y = 0;

    const cam = l.shadow.camera as THREE.OrthographicCamera;
    if (cam.right !== S) {
      cam.left = -S;
      cam.right = S;
      cam.top = S;
      cam.bottom = -S;
      cam.near = 1;
      cam.far = S * 6 + 120;
      cam.updateProjectionMatrix();
      l.shadow.normalBias = 0.02 + texel * 1.2;
    }
    l.position.copy(focus).addScaledVector(dir.current, S * 3 + 60);
    l.target.position.copy(focus);
    l.target.updateMatrixWorld();
  });
  return null;
}

// ---------------------------------------------------------------- effects
/** Glow, ambient occlusion and film tone mapping. Mount only when quality isn't low. */
export function PostFX({ high, bloom = 0.85, exposure = 1 }: { high: boolean; bloom?: number; exposure?: number }) {
  const { gl } = useThree();
  useEffect(() => {
    const before = gl.toneMappingExposure;
    gl.toneMappingExposure = exposure;
    return () => {
      gl.toneMappingExposure = before;
    };
  }, [gl, exposure]);
  return (
    <EffectComposer multisampling={high ? 4 : 2} enableNormalPass={false}>
      {high ? <N8AO aoRadius={1.6} distanceFalloff={1.2} intensity={2.2} quality="medium" halfRes color="#1b1410" /> : <></>}
      {/* Only light brighter than white blooms: LEDs, lamps, the sun's glints */}
      <Bloom mipmapBlur intensity={bloom} luminanceThreshold={1.05} luminanceSmoothing={0.25} radius={0.72} />
      {high ? <Vignette eskil={false} offset={0.22} darkness={0.42} /> : <></>}
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
    </EffectComposer>
  );
}

// ---------------------------------------------------------------- sky
const SKY_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 p = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * p;
    gl_Position.z = gl_Position.w; // always at the far plane
  }`;
const SKY_FRAG = /* glsl */ `
  varying vec3 vDir;
  uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uGround; uniform vec3 uSunDir; uniform vec3 uSunColor; uniform float uSunDisc;
  void main() {
    vec3 d = normalize(vDir);
    float h = max(d.y, 0.0);
    // Haze thickest at the horizon, clearing quickly above it
    vec3 col = mix(uHorizon, uZenith, pow(h, 0.42));
    col = mix(col, uGround, smoothstep(0.0, -0.08, d.y));
    float s = max(dot(d, normalize(uSunDir)), 0.0);
    col += uSunColor * (pow(s, 6.0) * 0.18 + pow(s, 48.0) * 0.5);          // wide glow round the sun
    col += uSunColor * uSunDisc * smoothstep(0.9994, 0.9998, s) * 14.0;    // the disc itself (blooms)
    gl_FragColor = vec4(col, 1.0);
  }`;

export interface SkySpec {
  zenith: string;
  horizon: string;
  ground: string;
  sunDir: [number, number, number];
  sunColor: string;
}
function skyMaterial(spec: SkySpec, disc: number) {
  return new THREE.ShaderMaterial({
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    toneMapped: false,
    uniforms: {
      uZenith: { value: new THREE.Color(spec.zenith) },
      uHorizon: { value: new THREE.Color(spec.horizon) },
      uGround: { value: new THREE.Color(spec.ground) },
      uSunDir: { value: new THREE.Vector3(...spec.sunDir).normalize() },
      uSunColor: { value: new THREE.Color(spec.sunColor) },
      uSunDisc: { value: disc },
    },
  });
}

/**
 * A gradient sky with haze and a sun, and (optionally) soft lighting and reflections taken from it:
 * the sky is baked once into the scene's environment, so every surface picks up sky light from above
 * and warm bounce light from the ground.
 */
export function SkyDome({ spec, lightScene, envIntensity = 0.55 }: { spec: SkySpec; lightScene: boolean; envIntensity?: number }) {
  const { gl, scene, camera } = useThree();
  const mesh = useRef<THREE.Mesh>(null);
  const mat = useMemo(() => skyMaterial(spec, 1), [spec]);
  useEffect(() => () => mat.dispose(), [mat]);
  useFrame(() => mesh.current?.position.copy(camera.position));

  useEffect(() => {
    if (!lightScene) return;
    const pmrem = new THREE.PMREMGenerator(gl);
    const envScene = new THREE.Scene();
    const envMat = skyMaterial(spec, 0); // no disc: the sun itself is a real light
    const dome = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), envMat);
    envScene.add(dome);
    const rt = pmrem.fromScene(envScene, 0.04);
    const before = { env: scene.environment, intensity: scene.environmentIntensity };
    scene.environment = rt.texture;
    scene.environmentIntensity = envIntensity;
    return () => {
      scene.environment = before.env;
      scene.environmentIntensity = before.intensity;
      rt.dispose();
      pmrem.dispose();
      dome.geometry.dispose();
      envMat.dispose();
    };
  }, [gl, scene, spec, lightScene, envIntensity]);

  return (
    <mesh ref={mesh} material={mat} renderOrder={-10} frustumCulled={false} raycast={() => {}} userData={{ noExport: true }}>
      <sphereGeometry args={[50, 32, 16]} />
    </mesh>
  );
}

// ---------------------------------------------------------------- procedural detail
/** A tiling normal map of gentle bumps (sand ripples, gravel, rough ground), made once in code. */
export function makeBumpNormalMap(seed: number, size = 256, strength = 2.2): THREE.DataTexture {
  // Smooth tiling noise from a few octaves of wrapped value noise
  const rand = (x: number, y: number, s: number) => {
    const v = Math.sin((x * 127.1 + y * 311.7 + s * 74.7) * 0.017453) * 43758.5453;
    return v - Math.floor(v);
  };
  const height = new Float32Array(size * size);
  for (const [cells, amp] of [
    [8, 0.5],
    [16, 0.27],
    [32, 0.15],
    [64, 0.08],
  ] as const) {
    const step = size / cells;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const gx = x / step;
        const gy = y / step;
        const x0 = Math.floor(gx);
        const y0 = Math.floor(gy);
        const fx = gx - x0;
        const fy = gy - y0;
        const sx = fx * fx * (3 - 2 * fx);
        const sy = fy * fy * (3 - 2 * fy);
        const a = rand(x0 % cells, y0 % cells, seed + cells);
        const b = rand((x0 + 1) % cells, y0 % cells, seed + cells);
        const c = rand(x0 % cells, (y0 + 1) % cells, seed + cells);
        const d = rand((x0 + 1) % cells, (y0 + 1) % cells, seed + cells);
        height[y * size + x] += (a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy) * amp;
      }
    }
  }
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const l = height[y * size + ((x - 1 + size) % size)];
      const r = height[y * size + ((x + 1) % size)];
      const u = height[((y - 1 + size) % size) * size + x];
      const dn = height[((y + 1) % size) * size + x];
      const nx = (l - r) * strength;
      const ny = (u - dn) * strength;
      const inv = 1 / Math.hypot(nx, ny, 1);
      const i = (y * size + x) * 4;
      data[i] = (nx * inv * 0.5 + 0.5) * 255;
      data[i + 1] = (ny * inv * 0.5 + 0.5) * 255;
      data[i + 2] = (inv * 0.5 + 0.5) * 255;
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

/** A lumpy, organic blob (tree crowns, bushes): a sphere pushed in and out by smooth noise, darker underneath. */
export function makeFoliageGeometry(seed: number, detail = 2, half = false): THREE.BufferGeometry {
  // Share vertices between faces, so the surface shades smoothly instead of as flat facets
  const raw = new THREE.IcosahedronGeometry(1, detail);
  raw.deleteAttribute('uv');
  raw.deleteAttribute('normal');
  const g = mergeVertices(raw, 1e-4);
  raw.dispose();
  const pos = g.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n =
      Math.sin(v.x * 3.1 + seed) * Math.cos(v.y * 2.7 + seed * 1.7) * 0.5 +
      Math.sin(v.z * 4.3 + seed * 0.6) * Math.cos(v.x * 5.1 - seed) * 0.3 +
      Math.sin((v.y + v.z) * 6.7 + seed * 2.3) * 0.2;
    // A finer second layer gives the leafy, clumped outline
    const fine =
      Math.sin(v.x * 11.3 + seed * 3.1) * Math.sin(v.y * 12.7 - seed) * Math.sin(v.z * 10.9 + seed * 1.3);
    v.multiplyScalar(1 + n * 0.2 + fine * 0.09);
    if (half) {
      // Bushes sit on the ground and are spikier than a tree crown
      v.multiplyScalar(1 + fine * 0.16);
      if (v.y < 0) v.y *= 0.15;
    }
    pos.setXYZ(i, v.x, v.y, v.z);
    // Leaves are darker low down and inside, lighter where the sky reaches them
    const shade = (0.5 + 0.5 * THREE.MathUtils.smoothstep(v.y, -0.8, 0.9)) * (0.9 + fine * 0.22);
    colors[i * 3] = colors[i * 3 + 1] = colors[i * 3 + 2] = shade;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.computeVertexNormals();
  return g;
}

/** Smooth tiling noise, 0..1, for a w x h image (several octaves of wrapped value noise). */
export function tileNoise(w: number, h: number, seed: number, octaves: readonly (readonly [number, number])[] = [[4, 0.45], [9, 0.28], [20, 0.17], [45, 0.1]]): Float32Array {
  const rand = (x: number, y: number, s: number) => {
    const v = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453;
    return v - Math.floor(v);
  };
  const out = new Float32Array(w * h);
  let total = 0;
  for (const [cells, amp] of octaves) {
    total += amp;
    const cx = cells;
    const cy = Math.max(1, Math.round((cells * h) / w));
    for (let y = 0; y < h; y++) {
      const gy = (y / h) * cy;
      const y0 = Math.floor(gy);
      const fy = gy - y0;
      const sy = fy * fy * (3 - 2 * fy);
      for (let x = 0; x < w; x++) {
        const gx = (x / w) * cx;
        const x0 = Math.floor(gx);
        const fx = gx - x0;
        const sx = fx * fx * (3 - 2 * fx);
        const a = rand(x0 % cx, y0 % cy, seed + cells);
        const b = rand((x0 + 1) % cx, y0 % cy, seed + cells);
        const c = rand(x0 % cx, (y0 + 1) % cy, seed + cells);
        const d = rand((x0 + 1) % cx, (y0 + 1) % cy, seed + cells);
        out[y * w + x] += (a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy) * amp;
      }
    }
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

/** Paints natural-looking ground (sand, gravel, asphalt, grass): smooth patches of the three tones plus a fine grain. */
export function paintGround(ctx: CanvasRenderingContext2D, dark: string, mid: string, light: string, seed: number, grainAmount = 0.035) {
  const { width: w, height: h } = ctx.canvas;
  const n = tileNoise(w, h, seed);
  const cd = new THREE.Color(dark).convertLinearToSRGB();
  const cm = new THREE.Color(mid).convertLinearToSRGB();
  const cl = new THREE.Color(light).convertLinearToSRGB();
  const img = ctx.createImageData(w, h);
  let r = seed * 9301 + 49297;
  for (let i = 0; i < w * h; i++) {
    // contrast-stretch the noise around its middle
    const t = Math.min(1, Math.max(0, (n[i] - 0.5) * 2.6 + 0.5));
    const lo = t < 0.5;
    const k = lo ? t * 2 : (t - 0.5) * 2;
    const a = lo ? cd : cm;
    const b = lo ? cm : cl;
    r = (r * 9301 + 49297) % 233280;
    const g = 1 + (r / 233280 - 0.5) * 2 * grainAmount;
    img.data[i * 4] = Math.min(255, (a.r + (b.r - a.r) * k) * 255 * g);
    img.data[i * 4 + 1] = Math.min(255, (a.g + (b.g - a.g) * k) * 255 * g);
    img.data[i * 4 + 2] = Math.min(255, (a.b + (b.b - a.b) * k) * 255 * g);
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

/** One palm frond: a long leaf that arches up, droops at the tip and folds along its midrib. */
export function makeFrondGeometry(length = 3.8, width = 1.1): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(length, width, 10, 4);
  g.translate(length / 2, 0, 0);
  g.rotateX(-Math.PI / 2); // lie flat: length along +X, width along Z
  const pos = g.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const t = x / length;
    const taper = Math.sin(Math.PI * Math.min(1, t * 0.92 + 0.08)) * 0.95 + 0.05; // leaf outline
    const zz = z * taper;
    const y = Math.sin(t * Math.PI * 0.55) * length * 0.2 - t * t * length * 0.42 - Math.abs(zz) * 0.55; // arch, droop, fold
    pos.setXYZ(i, x * (1 - t * t * 0.12), y, zz);
    const shade = 0.6 + 0.4 * (1 - Math.abs(z) / (width / 2)) * (0.75 + 0.25 * t);
    colors[i * 3] = colors[i * 3 + 1] = colors[i * 3 + 2] = shade;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.computeVertexNormals();
  return g;
}

/**
 * Breaks up the visible repeat of a tiling ground texture: the same texture is read again at two
 * larger, rotated scales and used to lighten and darken the first reading.
 * Use as `onBeforeCompile` on a standard material that has a `map`.
 */
export function detileGround(shader: { fragmentShader: string }) {
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <map_fragment>',
    `#ifdef USE_MAP
      vec4 sampledDiffuseColor = texture2D( map, vMapUv );
      float tgAvg = dot( texture2D( map, vMapUv, 20.0 ).rgb, vec3( 0.3333 ) ) + 1e-4;
      float tgA = dot( texture2D( map, mat2( 0.8, -0.6, 0.6, 0.8 ) * vMapUv * 0.231 ).rgb, vec3( 0.3333 ) ) / tgAvg;
      float tgB = dot( texture2D( map, mat2( 0.6, 0.8, -0.8, 0.6 ) * vMapUv * 0.057 + 0.37 ).rgb, vec3( 0.3333 ) ) / tgAvg;
      sampledDiffuseColor.rgb *= clamp( mix( 1.0, tgA, 0.5 ) * mix( 1.0, tgB, 0.7 ), 0.78, 1.28 );
      diffuseColor *= sampledDiffuseColor;
    #endif`,
  );
}
