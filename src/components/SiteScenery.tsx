import React, { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { EquipmentDef, PlacedItem } from '../types';
import { FIELD_HEIGHT_M, FIELD_WIDTH_M } from '../constants/equipment';
import { drawWatermarkText, GroundMarkSource, hasGroundMark } from '../utils/watermark';
import { FieldColors } from '../theme/engine';
import { DESERT } from '../theme/desert';
import { cachedLogoImage } from '../utils/logos';
import { glowBoost, graphicsQuality, makeBumpNormalMap, makeFoliageGeometry, makeFrondGeometry, paintGround, detileGround } from './Graphics';

/**
 * 3D models for the site pieces (src/constants/siteEquipment.ts) and the Desert look's world.
 * Local frame: X = width, Y = up, Z = length. Ground surfaces never catch clicks.
 */

const noRaycast = () => {};

/** Repeatable pseudo-random numbers from a string (so the same item always grows the same bushes). */
function seeded(key: string) {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

/** Canvas texture helper (repeats, sRGB). */
function useCanvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void, deps: unknown[], repeat?: [number, number]) {
  const tex = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    draw(c.getContext('2d')!);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    if (repeat) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(repeat[0], repeat[1]);
    }
    return t;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => () => tex.dispose(), [tex]);
  return tex;
}

/** Speckled sand / gravel texture. */
function grain(ctx: CanvasRenderingContext2D, base: string, dark: string, light: string, _n: number, rnd: () => number) {
  // Smooth natural patches of the three tones with a fine grain (no hard square specks)
  paintGround(ctx, dark, base, light, Math.floor(rnd() * 1000) + 1);
}

// Shared bump (normal) map for rough ground, cloned per surface so each can tile at its own scale
let bumpBase: THREE.DataTexture | null = null;
function useBump(repeatX: number, repeatY: number) {
  const tex = useMemo(() => {
    bumpBase ??= makeBumpNormalMap(7);
    const t = bumpBase.clone();
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeatX, repeatY);
    t.needsUpdate = true;
    return t;
  }, [repeatX, repeatY]);
  useEffect(() => () => tex.dispose(), [tex]);
  return tex;
}
const BUMP = new THREE.Vector2(0.55, 0.55);

// Shared organic shapes for crowns and bushes
let foliage: THREE.BufferGeometry[] | null = null;
let bushGeo: THREE.BufferGeometry | null = null;
let frondGeo: THREE.BufferGeometry | null = null;
const foliageGeos = () => (foliage ??= [makeFoliageGeometry(1.3, 3), makeFoliageGeometry(4.1, 3), makeFoliageGeometry(7.7, 3)]);
const bushGeometry = () => (bushGeo ??= makeFoliageGeometry(2.9, 3, true));
const frondGeometry = () => (frondGeo ??= makeFrondGeometry());

/**
 * Ground layers stack a few centimetres apart (thinner than real turf), because on a big field the
 * camera, which must see from 5 cm (FPV) to the horizon, can only tell surfaces apart about 10 cm apart
 * at 300 m. A tiny polygon offset only breaks ties; a big one would hide gates standing on the turf.
 */
const LAYER_Y = [0, 0.08, 0.1, 0.12, 0.14, 0.18];
const onTop = (layer: number) => ({ polygonOffset: true, polygonOffsetFactor: 0, polygonOffsetUnits: -layer });

/** Flat surface lying on the ground, never pickable. */
function Surface({ w, d, y, children }: { w: number; d: number; y: number; children: React.ReactNode }) {
  return (
    <mesh rotation-x={-Math.PI / 2} position-y={y} raycast={noRaycast}>
      <planeGeometry args={[w, d]} />
      {children}
    </mesh>
  );
}

/** Soft dark blob on the ground, offset away from the morning sun (SE, local +X before rotation). */
function BlobShadow({ r, len = 0, opacity = 0.28 }: { r: number; len?: number; opacity?: number }) {
  return graphicsQuality() === 'low' ? <BlobShadowDisc r={r} len={len} opacity={opacity} /> : null; // real shadows otherwise
}
function BlobShadowDisc({ r, len, opacity }: { r: number; len: number; opacity: number }) {
  const tex = useCanvasTexture(64, 64, (ctx) => {
    const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
  }, []);
  return (
    <mesh rotation-x={-Math.PI / 2} position={[-len * 0.5, 0.03, 0]} raycast={noRaycast} userData={{ noExport: true }}>
      <planeGeometry args={[r * 2 + len, r * 2]} />
      <meshBasicMaterial map={tex} transparent opacity={opacity} depthWrite={false} />
    </mesh>
  );
}

