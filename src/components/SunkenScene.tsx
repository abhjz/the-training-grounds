// Animated look, 3D: a sunken city. The field is a mossy wooden deck on the roof of a drowned
// tower; around it, more towers fall away into the deep teal water, light shafts come down from
// the surface, kelp sways, coral grows on the ledges, fish school, jellyfish glow and bubbles rise.
// Only the deck is exported with the track; everything else is decoration and ignores clicks.

import React, { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import * as THREE from 'three';
import { FIELD_HEIGHT_M, FIELD_WIDTH_M, PERIMETER_FENCE_M } from '../constants/equipment';
import { FieldColors } from '../theme/engine';
import { drawDockPlanks } from '../utils/dockArt';
import { drawWatermarkText, GroundMarkSource, hasGroundMark } from '../utils/watermark';
import { useSceneryMotion } from '../hooks/useSceneryMotion';

// ---------------------------------------------------------------- shared
const DECK_THICK = 0.35;
const LEDGE = 3.2; // roof ledge around the field (m)
export const SUNKEN_FOG = { color: '#14606A', near: 62, far: 175 };

const toV3 = (x: number, y: number, z = 0) => new THREE.Vector3(x - FIELD_WIDTH_M / 2, z, y - FIELD_HEIGHT_M / 2);
const rand = (n: number) => {
  const x = Math.sin(n * 91.7 + 17.3) * 43758.5453;
  return x - Math.floor(x);
};
const noRaycast = () => {};

/** Decoration never takes clicks, so clicking "empty" water still deselects. */
function NoPick({ children }: { children: React.ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  useLayoutEffect(() => {
    ref.current?.traverse((o) => {
      (o as THREE.Mesh).raycast = noRaycast;
    });
  });
  return <group ref={ref}>{children}</group>;
}

// ---------------------------------------------------------------- textures
function makeCanvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!] as const;
}