// ---------------------------------------------------------------- ground surfaces
function TurfPitch({ w, d, h, selected }: { w: number; d: number; h: number; selected: boolean }) {
  const stripes = Math.max(4, Math.round(w / 6));
  const turf = useCanvasTexture(512, 256, (ctx) => {
    for (let i = 0; i < stripes; i++) {
      ctx.fillStyle = i % 2 ? '#2E7D1F' : '#287019';
      ctx.fillRect((i * 512) / stripes, 0, 512 / stripes + 1, 256);
    }
    // Blade speckle, so the turf is not a flat fill
    const rnd = seeded('turf');
    for (let i = 0; i < 9000; i++) {
      ctx.fillStyle = rnd() > 0.5 ? 'rgba(255,255,190,0.05)' : 'rgba(0,25,0,0.07)';
      ctx.fillRect(rnd() * 512, rnd() * 256, 1, 1 + rnd() * 2);
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(6, 6, 500, 244);
  }, [stripes]);
  const turfBump = useBump(w / 1.6, d / 1.6);
  const posts = useMemo(() => {
    const out: [number, number][] = [];
    const step = 6;
    for (let x = -w / 2; x <= w / 2 + 0.01; x += w / Math.round(w / step)) out.push([x, -d / 2], [x, d / 2]);
    for (let z = -d / 2 + d / Math.round(d / step); z < d / 2 - 0.01; z += d / Math.round(d / step)) out.push([-w / 2, z], [w / 2, z]);
    return out;
  }, [w, d]);
  const net = '#1F5F2A';
  return (
    <group>
      <Surface w={w} d={d} y={LAYER_Y[5]}>
        <meshStandardMaterial map={turf} roughness={0.95} normalMap={turfBump} normalScale={BUMP} color={selected ? '#fef08a' : '#ffffff'} {...onTop(5)} />
      </Surface>
      {/* Net fence */}
      {[
        [0, -d / 2, w, 0],
        [0, d / 2, w, 0],
        [-w / 2, 0, d, Math.PI / 2],
        [w / 2, 0, d, Math.PI / 2],
      ].map(([x, z, len, rot], i) => (
        <mesh key={i} position={[x, h / 2, z]} rotation-y={rot} raycast={noRaycast}>
          <planeGeometry args={[len, h]} />
          <meshStandardMaterial color={net} transparent opacity={0.28} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
      ))}
      {posts.map(([x, z], i) => (
        <mesh key={i} position={[x, h / 2, z]} raycast={noRaycast}>
          <cylinderGeometry args={[0.05, 0.05, h, 6]} />
          <meshStandardMaterial color="#2D4A30" />
        </mesh>
      ))}
    </group>
  );
}

function SandPit({ w, d, h, selected }: { w: number; d: number; h: number; selected: boolean }) {
  const sand = useCanvasTexture(256, 256, (ctx) => grain(ctx, '#BFAF94', '#A99A80', '#D3C5AC', 2400, seeded('pit')), [], [Math.max(1, w / 10), Math.max(1, d / 10)]);
  const curb = '#A3A29E';
  return (
    <group>
      <Surface w={w} d={d} y={LAYER_Y[5]}>
        <meshStandardMaterial map={sand} roughness={1} color={selected ? '#fef3c7' : '#ffffff'} {...onTop(5)} />
      </Surface>
      {[
        [0, -d / 2, w + 0.3, 0.3],
        [0, d / 2, w + 0.3, 0.3],
        [-w / 2, 0, 0.3, d],
        [w / 2, 0, 0.3, d],
      ].map(([x, z, sx, sz], i) => (
        <mesh key={i} position={[x, 0.2, z]} raycast={noRaycast}>
          <boxGeometry args={[sx, 0.4, sz]} />
          <meshStandardMaterial color={curb} roughness={0.9} />
        </mesh>
      ))}
      {/* Light mesh fence on the curb */}
      {[
        [0, -d / 2, w, 0],
        [0, d / 2, w, 0],
        [-w / 2, 0, d, Math.PI / 2],
        [w / 2, 0, d, Math.PI / 2],
      ].map(([x, z, len, rot], i) => (
        <mesh key={`f${i}`} position={[x, 0.4 + h / 2, z]} rotation-y={rot} raycast={noRaycast}>
          <planeGeometry args={[len, h]} />
          <meshStandardMaterial color="#9CA3AF" transparent opacity={0.18} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

function FlatSurface({ w, d, kind, selected, id }: { w: number; d: number; kind: 'asphalt' | 'gravel' | 'dirt' | 'area'; selected: boolean; id: string }) {
  const spec = {
    asphalt: { base: '#4B4A48', dark: '#3D3C3A', light: '#5E5D5A', n: 3000, y: 0.012, layer: 2 },
    gravel: { base: '#8E8478', dark: '#776E63', light: '#A69C8F', n: 2600, y: 0.014, layer: 3 },
    dirt: { base: '#C9BBA3', dark: '#B3A58C', light: '#D9CDB8', n: 1800, y: 0.016, layer: 4 },
    area: { base: '#C2B49C', dark: '#AFA189', light: '#D3C7B2', n: 1800, y: 0.011, layer: 1 },
  }[kind];
  const tex = useCanvasTexture(256, 256, (ctx) => {
    const rnd = seeded(kind + id);
    grain(ctx, spec.base, spec.dark, spec.light, spec.n, rnd);
    if (kind === 'dirt' || kind === 'area') {
      // Tyre ruts along the length
      ctx.strokeStyle = 'rgba(120,105,85,0.35)';
      ctx.lineWidth = 3;
      for (const x of kind === 'dirt' ? [70, 95, 160, 185] : [40, 90, 150, 210]) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.bezierCurveTo(x + 10, 85, x - 10, 170, x + (kind === 'area' ? 25 : 0), 256);
        ctx.stroke();
      }
    }
    if (kind === 'gravel') {
      ctx.fillStyle = 'rgba(70,62,52,0.25)';
      ctx.fillRect(0, 0, 18, 256);
      ctx.fillRect(238, 0, 18, 256);
    }
  }, [kind, id], [1, Math.max(1, Math.round(d / Math.max(w, 4)))]);
  const bump = useBump(Math.max(1, w / 4), Math.max(1, d / 4));
  return (
    <Surface w={w} d={d} y={LAYER_Y[spec.layer]}>
      <meshStandardMaterial map={tex} roughness={kind === 'asphalt' ? 0.85 : 1} normalMap={bump} normalScale={BUMP} color={selected ? '#fef08a' : '#ffffff'} {...onTop(spec.layer)} />
    </Surface>
  );
}

/** Quarter-circle dirt track: centre of the turn at the local origin, from local +X round to local -Z. */
function DirtCurve({ w, r, selected }: { w: number; r: number; selected: boolean }) {
  const tex = useCanvasTexture(128, 128, (ctx) => grain(ctx, '#C9BBA3', '#B3A58C', '#D9CDB8', 900, seeded('curve')), [], [3, 1]);
  return (
    <mesh rotation-x={-Math.PI / 2} position-y={LAYER_Y[4]} raycast={noRaycast}>
      <ringGeometry args={[Math.max(0.1, r - w / 2), r + w / 2, 32, 1, 0, Math.PI / 2]} />
      <meshStandardMaterial map={tex} roughness={1} color={selected ? '#fef08a' : '#ffffff'} {...onTop(4)} />
    </mesh>
  );
}

/** Natural grass: mottled greens with scattered tufts. */
function Grass({ w, d, id, selected }: { w: number; d: number; id: string; selected: boolean }) {
  const tex = useCanvasTexture(256, 256, (ctx) => {
    const rnd = seeded('grass' + id);
    grain(ctx, '#5E7D3A', '#4C6A2E', '#6F8E45', 4200, rnd);
    for (let i = 0; i < 40; i++) {
      const x = rnd() * 256;
      const y = rnd() * 256;
      const r = 10 + rnd() * 30;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      const c = rnd() < 0.5 ? '70,95,40' : '125,150,75';
      g.addColorStop(0, `rgba(${c},0.45)`);
      g.addColorStop(1, `rgba(${c},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }, [id], [Math.max(1, w / 8), Math.max(1, d / 8)]);
  const tufts = useMemo(() => {
    const rnd = seeded('tufts' + id);
    const n = Math.min(500, Math.max(10, Math.round((w * d) / 2)));
    const geo = new THREE.ConeGeometry(0.12, 1, 5);
    geo.translate(0, 0.5, 0);
    const mat = new THREE.MeshStandardMaterial({ roughness: 1 });
    const m = new THREE.InstancedMesh(geo, mat, n);
    const o = new THREE.Object3D();
    const col = new THREE.Color();
    for (let i = 0; i < n; i++) {
      o.position.set((rnd() - 0.5) * w, LAYER_Y[1], (rnd() - 0.5) * d);
      const s = 0.15 + rnd() * 0.25;
      o.scale.set(1 + rnd(), s, 1 + rnd());
      o.rotation.set((rnd() - 0.5) * 0.3, rnd() * Math.PI, (rnd() - 0.5) * 0.3);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
      m.setColorAt(i, col.set(rnd() < 0.5 ? '#4F6D2C' : '#6C8A3E'));
    }
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.raycast = noRaycast;
    return m;
  }, [w, d, id]);
  useEffect(() => () => {
    tufts.geometry.dispose();
    (tufts.material as THREE.Material).dispose();
  }, [tufts]);
  return (
    <group>
      <Surface w={w} d={d} y={LAYER_Y[1]}>
        <meshStandardMaterial map={tex} roughness={1} color={selected ? '#fef08a' : '#ffffff'} {...onTop(1)} />
      </Surface>
      <primitive object={tufts} />
    </group>
  );
}

// ---------------------------------------------------------------- terrain
const BUSH_COLORS = ['#46502F', '#56603A', '#636B42', '#38472A', '#6E7248'];
function ScrubPatch({ w, d, id }: { w: number; d: number; id: string }) {
  const mesh = useMemo(() => {
    const rnd = seeded(id);
    const n = Math.min(260, Math.max(4, Math.round((w * d) / 9)));
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.95, vertexColors: true });
    const m = new THREE.InstancedMesh(bushGeometry(), mat, n);
    const o = new THREE.Object3D();
    const col = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const s = 0.5 + rnd() * 0.9;
      o.position.set((rnd() - 0.5) * w, 0, (rnd() - 0.5) * d);
      o.rotation.y = rnd() * Math.PI * 2;
      o.scale.set(s * (0.85 + rnd() * 0.4), s * (0.6 + rnd() * 0.35), s * (0.85 + rnd() * 0.4));
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
      m.setColorAt(i, col.set(BUSH_COLORS[Math.floor(rnd() * BUSH_COLORS.length)]).multiplyScalar(1.5));
    }
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    return m;
  }, [w, d, id]);
  useEffect(() => () => (mesh.material as THREE.Material).dispose(), [mesh]);
  return <primitive object={mesh} />;
}

function Berm({ w, d, h, selected }: { w: number; d: number; h: number; selected: boolean }) {
  const bump = useBump(Math.max(1, w / 2), Math.max(1, d / 4));
  return (
    <mesh scale={[w / 2, h, d / 2]}>
      <sphereGeometry args={[1, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
      <meshStandardMaterial color={selected ? '#fde68a' : '#BDAE92'} roughness={1} normalMap={bump} normalScale={BUMP} />
    </mesh>
  );
}

// ---------------------------------------------------------------- trees
function Crown({ r, h, colors, seed, y0, big }: { r: number; h: number; colors: string[]; seed: string; y0: number; big: boolean }) {
  const blobs = useMemo(() => {
    const rnd = seeded(seed);
    const core = big ? Math.max(9, Math.round(r * 2.2)) : 5;
    const n = core + (big ? 8 : 3); // the extra ones are small clumps that break up the outline
    const top = h - y0;
    return Array.from({ length: n }, (_, i) => {
      const clump = i >= core;
      const a = rnd() * Math.PI * 2;
      const dist = i === 0 ? 0 : clump ? r * (0.62 + rnd() * 0.28) : r * Math.sqrt(rnd()) * 0.72;
      const edge = Math.min(1, dist / (r * 0.72)); // 0 centre .. 1 rim: the canopy is domed
      const s = clump ? r * (0.17 + rnd() * 0.1) : r * (0.36 + rnd() * 0.2) * (1 - edge * 0.25);
      return {
        x: Math.cos(a) * dist,
        z: Math.sin(a) * dist,
        y: y0 + top * (0.62 - edge * edge * 0.28 + (rnd() - 0.5) * 0.12),
        s,
        sy: s * (0.62 + rnd() * 0.2),
        rot: rnd() * Math.PI * 2,
        g: i % 3,
        c: colors[i % colors.length],
      };
    });
  }, [r, h, seed, y0, big]);
  const geos = foliageGeos();
  return (
    <group>
      {blobs.map((b, i) => (
        <mesh key={i} geometry={geos[b.g]} position={[b.x, b.y, b.z]} rotation-y={b.rot} scale={[b.s, b.sy, b.s]}>
          <meshStandardMaterial color={b.c} roughness={0.92} vertexColors />
        </mesh>
      ))}
    </group>
  );
}

const TREE_BIG = ['#4E7A35', '#5A8A3D', '#446E2F', '#63934A'];
const TREE_SMALL = ['#7C8C4E', '#8A9A56', '#6E7E45'];
function Tree({ w, h, big, seed }: { w: number; h: number; big: boolean; seed: string }) {
  const r = w / 2;
  const trunkH = big ? h * 0.42 : h * 0.5;
  const trunkR = big ? Math.max(0.2, r * 0.045) : Math.max(0.08, r * 0.05);
  // A few boughs spreading up into the crown
  const boughs = useMemo(() => {
    const rnd = seeded('b' + seed);
    return Array.from({ length: big ? 4 : 2 }, (_, i) => ({ a: (i / (big ? 4 : 2)) * Math.PI * 2 + rnd(), tilt: 0.55 + rnd() * 0.35, len: r * (0.5 + rnd() * 0.25) }));
  }, [seed, big, r]);
  return (
    <group>
      <BlobShadow r={r * 0.9} len={h * 0.5} opacity={big ? 0.32 : 0.25} />
      <mesh position={[0, trunkH / 2, 0]}>
        <cylinderGeometry args={[trunkR * 0.8, trunkR * 1.25, trunkH, 9]} />
        <meshStandardMaterial color="#6B523A" roughness={1} />
      </mesh>
      {boughs.map((b, i) => (
        <group key={i} position={[0, trunkH * 0.82, 0]} rotation-y={b.a}>
          <mesh rotation-z={-b.tilt} position={[Math.sin(b.tilt) * b.len * 0.5, Math.cos(b.tilt) * b.len * 0.5, 0]}>
            <cylinderGeometry args={[trunkR * 0.35, trunkR * 0.7, b.len, 6]} />
            <meshStandardMaterial color="#6B523A" roughness={1} />
          </mesh>
        </group>
      ))}
      <Crown r={r} h={h} colors={big ? TREE_BIG : TREE_SMALL} seed={seed} y0={trunkH} big={big} />
    </group>
  );
}

function Palm({ w, h, seed }: { w: number; h: number; seed: string }) {
  const k = w / 5; // fronds scale with the crown size (5 m by default)
  const segs = 7;
  const { lean, fronds } = useMemo(() => {
    const rnd = seeded(seed);
    const lean = 0.03 + rnd() * 0.07;
    const fronds = Array.from({ length: 17 }, (_, i) => ({
      a: (i / 17) * Math.PI * 2 + rnd() * 0.3,
      // an upper ring that stands up and a lower ring that hangs
      tilt: i % 3 === 0 ? 0.55 + rnd() * 0.2 : i % 3 === 1 ? 0.15 + rnd() * 0.2 : -0.25 - rnd() * 0.25,
      s: 0.8 + rnd() * 0.3,
      c: ['#6F9440', '#5F8436', '#7BA048'][i % 3],
    }));
    return { lean, fronds };
  }, [seed]);
  const geo = frondGeometry();
  return (
    <group>
      <BlobShadow r={2 * k} len={h * 0.4} opacity={0.22} />
      {/* A gently curving trunk, ringed */}
      {Array.from({ length: segs }, (_, i) => {
        const t = (i + 0.5) / segs;
        return (
          <mesh key={i} position={[lean * h * t * t, t * h, 0]} rotation-z={-lean * 2 * t}>
            <cylinderGeometry args={[0.17 - t * 0.05, 0.2 - t * 0.05, h / segs + 0.06, 9]} />
            <meshStandardMaterial color={i % 2 ? '#8A7052' : '#7A6146'} roughness={1} />
          </mesh>
        );
      })}
      <group position={[lean * h, h, 0]} scale={k}>
        <mesh position={[0, -0.1, 0]}>
          <sphereGeometry args={[0.32, 10, 8]} />
          <meshStandardMaterial color="#6B5A3A" roughness={1} />
        </mesh>
        {fronds.map((f, i) => (
          <group key={i} rotation-y={f.a}>
            <mesh geometry={geo} rotation-z={f.tilt} scale={f.s}>
              <meshStandardMaterial color={f.c} roughness={0.85} side={THREE.DoubleSide} vertexColors />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  );
}

// ---------------------------------------------------------------- buildings and shelters
  // Plastered wall with rows of windows, one texture per side length
function useFacade(len: number, h: number, key: string) {
  return useCanvasTexture(512, 256, (ctx) => {
      const rnd = seeded('bld' + key + Math.round(len) + Math.round(h));
      ctx.fillStyle = '#E6E2DA';
      ctx.fillRect(0, 0, 512, 256);
      // Soft weathering streaks under the parapet and dust at the foot
      const top = ctx.createLinearGradient(0, 0, 0, 256);
      top.addColorStop(0, 'rgba(120,110,95,0.18)');
      top.addColorStop(0.12, 'rgba(120,110,95,0)');
      top.addColorStop(0.86, 'rgba(160,140,110,0)');
      top.addColorStop(1, 'rgba(160,140,110,0.4)');
      ctx.fillStyle = top;
      ctx.fillRect(0, 0, 512, 256);
      for (let i = 0; i < 26; i++) {
        ctx.fillStyle = `rgba(110,100,88,${0.03 + rnd() * 0.05})`;
        ctx.fillRect(rnd() * 512, 0, 2 + rnd() * 5, 30 + rnd() * 120);
      }
      const floors = Math.max(1, Math.round(h / 3.2));
      const cols = Math.max(2, Math.round(len / 3.4));
      const cw = 512 / cols;
      const fh = 256 / floors;
      for (let f = 0; f < floors; f++) {
        for (let c = 0; c < cols; c++) {
          const x = c * cw + cw * 0.22;
          const y = f * fh + fh * 0.24;
          const ww = cw * 0.56;
          const wh = fh * 0.42;
          ctx.fillStyle = '#CFC9BE'; // frame
          ctx.fillRect(x - 3, y - 3, ww + 6, wh + 6);
          const g = ctx.createLinearGradient(0, y, 0, y + wh);
          g.addColorStop(0, '#6F8698');
          g.addColorStop(1, '#2F3D49');
          ctx.fillStyle = g;
          ctx.fillRect(x, y, ww, wh);
          ctx.fillStyle = 'rgba(255,255,255,0.14)'; // sky glint
          ctx.fillRect(x, y, ww * 0.45, wh * 0.5);
          ctx.fillStyle = '#B9B3A8'; // sill and its shadow
          ctx.fillRect(x - 5, y + wh + 3, ww + 10, 4);
          ctx.fillStyle = 'rgba(60,52,44,0.22)';
          ctx.fillRect(x - 5, y + wh + 7, ww + 10, 5);
        }
      }
    }, [key, Math.round(len), Math.round(h)]);
}
function Building({ w, d, h, selected }: { w: number; d: number; h: number; selected: boolean }) {
  const wall = selected ? '#fef9c3' : '#ffffff';
  const long = useFacade(d, h, 'l');
  const short = useFacade(w, h, 's');
  const units = useMemo(() => {
    const rnd = seeded('ac' + Math.round(w * 7 + d * 13));
    return Array.from({ length: Math.max(1, Math.min(4, Math.round((w * d) / 60))) }, () => ({
      x: (rnd() - 0.5) * w * 0.6,
      z: (rnd() - 0.5) * d * 0.6,
      r: rnd() > 0.5 ? 0 : Math.PI / 2,
    }));
  }, [w, d]);
  return (
    <group>
      <BlobShadow r={Math.max(w, d) / 2} len={h} opacity={0.22} />
      {/* box faces: +x, -x, +y, -y, +z, -z */}
      <mesh position={[0, h / 2, 0]}>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial attach="material-0" map={long} color={wall} roughness={0.9} />
        <meshStandardMaterial attach="material-1" map={long} color={wall} roughness={0.9} />
        <meshStandardMaterial attach="material-2" color="#BEB9AE" roughness={1} />
        <meshStandardMaterial attach="material-3" color="#BEB9AE" roughness={1} />
        <meshStandardMaterial attach="material-4" map={short} color={wall} roughness={0.9} />
        <meshStandardMaterial attach="material-5" map={short} color={wall} roughness={0.9} />
      </mesh>
      {/* Plinth */}
      <mesh position={[0, 0.2, 0]}>
        <boxGeometry args={[w + 0.16, 0.4, d + 0.16]} />
        <meshStandardMaterial color="#A9A398" roughness={1} />
      </mesh>
      {/* Parapet: four low walls round the roof, so the roof sits recessed */}
      {[
        [0, d / 2, w + 0.3, 0.25],
        [0, -d / 2, w + 0.3, 0.25],
        [w / 2, 0, 0.25, d + 0.3],
        [-w / 2, 0, 0.25, d + 0.3],
      ].map(([x, z, sx, sz], i) => (
        <mesh key={i} position={[x, h + 0.3, z]}>
          <boxGeometry args={[sx, 0.6, sz]} />
          <meshStandardMaterial color="#D6D3CC" roughness={0.9} />
        </mesh>
      ))}
      {/* Roof plant */}
      {units.map((u, i) => (
        <group key={i} position={[u.x, h, u.z]} rotation-y={u.r}>
          <mesh position={[0, 0.45, 0]}>
            <boxGeometry args={[1.6, 0.9, 1]} />
            <meshStandardMaterial color="#C9CCCD" roughness={0.6} metalness={0.3} />
          </mesh>
          <mesh position={[0, 0.91, 0]} rotation-x={-Math.PI / 2}>
            <circleGeometry args={[0.36, 16]} />
            <meshStandardMaterial color="#3E4448" roughness={0.7} />
          </mesh>
        </group>
      ))}
      {/* Door with a small canopy on one long side */}
      <mesh position={[w / 2 + 0.03, 1.1, d * 0.18]} rotation-y={Math.PI / 2}>
        <planeGeometry args={[1.3, 2.2]} />
        <meshStandardMaterial color="#4A4F55" roughness={0.6} metalness={0.2} />
      </mesh>
      <mesh position={[w / 2 + 0.5, 2.45, d * 0.18]}>
        <boxGeometry args={[1, 0.1, 2]} />
        <meshStandardMaterial color="#8E9296" roughness={0.7} />
      </mesh>
    </group>
  );
}
function Cabin({ w, d, h, selected }: { w: number; d: number; h: number; selected: boolean }) {
  return (
    <group>
      <BlobShadow r={w / 2} len={h} opacity={0.2} />
      <mesh position={[0, h / 2, 0]}>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color={selected ? '#fef9c3' : '#F1F1EE'} roughness={0.8} />
      </mesh>
      <mesh position={[0, h + 0.06, 0]}>
        <boxGeometry args={[w + 0.15, 0.12, d + 0.15]} />
        <meshStandardMaterial color="#9CA3AF" />
      </mesh>
      <mesh position={[w * 0.25, h * 0.4, d / 2 + 0.01]}>
        <planeGeometry args={[0.9, h * 0.75]} />
        <meshStandardMaterial color="#6B7280" />
      </mesh>
      <mesh position={[-w * 0.15, h * 0.6, d / 2 + 0.01]}>
        <planeGeometry args={[1.4, 0.8]} />
        <meshStandardMaterial color="#475569" roughness={0.3} />
      </mesh>
    </group>
  );
}

/** Posts + roof. `backWall` adds a white wall along the back (open shelter). */
function RoofOnPosts({ w, d, h, roof, backWall, selected }: { w: number; d: number; h: number; roof: string; backWall?: boolean; selected: boolean }) {
  const nx = Math.max(2, Math.round(w / 5) + 1);
  const nz = Math.max(2, Math.round(d / 5) + 1);
  const posts: [number, number][] = [];
  for (let i = 0; i < nx; i++) for (const z of [-d / 2 + 0.2, d / 2 - 0.2]) posts.push([-w / 2 + 0.2 + ((w - 0.4) * i) / (nx - 1), z]);
  for (let j = 1; j < nz - 1; j++) for (const x of [-w / 2 + 0.2, w / 2 - 0.2]) posts.push([x, -d / 2 + 0.2 + ((d - 0.4) * j) / (nz - 1)]);
  return (
    <group>
      <BlobShadow r={Math.max(w, d) / 2} len={h * 0.8} opacity={0.24} />
      {posts.map(([x, z], i) => (
        <mesh key={i} position={[x, h / 2, z]}>
          <boxGeometry args={[0.12, h, 0.12]} />
          <meshStandardMaterial color="#9CA3AF" metalness={0.4} roughness={0.5} />
        </mesh>
      ))}
      <mesh position={[0, h + 0.08, 0]} rotation-x={0.03}>
        <boxGeometry args={[w + 0.4, 0.16, d + 0.4]} />
        <meshStandardMaterial color={selected ? '#fde68a' : roof} metalness={0.35} roughness={0.55} />
      </mesh>
      {backWall && (
        <mesh position={[0, h / 2, -d / 2 + 0.1]}>
          <boxGeometry args={[w, h, 0.15]} />
          <meshStandardMaterial color="#F3F4F6" roughness={0.8} />
        </mesh>
      )}
    </group>
  );
}

function Gazebo({ w, d, h, color, selected }: { w: number; d: number; h: number; color: string; selected: boolean }) {
  const legs: [number, number][] = [
    [-w / 2 + 0.1, -d / 2 + 0.1],
    [w / 2 - 0.1, -d / 2 + 0.1],
    [-w / 2 + 0.1, d / 2 - 0.1],
    [w / 2 - 0.1, d / 2 - 0.1],
  ];
  return (
    <group>
      <BlobShadow r={w / 2} len={h * 0.6} opacity={0.2} />
      {legs.map(([x, z], i) => (
        <mesh key={i} position={[x, (h - 0.5) / 2, z]}>
          <cylinderGeometry args={[0.04, 0.04, h - 0.5, 6]} />
          <meshStandardMaterial color="#E5E7EB" metalness={0.4} />
        </mesh>
      ))}
      <mesh position={[0, h - 0.25, 0]} rotation-y={Math.PI / 4} scale={[1, 1, d / w]}>
        <coneGeometry args={[(w / 2) * Math.SQRT2, 0.6, 4, 1]} />
        <meshStandardMaterial color={selected ? '#fde047' : color} roughness={0.8} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

// ---------------------------------------------------------------- poles and structures
function Floodlight({ h, small, selected }: { h: number; small?: boolean; selected: boolean }) {
  return (
    <group>
      <mesh position={[0, h / 2, 0]}>
        <cylinderGeometry args={[small ? 0.08 : 0.12, small ? 0.12 : 0.2, h, 8]} />
        <meshStandardMaterial color={selected ? '#fde047' : '#9CA3AF'} metalness={0.5} roughness={0.4} />
      </mesh>
      <mesh position={[0, h + (small ? 0.15 : 0.5), small ? 0.25 : 0]}>
        <boxGeometry args={small ? [0.5, 0.25, 0.6] : [2.2, 1.1, 0.35]} />
        <meshStandardMaterial color="#374151" />
      </mesh>
      <mesh position={[0, h + (small ? 0.03 : 0.5), small ? 0.25 : 0.18]} rotation-x={small ? -Math.PI / 2 : 0}>
        <planeGeometry args={small ? [0.4, 0.5] : [2, 0.9]} />
        <meshStandardMaterial color="#F8FAFC" emissive="#FFF7E0" emissiveIntensity={0.6} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

function Mast({ w, h, selected }: { w: number; h: number; selected: boolean }) {
  const band = 3;
  const n = Math.max(1, Math.round(h / band));
  const half = (y: number) => (w / 2) * (1 - (y / h) * 0.7); // tapers towards the top
  const legs: [number, number][] = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ];
  return (
    <group>
      {Array.from({ length: n }, (_, i) => {
        const y0 = i * band;
        const y1 = Math.min(h, y0 + band);
        const col = selected ? '#fde047' : i % 2 ? '#F8FAFC' : '#DC2626';
        const a = half(y0);
        const b = half(y1);
        const mid = (y0 + y1) / 2;
        const lean = Math.atan2(a - b, y1 - y0);
        return (
          <group key={i}>
            {legs.map(([sx, sz], j) => (
              <mesh key={j} position={[(sx * (a + b)) / 2, mid, (sz * (a + b)) / 2]} rotation={[sz * -lean, 0, sx * lean]}>
                <boxGeometry args={[0.1, y1 - y0, 0.1]} />
                <meshStandardMaterial color={col} />
              </mesh>
            ))}
            {[
              [0, -1, 0],
              [0, 1, 0],
              [-1, 0, Math.PI / 2],
              [1, 0, Math.PI / 2],
            ].map(([sx, sz, rot], j) => (
              <mesh key={`b${j}`} position={[sx * b, y1, sz * b]} rotation-y={rot}>
                <boxGeometry args={[b * 2, 0.06, 0.06]} />
                <meshStandardMaterial color={col} />
              </mesh>
            ))}
          </group>
        );
      })}
      <mesh position={[0, h + 0.4, 0]}>
        <sphereGeometry args={[0.18, 8, 6]} />
        <meshStandardMaterial color="#EF4444" emissive="#EF4444" emissiveIntensity={1} />
      </mesh>
    </group>
  );
}

// ---------------------------------------------------------------- obstacles and props
function Wreck({ w, d, h, selected }: { w: number; d: number; h: number; selected: boolean }) {
  const tankR = Math.min(w * 0.42, h * 0.38);
  return (
    <group>
      <BlobShadow r={d / 2} len={h} opacity={0.26} />
      {/* Trailer bed and wheels */}
      <mesh position={[0, 0.75, 0]}>
        <boxGeometry args={[w * 0.85, 0.25, d]} />
        <meshStandardMaterial color="#2E2A24" roughness={1} />
      </mesh>
      {[-d * 0.32, -d * 0.18, d * 0.3].map((z, i) =>
        [-1, 1].map((s) => (
          <mesh key={`${i}${s}`} position={[s * w * 0.42, 0.45, z]} rotation-z={Math.PI / 2}>
            <cylinderGeometry args={[0.45, 0.45, 0.3, 12]} />
            <meshStandardMaterial color="#111" roughness={1} />
          </mesh>
        ))
      )}
      {/* Tank body, olive with rusty ends */}
      <mesh position={[0, 0.9 + tankR, -d * 0.05]} rotation-x={Math.PI / 2}>
        <cylinderGeometry args={[tankR, tankR, d * 0.8, 16]} />
        <meshStandardMaterial color={selected ? '#fde68a' : '#5C5A3A'} roughness={1} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[0, 0.9 + tankR, -d * 0.05 + s * d * 0.4]} rotation-x={Math.PI / 2}>
          <cylinderGeometry args={[tankR * 1.01, tankR * 1.01, 0.5, 16]} />
          <meshStandardMaterial color="#7A4A2A" roughness={1} />
        </mesh>
      ))}
      {/* Cab stub */}
      <mesh position={[0, 1.4, d * 0.44]}>
        <boxGeometry args={[w * 0.8, 1.3, d * 0.12]} />
        <meshStandardMaterial color="#4A4530" roughness={1} />
      </mesh>
    </group>
  );
}

/** Two dark-metal lattice arches side by side (flyable). */
function DoubleArch({ w, h, color, emissive }: { w: number; h: number; color: string; emissive: number }) {
  const t = 0.12;
  const half = w / 2;
  const rungs = Math.max(3, Math.round(h / 0.9));
  return (
    <group>
      {[-half, 0, half].map((x, i) => (
        <mesh key={i} position={[x, h / 2, 0]}>
          <boxGeometry args={[t, h, t]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={emissive} metalness={0.6} roughness={0.4} />
        </mesh>
      ))}
      <mesh position={[0, h, 0]}>
        <boxGeometry args={[w + t, t, t]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={emissive} metalness={0.6} roughness={0.4} />
      </mesh>
      {/* Lattice rungs up each outer post */}
      {[-half, half].map((x, i) =>
        Array.from({ length: rungs }, (_, j) => (
          <mesh key={`${i}-${j}`} position={[x + (i ? -0.3 : 0.3), (j + 0.5) * (h / rungs), 0]}>
            <boxGeometry args={[0.6, 0.05, 0.05]} />
            <meshStandardMaterial color="#B91C1C" />
          </mesh>
        ))
      )}
    </group>
  );
}

/** Stripped jeep: chassis, wheels, a rusty tub and a roll frame. */
function Jeep({ w, d, selected }: { w: number; d: number; selected: boolean }) {
  const rust = selected ? '#fde68a' : '#6B5B3E';
  return (
    <group>
      <BlobShadow r={d / 2} len={1.5} opacity={0.24} />
      <mesh position={[0, 0.55, 0]}>
        <boxGeometry args={[w * 0.75, 0.15, d]} />
        <meshStandardMaterial color="#2E2A24" roughness={1} />
      </mesh>
      {[-d * 0.33, d * 0.33].map((z) =>
        [-1, 1].map((sx) => (
          <mesh key={`${z}${sx}`} position={[sx * w * 0.45, 0.38, z]} rotation-z={Math.PI / 2}>
            <cylinderGeometry args={[0.38, 0.38, 0.25, 12]} />
            <meshStandardMaterial color="#151515" roughness={1} />
          </mesh>
        ))
      )}
      <mesh position={[0, 0.95, -d * 0.1]}>
        <boxGeometry args={[w * 0.9, 0.65, d * 0.55]} />
        <meshStandardMaterial color={rust} roughness={1} />
      </mesh>
      <mesh position={[0, 0.85, d * 0.33]}>
        <boxGeometry args={[w * 0.8, 0.45, d * 0.3]} />
        <meshStandardMaterial color="#5A4B33" roughness={1} />
      </mesh>
      {/* Roll frame */}
      {[-1, 1].map((sx) => (
        <mesh key={sx} position={[sx * w * 0.4, 1.55, -d * 0.12]}>
          <boxGeometry args={[0.07, 0.9, 0.07]} />
          <meshStandardMaterial color="#3F3A30" />
        </mesh>
      ))}
      <mesh position={[0, 2, -d * 0.12]}>
        <boxGeometry args={[w * 0.8, 0.07, 0.07]} />
        <meshStandardMaterial color="#3F3A30" />
      </mesh>
    </group>
  );
}

/** Loads an item's flag image (data URL) as a texture, re-rendering once it has loaded. */
function useImageTexture(src: string | undefined) {
  const [img, setImg] = useState<HTMLImageElement | null>(() => cachedLogoImage(src));
  useEffect(() => {
    setImg(cachedLogoImage(src, () => setImg(cachedLogoImage(src))));
  }, [src]);
  const tex = useMemo(() => {
    if (!img) return null;
    const t = new THREE.Texture(img);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    t.needsUpdate = true;
    return t;
  }, [img]);
  useEffect(() => () => tex?.dispose(), [tex]);
  return tex;
}

/** Tall pole with a gently waving 2:1 flag showing the item's flag image. */
function FlagPole({ h, src, selected }: { h: number; src?: string; selected: boolean }) {
  const tex = useImageTexture(src);
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(1.8, 0.9, 16, 1);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + 0.9; // 0 at the pole, 1.8 at the free end
      pos.setZ(i, Math.sin(x * 2.6) * 0.08 * (x / 1.8));
    }
    g.computeVertexNormals();
    return g;
  }, []);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <group>
      <mesh position={[0, h / 2, 0]}>
        <cylinderGeometry args={[0.035, 0.05, h, 10]} />
        <meshStandardMaterial color={selected ? '#fde047' : '#E5E7EB'} metalness={0.5} roughness={0.35} />
      </mesh>
      <mesh position={[0, h + 0.05, 0]}>
        <sphereGeometry args={[0.07, 10, 8]} />
        <meshStandardMaterial color="#D4AF37" metalness={0.7} roughness={0.3} />
      </mesh>
      <mesh geometry={geo} position={[0.95, h - 0.55, 0]}>
        <meshStandardMaterial map={tex ?? undefined} color={tex ? '#ffffff' : '#E5E7EB'} side={THREE.DoubleSide} roughness={0.8} />
      </mesh>
    </group>
  );
}

function Tyre({ w }: { w: number }) {
  return (
    <mesh position={[0, 0.2, 0]} rotation-x={Math.PI / 2}>
      <torusGeometry args={[w * 0.36, w * 0.14, 10, 24]} />
      <meshStandardMaterial color="#1F2937" roughness={1} />
    </mesh>
  );
}

function CableDrum({ w, d }: { w: number; d: number }) {
  const r = w / 2;
  return (
    <group position={[0, r, 0]} rotation-z={Math.PI / 2}>
      <mesh>
        <cylinderGeometry args={[r * 0.55, r * 0.55, d * 0.8, 16]} />
        <meshStandardMaterial color="#6B4423" roughness={1} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[0, (s * d) / 2 - s * 0.05, 0]}>
          <cylinderGeometry args={[r, r, 0.1, 20]} />
          <meshStandardMaterial color="#8B5A2B" roughness={1} />
        </mesh>
      ))}
    </group>
  );
}

/** Model for a site piece, or null when the piece isn't one of them. */
export function SiteModel({
  item,
  equip,
  w,
  d,
  h: hSize,
  selected,
  color,
  emissive,
}: {
  item: PlacedItem;
  equip: EquipmentDef;
  w: number;
  d: number;
  /** This copy's height (resized), else the piece's own */
  h?: number;
  selected: boolean;
  color: string;
  emissive: number;
}): React.ReactElement | null {
  const h = hSize ?? equip.tierHeight ?? 2;
  switch (equip.visualType) {
    case 'turf_pitch':
      return <TurfPitch w={w} d={d} h={h} selected={selected} />;
    case 'sand_pit':
      return <SandPit w={w} d={d} h={h} selected={selected} />;
    case 'asphalt':
      return <FlatSurface w={w} d={d} kind="asphalt" selected={selected} id={item.id} />;
    case 'gravel_road':
      return <FlatSurface w={w} d={d} kind="gravel" selected={selected} id={item.id} />;
    case 'dirt_lane':
      return <FlatSurface w={w} d={d} kind="dirt" selected={selected} id={item.id} />;
    case 'dirt_area':
      return <FlatSurface w={w} d={d} kind="area" selected={selected} id={item.id} />;
    case 'dirt_curve':
      return <DirtCurve w={w} r={d} selected={selected} />;
    case 'scrub_patch':
      return <ScrubPatch w={w} d={d} id={item.id} />;
    case 'grass':
      return <Grass w={w} d={d} id={item.id} selected={selected} />;
    case 'berm':
      return <Berm w={w} d={d} h={h} selected={selected} />;
    case 'tree_big':
      return <Tree w={w} h={h} big seed={item.id} />;
    case 'tree_small':
      return <Tree w={w} h={h} big={false} seed={item.id} />;
    case 'palm':
      return <Palm w={w} h={h} seed={item.id} />;
    case 'building':
      return <Building w={w} d={d} h={h} selected={selected} />;
    case 'cabin':
      return <Cabin w={w} d={d} h={h} selected={selected} />;
    case 'shade_shed':
      return <RoofOnPosts w={w} d={d} h={h} roof={equip.color} selected={selected} />;
    case 'open_shelter':
      return <RoofOnPosts w={w} d={d} h={h} roof={equip.color} backWall selected={selected} />;
    case 'gazebo':
      return <Gazebo w={w} d={d} h={h} color={equip.color} selected={selected} />;
    case 'floodlight':
      return <Floodlight h={h} selected={selected} />;
    case 'light_pole':
      return <Floodlight h={h} small selected={selected} />;
    case 'mast':
      return <Mast w={w} h={h} selected={selected} />;
    case 'wreck':
      return <Wreck w={w} d={d} h={h} selected={selected} />;
    case 'double_arch':
      return <DoubleArch w={w} h={h} color={item.led ?? color} emissive={item.led ? 1.6 : emissive} />;
    case 'tyre':
      return <Tyre w={w} />;
    case 'cable_drum':
      return <CableDrum w={w} d={d} />;
    case 'jeep':
      return <Jeep w={w} d={d} selected={selected} />;
    case 'flagpole':
      return <FlagPole h={h} src={item.logos?.flag} selected={selected} />;
    default:
      return null;
  }
}

// ---------------------------------------------------------------- Desert look: ground and world
/** The Desert look's ground is one continuous desert (see DesertWorld), so the field itself adds nothing. */
export function DesertField(_props: { groundName: GroundMarkSource; fc: FieldColors }) {
  return null;
}

/** The desert, under and around the field: sand to the horizon, scattered scrub and a far tree line. */
export function DesertWorld({ scale = 1 }: { scale?: number }) {
  const far = Math.max(FIELD_WIDTH_M, FIELD_HEIGHT_M);
  const R = far * 4 * scale;
  // Colour varies over 60 m patches and the bumps repeat every 7 m: two scales, so no visible tiling
  const sand = useCanvasTexture(1024, 1024, (ctx) => paintGround(ctx, '#AC976F', '#B9A47E', '#C6B38D', 11, 0.03), [], [(R * 2) / 95, (R * 2) / 95]);
  const bump = useBump((R * 2) / 7, (R * 2) / 7);
  const scrub = useMemo(() => {
    const rnd = seeded('outer-scrub');
    const n = 1100;
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.95, vertexColors: true });
    const m = new THREE.InstancedMesh(bushGeometry(), mat, n);
    const o = new THREE.Object3D();
    const col = new THREE.Color();
    let k = 0;
    while (k < n) {
      const x = (rnd() - 0.5) * far * 3.4;
      const z = (rnd() - 0.5) * far * 3.4;
      // Keep the field itself clear (its own scrub is placed as items)
      if (Math.abs(x) < FIELD_WIDTH_M / 2 + 4 && Math.abs(z) < FIELD_HEIGHT_M / 2 + 4) continue;
      const s = 0.5 + rnd() * 1.2;
      o.position.set(x, 0, z);
      o.rotation.y = rnd() * Math.PI * 2;
      o.scale.set(s, s * (0.55 + rnd() * 0.35), s);
      o.updateMatrix();
      m.setMatrixAt(k, o.matrix);
      m.setColorAt(k, col.set(BUSH_COLORS[Math.floor(rnd() * BUSH_COLORS.length)]).multiplyScalar(1.5));
      k++;
    }
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.raycast = noRaycast;
    return m;
  }, [far]);
  // Far tree line and low white buildings on the horizon
  const horizon = useMemo(() => {
    const rnd = seeded('horizon');
    const Rh = far * 2.4;
    const trees: { x: number; z: number; s: number; g: number }[] = [];
    for (let i = 0; i < 180; i++) {
      const a = rnd() * Math.PI * 2;
      const r = Rh * (0.95 + rnd() * 0.2);
      trees.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, s: 4 + rnd() * 7, g: i % 3 });
    }
    const blds: { x: number; z: number; w: number; h: number; d: number; a: number }[] = [];
    for (let i = 0; i < 14; i++) {
      const a = rnd() * Math.PI * 2;
      const r = Rh * (0.85 + rnd() * 0.1);
      blds.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, w: 12 + rnd() * 30, h: 4 + rnd() * 6, d: 10 + rnd() * 20, a });
    }
    return { trees, blds };
  }, [far]);
  useEffect(() => () => (scrub.material as THREE.Material).dispose(), [scrub]);
  const geos = foliageGeos();
  return (
    <group userData={{ noExport: true }}>
      <color attach="background" args={[DESERT.scene.sky]} />
      <mesh rotation-x={-Math.PI / 2} raycast={noRaycast}>
        <circleGeometry args={[R, 64]} />
        <meshStandardMaterial map={sand} roughness={1} normalMap={bump} normalScale={BUMP} onBeforeCompile={detileGround} />
      </mesh>
      <primitive object={scrub} />
      {horizon.trees.map((t, i) => (
        <mesh key={i} geometry={geos[t.g]} position={[t.x, t.s * 0.7, t.z]} scale={[t.s, t.s * 0.75, t.s]} raycast={noRaycast}>
          <meshStandardMaterial color="#56703A" roughness={1} vertexColors />
        </mesh>
      ))}
      {horizon.blds.map((b, i) => (
        <mesh key={`b${i}`} position={[b.x, b.h / 2, b.z]} rotation-y={b.a} raycast={noRaycast}>
          <boxGeometry args={[b.w, b.h, b.d]} />
          <meshStandardMaterial color="#E4E1DA" roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

// ---------------------------------------------------------------- LED lights on environment assets
const ledMat = (color: string) => <meshStandardMaterial color="#000000" emissive={color} emissiveIntensity={1.15 * glowBoost()} toneMapped={false} />;
const haloMat = (color: string) => (
  <meshBasicMaterial color={color} transparent opacity={graphicsQuality() === 'low' ? 0.3 : 0} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
);

/** A neon strip round a w x d rectangle at height y (with a soft halo). */
function NeonLoop({ w, d, y, color }: { w: number; d: number; y: number; color: string }) {
  const t = 0.07;
  const sides: { p: [number, number, number]; s: [number, number, number] }[] = [
    { p: [0, y, -d / 2], s: [w + t, t, t] },
    { p: [0, y, d / 2], s: [w + t, t, t] },
    { p: [-w / 2, y, 0], s: [t, t, d + t] },
    { p: [w / 2, y, 0], s: [t, t, d + t] },
  ];
  return (
    <group userData={{ noExport: true }}>
      {sides.map((b, i) => (
        <group key={i} position={b.p}>
          <mesh raycast={noRaycast}>
            <boxGeometry args={b.s} />
            {ledMat(color)}
          </mesh>
          <mesh raycast={noRaycast}>
            <boxGeometry args={[b.s[0] + 0.14, b.s[1] + 0.14, b.s[2] + 0.14]} />
            {haloMat(color)}
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** Fairy lights scattered through a tree crown. */
function FairyLights({ w, h, color, seed }: { w: number; h: number; color: string; seed: string }) {
  const mesh = useMemo(() => {
    const rnd = seeded('lights' + seed);
    const n = Math.min(220, Math.max(24, Math.round(w * w * 1.2)));
    const m = new THREE.InstancedMesh(new THREE.SphereGeometry(0.07 + w * 0.004, 6, 4), new THREE.MeshBasicMaterial({ color, toneMapped: false }), n);
    const o = new THREE.Object3D();
    const cy = h * 0.62;
    for (let i = 0; i < n; i++) {
      // On the outside of the crown, so the lights show
      const a = rnd() * Math.PI * 2;
      const v = rnd() * 2 - 1;
      const r = Math.sqrt(1 - v * v);
      const k = 0.85 + rnd() * 0.2;
      o.position.set(Math.cos(a) * r * (w / 2) * k, cy + v * h * 0.3 * k, Math.sin(a) * r * (w / 2) * k);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
    m.raycast = noRaycast;
    return m;
  }, [w, h, color, seed]);
  useEffect(() => () => {
    mesh.geometry.dispose();
    (mesh.material as THREE.Material).dispose();
  }, [mesh]);
  return <primitive object={mesh} userData={{ noExport: true }} />;
}

/** A neon tube up a pole. */
function PoleTube({ h, color }: { h: number; color: string }) {
  return (
    <group position={[0.1, h / 2, 0]} userData={{ noExport: true }}>
      <mesh raycast={noRaycast}>
        <cylinderGeometry args={[0.04, 0.04, h, 8]} />
        {ledMat(color)}
      </mesh>
      <mesh raycast={noRaycast}>
        <cylinderGeometry args={[0.13, 0.13, h, 8]} />
        {haloMat(color)}
      </mesh>
    </group>
  );
}

/** Neon edge along both sides of a quarter-circle track piece. */
function CurveEdges({ w, r, color }: { w: number; r: number; color: string }) {
  return (
    <group rotation-x={-Math.PI / 2} position-y={0.25} userData={{ noExport: true }}>
      {[r - w / 2, r + w / 2].map((rad, i) => (
        <mesh key={i} raycast={noRaycast}>
          <torusGeometry args={[Math.max(0.2, rad), 0.05, 6, 32, Math.PI / 2]} />
          {ledMat(color)}
        </mesh>
      ))}
    </group>
  );
}

/**
 * LED lights for a piece that has no light-up frame of its own: a strip round the roof or the fence,
 * an edge at ground level, fairy lights in a tree, or a tube up a pole.
 */
export function LedOverlay({ item, equip, w, d, h, color }: { item: PlacedItem; equip: EquipmentDef; w: number; d: number; h: number; color: string }) {
  switch (equip.visualType) {
    case 'building':
    case 'cabin':
      return <NeonLoop w={w + 0.25} d={d + 0.25} y={h + 0.35} color={color} />;
    case 'shade_shed':
    case 'open_shelter':
      return <NeonLoop w={w + 0.45} d={d + 0.45} y={h + 0.12} color={color} />;
    case 'gazebo':
    case 'pilot_pit':
      return <NeonLoop w={w} d={d} y={h - 0.55} color={color} />;
    case 'turf_pitch':
      return <NeonLoop w={w} d={d} y={h} color={color} />;
    case 'sand_pit':
      return <NeonLoop w={w} d={d} y={0.4 + h} color={color} />;
    case 'tree_big':
    case 'tree_small':
      return <FairyLights w={w} h={h} color={color} seed={item.id} />;
    case 'palm':
      return (
        <group position={[0, h * 0.62, 0]}>
          <FairyLights w={w * 0.9} h={h * 0.6} color={color} seed={item.id} />
        </group>
      );
    case 'floodlight':
    case 'light_pole':
    case 'flagpole':
    case 'mast':
      return <PoleTube h={h} color={color} />;
    case 'dirt_curve':
      return <CurveEdges w={w} r={d} color={color} />;
    case 'wreck':
    case 'jeep':
    case 'tyre':
    case 'cable_drum':
      return <NeonLoop w={w + 0.3} d={d + 0.3} y={Math.min(1.2, h * 0.45)} color={color} />;
    case 'container':
    case 'double_arch':
      return null; // their frames light up themselves
    default:
      // Flat ground pieces, grass, scrub, berms: an edge just above the ground
      return <NeonLoop w={w} d={d} y={0.25} color={color} />;
  }
}