/** The deck: wooden planks overgrown with moss and algae near the edges, barnacles in the cracks. */
function useDeckTexture(groundName: GroundMarkSource) {
  return useMemo(() => {
    const pxPerM = 28;
    const w = Math.round(FIELD_WIDTH_M * pxPerM);
    const h = Math.round(FIELD_HEIGHT_M * pxPerM);
    const [canvas, ctx] = makeCanvas(w, h);
    ctx.save();
    ctx.scale(pxPerM, pxPerM);
    drawDockPlanks(ctx, FIELD_WIDTH_M, FIELD_HEIGHT_M, '#3E2A1C');
    // Sea tint: the wood has soaked for years
    ctx.fillStyle = 'rgba(30, 90, 85, 0.14)';
    ctx.fillRect(0, 0, FIELD_WIDTH_M, FIELD_HEIGHT_M);
    // Moss patches, thicker toward the edges so the middle stays clear for gates
    for (let i = 0; i < 140; i++) {
      const edge = rand(i) < 0.5;
      const x = edge ? (rand(i + 1) < 0.5 ? rand(i + 2) * 6 : FIELD_WIDTH_M - rand(i + 2) * 6) : rand(i + 3) * FIELD_WIDTH_M;
      const y = edge ? rand(i + 4) * FIELD_HEIGHT_M : rand(i + 5) < 0.5 ? rand(i + 6) * 5 : FIELD_HEIGHT_M - rand(i + 6) * 5;
      const r = 0.6 + rand(i + 7) * 2.2;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      const hue = rand(i + 8) < 0.5 ? '86, 140, 60' : '60, 120, 70';
      g.addColorStop(0, `rgba(${hue}, 0.75)`);
      g.addColorStop(1, `rgba(${hue}, 0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    // Barnacles
    for (let i = 0; i < 260; i++) {
      ctx.fillStyle = `rgba(220, 225, 205, ${0.25 + rand(i + 50) * 0.3})`;
      ctx.beginPath();
      ctx.arc(rand(i + 60) * FIELD_WIDTH_M, rand(i + 70) * FIELD_HEIGHT_M, 0.04 + rand(i + 80) * 0.05, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    if (hasGroundMark(groundName)) drawWatermarkText(ctx, groundName, w, h, 'rgba(220, 255, 245, 0.12)');
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    return tex;
  }, [groundName]);
}

/** Drowned facade: dark teal concrete, a grid of dead windows, a few still glowing warm. */
function makeFacade(seed: number) {
  const [c, ctx] = makeCanvas(128, 256);
  const [e, ectx] = makeCanvas(128, 256);
  const base = ctx.createLinearGradient(0, 0, 0, 256);
  base.addColorStop(0, '#3A7C6C');
  base.addColorStop(0.35, '#2D6266');
  base.addColorStop(1, '#1D4A54');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 128, 256);
  ectx.fillStyle = '#000';
  ectx.fillRect(0, 0, 128, 256);
  for (let row = 0; row < 16; row++) {
    for (let col = 0; col < 6; col++) {
      const x = 8 + col * 20;
      const y = 6 + row * 16;
      const r = rand(seed * 977 + row * 31 + col);
      const lit = r < 0.07;
      ctx.fillStyle = lit ? '#FFC870' : r < 0.4 ? '#0B1E24' : '#12303A';
      ctx.fillRect(x, y, 13, 10);
      if (lit) {
        ectx.fillStyle = '#FFB850';
        ectx.fillRect(x, y, 13, 10);
      }
    }
  }
  // Moss and algae streaks running down from the top
  for (let i = 0; i < 40; i++) {
    const x = rand(seed + i) * 128;
    const len = 20 + rand(seed + i + 9) * 120;
    const g = ctx.createLinearGradient(0, 0, 0, len);
    g.addColorStop(0, 'rgba(98, 150, 70, 0.75)');
    g.addColorStop(1, 'rgba(98, 150, 70, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, 0, 2 + rand(seed + i + 3) * 6, len);
  }
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  const emissive = new THREE.CanvasTexture(e);
  emissive.colorSpace = THREE.SRGBColorSpace;
  emissive.wrapS = emissive.wrapT = THREE.RepeatWrapping;
  return { map, emissive };
}

// ---------------------------------------------------------------- the deck (exported)
export function SunkenDeck({ groundName, fc }: { groundName: GroundMarkSource; fc: FieldColors }) {
  const deck = useDeckTexture(groundName);
  const gridGeom = useMemo(() => {
    const pts: number[] = [];
    const hw = FIELD_WIDTH_M / 2;
    const hh = FIELD_HEIGHT_M / 2;
    for (let x = 0; x <= FIELD_WIDTH_M; x += 5) pts.push(x - hw, 0.012, -hh, x - hw, 0.012, hh);
    for (let y = 0; y <= FIELD_HEIGHT_M; y += 5) pts.push(-hw, 0.012, y - hh, hw, 0.012, y - hh);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, []);
  const f = PERIMETER_FENCE_M;
  const fence = [toV3(f, f, 0.04), toV3(FIELD_WIDTH_M - f, f, 0.04), toV3(FIELD_WIDTH_M - f, FIELD_HEIGHT_M - f, 0.04), toV3(f, FIELD_HEIGHT_M - f, 0.04), toV3(f, f, 0.04)];
  const side = '#4A3324';
  return (
    <group name="Field" userData={{ export: true }}>
      <mesh position-y={-DECK_THICK / 2}>
        <boxGeometry args={[FIELD_WIDTH_M, DECK_THICK, FIELD_HEIGHT_M]} />
        <meshStandardMaterial attach="material-0" color={side} roughness={0.95} />
        <meshStandardMaterial attach="material-1" color={side} roughness={0.95} />
        <meshStandardMaterial attach="material-2" map={deck} roughness={0.9} />
        <meshStandardMaterial attach="material-3" color={side} roughness={0.95} />
        <meshStandardMaterial attach="material-4" color={side} roughness={0.95} />
        <meshStandardMaterial attach="material-5" color={side} roughness={0.95} />
      </mesh>
      <lineSegments geometry={gridGeom}>
        <lineBasicMaterial color="#DDF7EE" transparent opacity={0.25} />
      </lineSegments>
      <Line points={fence} color={fc.fence ?? '#F2E6CF'} lineWidth={2.2} dashed dashSize={0.8} gapSize={0.45} />
    </group>
  );
}

// ---------------------------------------------------------------- water, light, surface
function SkyDome({ scale }: { scale: number }) {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: {
          uTop: { value: new THREE.Color('#5ED1C4') },
          uMid: { value: new THREE.Color(SUNKEN_FOG.color) },
          uBottom: { value: new THREE.Color('#0B3A44') },
        },
        vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `uniform vec3 uTop; uniform vec3 uMid; uniform vec3 uBottom; varying vec3 vP;
          void main(){
            float h = vP.y;
            vec3 c = h > 0.0 ? mix(uMid, uTop, pow(h, 0.7)) : mix(uMid, uBottom, pow(-h, 0.5));
            gl_FragColor = vec4(c, 1.0);
            #include <colorspace_fragment>
          }`,
      }),
    []
  );
  return (
    <mesh material={mat} renderOrder={-1}>
      <sphereGeometry args={[400 * scale, 32, 16]} />
    </mesh>
  );
}

/** The sea surface seen from below: bright, rippling, fading toward the distance. */
function Surface({ y, scale }: { y: number; scale: number }) {
  const still = !useSceneryMotion();
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        uniforms: { uTime: { value: 0 } },
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `uniform float uTime; varying vec2 vUv;
          void main(){
            vec2 p = (vUv - 0.5) * 60.0;
            float w = sin(p.x * 1.7 + sin(p.y * 1.3 + uTime) * 1.5 + uTime * 0.8) * sin(p.y * 1.9 - uTime * 0.6);
            float glints = smoothstep(0.55, 1.0, w);
            float fade = 1.0 - smoothstep(0.08, 0.5, length(vUv - 0.5));
            vec3 c = mix(vec3(0.36, 0.82, 0.78), vec3(0.92, 1.0, 0.97), glints);
            gl_FragColor = vec4(c, fade * (0.55 + glints * 0.4));
          }`,
      }),
    []
  );
  useFrame((_, dt) => {
    if (!still) mat.uniforms.uTime.value += dt;
  });
  return (
    <mesh rotation-x={Math.PI / 2} position-y={y} material={mat}>
      <planeGeometry args={[420 * scale, 420 * scale]} />
    </mesh>
  );
}

/** Shafts of sunlight slanting down from the surface, slowly breathing. */
function LightRays({ top, scale }: { top: number; scale: number }) {
  const still = !useSceneryMotion();
  const mats = useRef<THREE.ShaderMaterial[]>([]);
  const rays = useMemo(
    () =>
      Array.from({ length: 9 }, (_, i) => ({
        // Behind and beside the field, so they never wash over the track
        x: (rand(i + 200) - 0.5) * 150 * scale,
        z: -(FIELD_HEIGHT_M / 2 + 18 + rand(i + 210) * 60) * scale,
        w: (5 + rand(i + 220) * 9) * scale,
        tilt: 0.18 + rand(i + 230) * 0.12,
        rot: rand(i + 240) * Math.PI,
        phase: rand(i + 250) * 6,
      })),
    [scale]
  );
  const makeMat = (phase: number) =>
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: { uTime: { value: phase } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform float uTime; varying vec2 vUv;
        void main(){
          float edge = pow(sin(vUv.x * 3.14159), 2.0);
          float a = edge * smoothstep(0.0, 0.55, vUv.y) * (0.55 + 0.45 * sin(uTime * 0.5));
          gl_FragColor = vec4(vec3(0.75, 1.0, 0.92), a * 0.09);
        }`,
    });
  const materials = useMemo(() => rays.map((r) => makeMat(r.phase)), [rays]);
  mats.current = materials;
  useFrame((_, dt) => {
    if (still) return;
    for (const m of mats.current) m.uniforms.uTime.value += dt;
  });
  const len = top + 40 * scale;
  return (
    <group>
      {rays.map((r, i) => (
        <group key={i} position={[r.x, top - len / 2, r.z]} rotation={[r.tilt, r.rot, 0]}>
          <mesh material={materials[i]}>
            <planeGeometry args={[r.w, len]} />
          </mesh>
          <mesh material={materials[i]} rotation-y={Math.PI / 2}>
            <planeGeometry args={[r.w, len]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** Rippling patterns of light on the deck (additive overlay, not exported). */
function Caustics() {
  const still = !useSceneryMotion();
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { uTime: { value: 0 }, uSize: { value: new THREE.Vector2(FIELD_WIDTH_M + LEDGE * 2, FIELD_HEIGHT_M + LEDGE * 2) } },
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `uniform float uTime; uniform vec2 uSize; varying vec2 vUv;
          #define TAU 6.28318530718
          void main(){
            float time = uTime * 0.4 + 23.0;
            vec2 p = mod(vUv * uSize / 7.0 * TAU, TAU) - 250.0;
            vec2 i = p;
            float c = 1.0;
            float inten = 0.005;
            for (int n = 0; n < 4; n++) {
              float t = time * (1.0 - (3.5 / float(n + 1)));
              i = p + vec2(cos(t - i.x) + sin(t + i.y), sin(t - i.y) + cos(t + i.x));
              c += 1.0 / length(vec2(p.x / (sin(i.x + t) / inten), p.y / (cos(i.y + t) / inten)));
            }
            c /= 4.0;
            c = 1.17 - pow(c, 1.4);
            float v = clamp(pow(abs(c), 8.0), 0.0, 1.0);
            gl_FragColor = vec4(vec3(0.6, 1.0, 0.9) * v * 0.45, v * 0.2);
          }`,
      }),
    []
  );
  useFrame((_, dt) => {
    if (!still) mat.uniforms.uTime.value += dt;
  });
  return (
    <mesh rotation-x={-Math.PI / 2} position-y={0.02} material={mat} renderOrder={2}>
      <planeGeometry args={[FIELD_WIDTH_M + LEDGE * 2, FIELD_HEIGHT_M + LEDGE * 2]} />
    </mesh>
  );
}

// ---------------------------------------------------------------- the city
interface Tower {
  pos: [number, number, number];
  size: [number, number, number];
  tilt: number;
  tex: number;
}

/** The tower the field stands on, with a ledge, a rusted railing and growth on its roof. */
function HomeTower({ facades }: { facades: { map: THREE.Texture; emissive: THREE.Texture }[] }) {
  const W = FIELD_WIDTH_M + LEDGE * 2;
  const D = FIELD_HEIGHT_M + LEDGE * 2;
  const H = 70;
  const f = facades[0];
  const side = useMemo(() => {
    const m = f.map.clone();
    const e = f.emissive.clone();
    m.repeat.set(5, 4);
    e.repeat.set(5, 4);
    m.needsUpdate = e.needsUpdate = true;
    return { m, e };
  }, [f]);
  const roofY = -DECK_THICK - 0.01;
  const rail = useMemo(() => {
    const out: { pos: [number, number, number]; size: [number, number, number] }[] = [];
    const hx = W / 2 - 0.3;
    const hz = D / 2 - 0.3;
    for (let x = -hx; x <= hx; x += 2.5) {
      if (rand(x * 3) < 0.15) continue; // a few posts have rusted away
      out.push({ pos: [x, roofY + 0.55, -hz], size: [0.08, 1.1, 0.08] }, { pos: [x, roofY + 0.55, hz], size: [0.08, 1.1, 0.08] });
    }
    for (let z = -hz + 2.5; z < hz; z += 2.5) {
      out.push({ pos: [-hx, roofY + 0.55, z], size: [0.08, 1.1, 0.08] }, { pos: [hx, roofY + 0.55, z], size: [0.08, 1.1, 0.08] });
    }
    out.push(
      { pos: [0, roofY + 1.1, -hz], size: [W - 0.6, 0.08, 0.08] },
      { pos: [0, roofY + 1.1, hz], size: [W - 0.6, 0.08, 0.08] },
      { pos: [-hx, roofY + 1.1, 0], size: [0.08, 0.08, D - 0.6] },
      { pos: [hx, roofY + 1.1, 0], size: [0.08, 0.08, D - 0.6] }
    );
    return out;
  }, [W, D, roofY]);
  return (
    <group>
      <mesh position-y={roofY - H / 2}>
        <boxGeometry args={[W, H, D]} />
        <meshStandardMaterial map={side.m} emissiveMap={side.e} emissive="#ffffff" emissiveIntensity={0.9} roughness={1} />
      </mesh>
      {/* Mossy concrete roof around the deck */}
      <mesh position-y={roofY + 0.005} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[W, D]} />
        <meshStandardMaterial color="#4E7A5A" roughness={1} />
      </mesh>
      {rail.map((r, i) => (
        <mesh key={i} position={r.pos}>
          <boxGeometry args={r.size} />
          <meshStandardMaterial color="#8A4B2A" roughness={0.9} metalness={0.3} />
        </mesh>
      ))}
    </group>
  );
}

function Towers({ scale, facades }: { scale: number; facades: { map: THREE.Texture; emissive: THREE.Texture }[] }) {
  const towers = useMemo<Tower[]>(() => {
    const out: Tower[] = [];
    const clearX = FIELD_WIDTH_M / 2 + 12;
    const clearZ = FIELD_HEIGHT_M / 2 + 12;
    for (let i = 0; out.length < 34 && i < 400; i++) {
      const a = rand(i + 300) * Math.PI * 2;
      const r = (40 + rand(i + 310) * 95) * scale;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (Math.abs(x) < clearX && Math.abs(z) < clearZ) continue;
      const w = 8 + rand(i + 320) * 12;
      const d = 8 + rand(i + 330) * 12;
      // Towers between the default camera and the field stay low, so you look down into the city
      const inFront = z > FIELD_HEIGHT_M / 2 && Math.abs(x) < 70 * scale;
      const topY = inFront ? -14 - rand(i + 340) * 22 : -18 + rand(i + 350) * 48;
      const bottom = -110;
      const h = topY - bottom;
      out.push({ pos: [x, bottom + h / 2, z], size: [w, h, d], tilt: (rand(i + 360) - 0.5) * 0.12, tex: i % facades.length });
    }
    return out;
  }, [scale, facades.length]);

  const mats = useMemo(
    () =>
      facades.map((f) => {
        const m = f.map.clone();
        const e = f.emissive.clone();
        m.repeat.set(1, 5);
        e.repeat.set(1, 5);
        m.needsUpdate = e.needsUpdate = true;
        return new THREE.MeshStandardMaterial({ map: m, emissiveMap: e, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 1, roughness: 1 });
      }),
    [facades]
  );
  const roofMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#4F8250', roughness: 1, flatShading: true }), []);

  return (
    <group>
      {towers.map((t, i) => (
        <group key={i} position={t.pos} rotation={[t.tilt, 0, t.tilt * 0.6]}>
          <mesh material={mats[t.tex]}>
            <boxGeometry args={t.size} />
          </mesh>
          {/* Overgrown roof */}
          <mesh position-y={t.size[1] / 2 + 0.4} material={roofMat} scale={[t.size[0] * 0.48, 0.8, t.size[2] * 0.48]}>
            <dodecahedronGeometry args={[1, 0]} />
          </mesh>
          <Kelp position={[t.size[0] * 0.3, t.size[1] / 2, -t.size[2] * 0.2]} height={4 + rand(i + 400) * 6} phase={i} />
          <CoralCluster position={[-t.size[0] * 0.25, t.size[1] / 2 + 0.2, t.size[2] * 0.25]} seed={i + 500} />
        </group>
      ))}
    </group>
  );
}

// ---------------------------------------------------------------- life
const KELP_MATS = [
  new THREE.MeshStandardMaterial({ color: '#4E8A3A', roughness: 0.8, side: THREE.DoubleSide }),
  new THREE.MeshStandardMaterial({ color: '#6E9B3C', roughness: 0.8, side: THREE.DoubleSide }),
];

/** A kelp strand: a chain of ribbon segments, each swaying a little more than the one below. */
function Kelp({ position, height, phase }: { position: [number, number, number]; height: number; phase: number }) {
  const segs = 7;
  const segH = height / segs;
  const refs = useRef<(THREE.Group | null)[]>([]);
  const still = !useSceneryMotion();
  useFrame(({ clock }) => {
    if (still) return;
    const t = clock.elapsedTime;
    refs.current.forEach((g, i) => {
      if (!g) return;
      g.rotation.z = Math.sin(t * 0.9 + phase + i * 0.45) * 0.12;
      g.rotation.x = Math.cos(t * 0.7 + phase + i * 0.4) * 0.07;
    });
  });
  const mat = KELP_MATS[phase % 2];
  let node: React.ReactNode = null;
  for (let i = segs - 1; i >= 0; i--) {
    const w = 0.5 - (i / segs) * 0.25;
    node = (
      <group ref={(g) => { refs.current[i] = g; }} position-y={i === 0 ? 0 : segH}>
        <mesh position-y={segH / 2} material={mat}>
          <planeGeometry args={[w, segH * 1.05]} />
        </mesh>
        <mesh position-y={segH / 2} rotation-y={Math.PI / 2} material={mat}>
          <planeGeometry args={[w * 0.7, segH * 1.05]} />
        </mesh>
        {node}
      </group>
    );
  }
  return <group position={position}>{node}</group>;
}

const CORAL_COLORS = ['#E8B33A', '#E86A33', '#8A5BD6', '#E0628A', '#F08A3C', '#C9A0F0'];
function CoralCluster({ position, seed, size = 1 }: { position: [number, number, number]; seed: number; size?: number }) {
  const parts = useMemo(() => {
    const n = 3 + Math.floor(rand(seed) * 4);
    return Array.from({ length: n }, (_, i) => {
      const kind = rand(seed + i * 3) < 0.6 ? 'tube' : 'brain';
      const h = (0.5 + rand(seed + i * 5) * 1.1) * size;
      const r = (0.12 + rand(seed + i * 7) * 0.14) * size;
      return {
        kind,
        h,
        r,
        x: (rand(seed + i * 11) - 0.5) * 1.4 * size,
        z: (rand(seed + i * 13) - 0.5) * 1.4 * size,
        tilt: (rand(seed + i * 17) - 0.5) * 0.5,
        color: CORAL_COLORS[Math.floor(rand(seed + i * 19) * CORAL_COLORS.length)],
      };
    });
  }, [seed, size]);
  return (
    <group position={position}>
      {parts.map((p, i) =>
        p.kind === 'tube' ? (
          <mesh key={i} position={[p.x, p.h / 2, p.z]} rotation-z={p.tilt}>
            <cylinderGeometry args={[p.r * 1.1, p.r, p.h, 10, 1, true]} />
            <meshStandardMaterial color={p.color} roughness={0.8} side={THREE.DoubleSide} />
          </mesh>
        ) : (
          <mesh key={i} position={[p.x, p.r * 1.2, p.z]} scale={[1, 0.7, 1]}>
            <icosahedronGeometry args={[p.r * 2.6, 1]} />
            <meshStandardMaterial color={p.color} roughness={0.9} flatShading />
          </mesh>
        )
      )}
    </group>
  );
}

/** Kelp and coral along the roof ledge, outside the field so gates stay clear. */
function LedgeGrowth() {
  const spots = useMemo(() => {
    const out: { pos: [number, number, number]; kind: 'kelp' | 'coral'; seed: number }[] = [];
    const hx = FIELD_WIDTH_M / 2 + LEDGE / 2;
    const hz = FIELD_HEIGHT_M / 2 + LEDGE / 2;
    const y = -DECK_THICK;
    for (let i = 0; i < 26; i++) {
      const s = rand(i + 600);
      const along = rand(i + 610) * 2 - 1;
      const pos: [number, number, number] =
        s < 0.25 ? [along * hx, y, -hz] : s < 0.5 ? [along * hx, y, hz] : s < 0.75 ? [-hx, y, along * hz] : [hx, y, along * hz];
      out.push({ pos, kind: rand(i + 620) < 0.45 ? 'kelp' : 'coral', seed: i + 700 });
    }
    return out;
  }, []);
  return (
    <group>
      {spots.map((s, i) =>
        s.kind === 'kelp' ? (
          <Kelp key={i} position={s.pos} height={3 + rand(s.seed) * 4} phase={s.seed} />
        ) : (
          <CoralCluster key={i} position={s.pos} seed={s.seed} size={0.9} />
        )
      )}
    </group>
  );
}

/** Schools of small fish circling the city. */
function FishSchools({ scale }: { scale: number }) {
  const PER = 28;
  const schools = useMemo(
    () => [
      { r: 42 * scale, y: 9, speed: 0.11, color: '#F2A23A', phase: 0 },
      { r: 55 * scale, y: 15, speed: -0.08, color: '#D9E6E6', phase: 2 },
      { r: 34 * scale, y: 5, speed: 0.14, color: '#F5D46A', phase: 4 },
    ],
    [scale]
  );
  const offsets = useMemo(
    () => Array.from({ length: PER }, (_, i) => new THREE.Vector3((rand(i + 800) - 0.5) * 7, (rand(i + 810) - 0.5) * 3, (rand(i + 820) - 0.5) * 7)),
    []
  );
  const refs = useRef<(THREE.InstancedMesh | null)[]>([]);
  const geo = useMemo(() => {
    const g = new THREE.ConeGeometry(0.16, 0.6, 6);
    g.rotateZ(-Math.PI / 2); // nose along +X
    return g;
  }, []);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const still = !useSceneryMotion();
  const place = (t: number) => {
    schools.forEach((s, si) => {
      const mesh = refs.current[si];
      if (!mesh) return;
      const a = s.phase + t * s.speed;
      const cx = Math.cos(a) * s.r;
      const cz = Math.sin(a) * s.r;
      const heading = -a + (s.speed > 0 ? -Math.PI / 2 : Math.PI / 2);
      offsets.forEach((o, i) => {
        dummy.position.set(cx + o.x, s.y + o.y + Math.sin(t * 2 + i) * 0.3, cz + o.z);
        dummy.rotation.set(0, heading + Math.sin(t * 6 + i) * 0.15, 0);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
    });
  };
  useFrame(({ clock }) => {
    if (!still) place(clock.elapsedTime);
  });
  useLayoutEffect(() => place(0));
  return (
    <group>
      {schools.map((s, si) => (
        <instancedMesh key={si} ref={(m) => { refs.current[si] = m; }} args={[geo, undefined, PER]}>
          <meshStandardMaterial color={s.color} roughness={0.5} metalness={0.2} />
        </instancedMesh>
      ))}
    </group>
  );
}

/** Glowing jellyfish drifting upward and pulsing. */
function Jellyfish({ scale }: { scale: number }) {
  const jellies = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => ({
        x: (rand(i + 900) - 0.5) * 120 * scale,
        z: (rand(i + 910) - 0.5) * 100 * scale,
        y0: -10 + rand(i + 920) * 30,
        s: 0.7 + rand(i + 930) * 0.8,
        phase: rand(i + 940) * 10,
      })).filter((j) => !(Math.abs(j.x) < FIELD_WIDTH_M / 2 + 4 && Math.abs(j.z) < FIELD_HEIGHT_M / 2 + 4)),
    [scale]
  );
  const refs = useRef<(THREE.Group | null)[]>([]);
  const still = !useSceneryMotion();
  useFrame(({ clock }) => {
    if (still) return;
    const t = clock.elapsedTime;
    jellies.forEach((j, i) => {
      const g = refs.current[i];
      if (!g) return;
      const pulse = Math.sin(t * 2 + j.phase);
      g.position.y = j.y0 + (((t * 0.4 + j.phase * 3) % 40) - 10);
      g.scale.set(j.s * (1 + pulse * 0.08), j.s * (1 - pulse * 0.12), j.s * (1 + pulse * 0.08));
    });
  });
  return (
    <group>
      {jellies.map((j, i) => (
        <group key={i} ref={(g) => { refs.current[i] = g; }} position={[j.x, j.y0, j.z]} scale={j.s}>
          <mesh>
            <sphereGeometry args={[0.9, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshStandardMaterial color="#9EE8FF" emissive="#58C8FF" emissiveIntensity={1.4} transparent opacity={0.6} side={THREE.DoubleSide} depthWrite={false} />
          </mesh>
          {[0, 1, 2, 3, 4, 5].map((k) => (
            <mesh key={k} position={[Math.cos(k) * 0.5, -1.1, Math.sin(k) * 0.5]}>
              <cylinderGeometry args={[0.025, 0.01, 2.2, 4]} />
              <meshBasicMaterial color="#A8EEFF" transparent opacity={0.45} depthWrite={false} />
            </mesh>
          ))}
          <pointLight color="#6FD3FF" intensity={6} distance={9} />
        </group>
      ))}
    </group>
  );
}

/** Bubbles rising from the deep and from the deck edges. */
function Bubbles({ scale, top }: { scale: number; top: number }) {
  const COUNT = 420;
  const sprite = useMemo(() => {
    const [c, ctx] = makeCanvas(64, 64);
    const g = ctx.createRadialGradient(32, 32, 4, 32, 32, 30);
    g.addColorStop(0, 'rgba(255,255,255,0.05)');
    g.addColorStop(0.7, 'rgba(220,255,250,0.35)');
    g.addColorStop(0.9, 'rgba(255,255,255,0.9)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(32, 32, 30, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.arc(24, 22, 5, 0, Math.PI * 2);
    ctx.fill();
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
  const { geo, speeds, bottom } = useMemo(() => {
    const pos = new Float32Array(COUNT * 3);
    const sp = new Float32Array(COUNT);
    const bot = -40;
    for (let i = 0; i < COUNT; i++) {
      // Columns of bubbles: half near the deck edges, half out in the city
      const col = Math.floor(rand(i + 1000) * 40);
      const nearDeck = col < 20;
      const a = rand(col + 1010) * Math.PI * 2;
      const r = nearDeck ? FIELD_WIDTH_M / 2 + 2 + rand(col + 1020) * 6 : (35 + rand(col + 1030) * 80) * scale;
      pos[i * 3] = Math.cos(a) * r * (nearDeck ? 1 : 1) + (rand(i + 1040) - 0.5) * 1.2;
      pos[i * 3 + 1] = bot + rand(i + 1050) * (top - bot);
      pos[i * 3 + 2] = Math.sin(a) * r * (nearDeck ? FIELD_HEIGHT_M / FIELD_WIDTH_M : 1) + (rand(i + 1060) - 0.5) * 1.2;
      sp[i] = 1.2 + rand(i + 1070) * 2.2;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return { geo: g, speeds: sp, bottom: bot };
  }, [scale, top]);
  const still = !useSceneryMotion();
  useFrame(({ clock }, dt) => {
    if (still) return;
    const attr = geo.getAttribute('position') as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    const t = clock.elapsedTime;
    for (let i = 0; i < COUNT; i++) {
      arr[i * 3 + 1] += speeds[i] * Math.min(dt, 0.05);
      arr[i * 3] += Math.sin(t * 2 + i) * 0.004;
      if (arr[i * 3 + 1] > top) arr[i * 3 + 1] = bottom;
    }
    attr.needsUpdate = true;
  });
  return (
    <points geometry={geo}>
      <pointsMaterial map={sprite} size={0.45} sizeAttenuation transparent depthWrite={false} color="#ffffff" />
    </points>
  );
}

// ---------------------------------------------------------------- scene
export function SunkenCity({ scale }: { scale: number }) {
  const facades = useMemo(() => [makeFacade(1), makeFacade(2), makeFacade(3)], []);
  // Well above the orbit camera (which can sit up to ~105 m high on phones), so you look up at it
  const surfaceY = 140 * scale;
  return (
    <NoPick>
      <group name="SunkenCity">
        <SkyDome scale={scale} />
        <Surface y={surfaceY} scale={scale} />
        <LightRays top={surfaceY} scale={scale} />
        <Caustics />
        <HomeTower facades={facades} />
        <LedgeGrowth />
        <Towers scale={scale} facades={facades} />
        <FishSchools scale={scale} />
        <Jellyfish scale={scale} />
        <Bubbles scale={scale} top={45 * scale} />
      </group>
    </NoPick>
  );
}
