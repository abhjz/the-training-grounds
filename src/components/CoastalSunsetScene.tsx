// Coastal Sunset look, 3D: a tropical waterfront at golden hour. The field is a tarmac pad on
// pilings in turquoise water with a neon rim; behind it lie a beach, a palm-lined ocean drive with
// cruising cars and street lamps, pastel art deco hotels with neon signs, and glass towers under a
// vivid sunset sky. Speedboats, a helicopter and birds keep it moving. Only the field pad is
// exported with the track; the rest is decoration that ignores clicks.

import { useFrame } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import React, { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { FIELD_HEIGHT_M, FIELD_WIDTH_M, PERIMETER_FENCE_M } from '../constants/equipment';
import { FieldColors } from '../theme/engine';
import { drawWatermarkText, GroundMarkSource, hasGroundMark } from '../utils/watermark';
import { useSceneryMotion } from '../hooks/useSceneryMotion';
import { COASTAL_SUNSET } from '../theme/coastalSunset';
import { useMediaMatch } from '../hooks/useMediaMatch';

const noPick = () => {};
const { scene, motion } = COASTAL_SUNSET;

/** Direction of the low sun (left, behind the city, just above the sea horizon). */
export const SUN_DIR = new THREE.Vector3(-0.55, 0.09, -0.83).normalize();

const WATER_Y = -0.9;
const SHORE_Z = -50; // water's edge behind the field
const BEACH_X0 = -75; // beach starts here; open sea to the left of it

const rand = (n: number) => {
  const x = Math.sin(n * 78.233 + 12.9898) * 43758.5453;
  return x - Math.floor(x);
};
const pick = <T,>(arr: readonly T[], n: number) => arr[Math.floor(rand(n) * arr.length) % arr.length];

/** Decoration never takes clicks, so clicking empty space still deselects. */
function NoPick({ children }: { children: React.ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  useLayoutEffect(() => {
    ref.current?.traverse((o) => {
      (o as THREE.Mesh).raycast = noPick;
    });
  });
  return <group ref={ref}>{children}</group>;
}

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!] as const;
}
function texture(c: HTMLCanvasElement, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// ---------------------------------------------------------------- the field pad (exported)
function useSurface(name: GroundMarkSource) {
  return useMemo(() => {
    const [c, ctx] = canvas(1024, 768);
    const g = ctx.createLinearGradient(0, 0, 1024, 768);
    g.addColorStop(0, scene.tarmac[0]);
    g.addColorStop(0.52, scene.tarmac[1]);
    g.addColorStop(1, scene.tarmac[2]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 1024, 768);
    // Tarmac grain and long seams, subtle enough to keep gates legible.
    for (let i = 0; i < 1900; i++) {
      const x = (i * 379.7) % 1024;
      const y = (i * 211.3) % 768;
      ctx.fillStyle = i % 3 ? 'rgba(255,204,193,.055)' : 'rgba(13,10,30,.10)';
      ctx.fillRect(x, y, 1 + (i % 3), 1);
    }
    // Warm sunset sheen across the pad
    const sheen = ctx.createLinearGradient(0, 0, 1024, 0);
    sheen.addColorStop(0, 'rgba(255,150,110,.16)');
    sheen.addColorStop(0.6, 'rgba(255,120,170,.04)');
    sheen.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sheen;
    ctx.fillRect(0, 0, 1024, 768);
    ctx.strokeStyle = 'rgba(255,202,169,.16)';
    ctx.lineWidth = 2;
    for (let x = 0; x < 1024; x += 180) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + 60, 768);
      ctx.stroke();
    }
    if (hasGroundMark(name)) drawWatermarkText(ctx, name, 1024, 768, 'rgba(255,225,218,.12)');
    const tex = texture(c);
    tex.anisotropy = 8;
    return tex;
  }, [name]);
}

export function CoastalField({ groundName, fc }: { groundName: GroundMarkSource; fc: FieldColors }) {
  const map = useSurface(groundName);
  useEffect(() => () => map.dispose(), [map]);
  const w = FIELD_WIDTH_M;
  const h = FIELD_HEIGHT_M;
  const f = PERIMETER_FENCE_M;
  const grid = useMemo(() => {
    const p: number[] = [];
    for (let x = 0; x <= w; x += 5) p.push(x - w / 2, 0.035, -h / 2, x - w / 2, 0.035, h / 2);
    for (let z = 0; z <= h; z += 5) p.push(-w / 2, 0.035, z - h / 2, w / 2, 0.035, z - h / 2);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    return g;
  }, [w, h]);
  const fence: [number, number, number][] = [
    [-w / 2 + f, 0.07, -h / 2 + f],
    [w / 2 - f, 0.07, -h / 2 + f],
    [w / 2 - f, 0.07, h / 2 - f],
    [-w / 2 + f, 0.07, h / 2 - f],
    [-w / 2 + f, 0.07, -h / 2 + f],
  ];
  const pilings = useMemo(() => {
    const out: [number, number][] = [];
    for (let x = -w / 2 + 2; x <= w / 2 - 2; x += 6) out.push([x, -h / 2 + 1], [x, h / 2 - 1]);
    for (let z = -h / 2 + 7; z <= h / 2 - 7; z += 6) out.push([-w / 2 + 1, z], [w / 2 - 1, z]);
    return out;
  }, [w, h]);
  return (
    <group name="Field" userData={{ export: true }}>
      <mesh position-y={-0.32}>
        <boxGeometry args={[w, 0.64, h]} />
        <meshStandardMaterial color="#182944" roughness={0.85} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={0.012}>
        <planeGeometry args={[w, h]} />
        <meshStandardMaterial map={map} roughness={0.94} />
      </mesh>
      <lineSegments geometry={grid}>
        <lineBasicMaterial color={fc.grid3d} transparent opacity={0.55} />
      </lineSegments>
      <Line points={fence} color={fc.fence ?? '#ffb566'} lineWidth={2.5} dashed dashSize={0.8} gapSize={0.45} />
      <Line points={[[-w / 2, 0.04, -h / 2], [w / 2, 0.04, -h / 2], [w / 2, 0.04, h / 2], [-w / 2, 0.04, h / 2], [-w / 2, 0.04, -h / 2]]} color={fc.border} lineWidth={2} />
      {/* Neon rim and pilings: decoration, not part of the exported model */}
      <group userData={{ noExport: true }}>
        <NoPick>
          {[
            { pos: [0, -0.2, -h / 2 - 0.06], size: [w + 0.24, 0.12, 0.12] },
            { pos: [0, -0.2, h / 2 + 0.06], size: [w + 0.24, 0.12, 0.12] },
            { pos: [-w / 2 - 0.06, -0.2, 0], size: [0.12, 0.12, h] },
            { pos: [w / 2 + 0.06, -0.2, 0], size: [0.12, 0.12, h] },
          ].map((s, i) => (
            <mesh key={i} position={s.pos as [number, number, number]}>
              <boxGeometry args={s.size as [number, number, number]} />
              <meshBasicMaterial color={scene.neon[0]} toneMapped={false} />
            </mesh>
          ))}
          {pilings.map(([x, z], i) => (
            <mesh key={i} position={[x, -1.4, z]}>
              <cylinderGeometry args={[0.28, 0.32, 2.2, 8]} />
              <meshStandardMaterial color="#3A3346" roughness={0.9} />
            </mesh>
          ))}
        </NoPick>
      </group>
    </group>
  );
}

// ---------------------------------------------------------------- sky
const SKY_FRAG = /* glsl */ `
  uniform vec3 uSun;
  uniform float uTime;
  varying vec3 vDir;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
    return v;
  }
  void main() {
    vec3 d = normalize(vDir);
    float h = max(d.y, -0.05);
    float s = max(dot(d, normalize(uSun)), 0.0);
    // Golden horizon → coral → hot pink → violet → deep blue overhead
    vec3 horizon = mix(vec3(0.94, 0.63, 0.54), vec3(1.0, 0.80, 0.47), pow(s, 3.0));
    vec3 c = mix(horizon, vec3(1.0, 0.56, 0.40), smoothstep(0.0, 0.06, h));
    c = mix(c, vec3(0.95, 0.38, 0.55), smoothstep(0.04, 0.15, h));
    c = mix(c, vec3(0.52, 0.30, 0.62), smoothstep(0.13, 0.34, h));
    c = mix(c, vec3(0.13, 0.15, 0.40), smoothstep(0.32, 0.8, h));
    // Warmer and brighter toward the sun
    c += vec3(1.0, 0.55, 0.25) * pow(s, 6.0) * 0.45 + vec3(1.0, 0.82, 0.55) * pow(s, 48.0) * 0.55;
    // Long stratus clouds, lit pink and gold from below
    if (d.y > 0.0) {
      vec2 uv = d.xz / (d.y + 0.1) * 1.4 + vec2(uTime * 0.006, 0.0);
      float n = fbm(uv * vec2(0.55, 2.4));
      float band = smoothstep(0.0, 0.05, d.y) * (1.0 - smoothstep(0.3, 0.55, d.y));
      float cl = smoothstep(0.52, 0.78, n) * band;
      vec3 lit = mix(vec3(0.96, 0.42, 0.56), vec3(1.0, 0.80, 0.52), pow(s, 3.0));
      vec3 shade = vec3(0.36, 0.22, 0.42);
      c = mix(c, mix(shade, lit, smoothstep(0.5, 0.9, n)), cl * 0.8);
    }
    // Sun disc
    c = mix(c, vec3(1.0, 0.95, 0.78), smoothstep(0.99935, 0.99965, s));
    gl_FragColor = vec4(c, 1.0);
  }
`;

function Sky({ animate }: { animate: boolean }) {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: { uSun: { value: SUN_DIR.clone() }, uTime: { value: 0 } },
        vertexShader: `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: SKY_FRAG,
      }),
    []
  );
  useEffect(() => () => mat.dispose(), [mat]);
  useFrame((_, dt) => {
    if (animate) mat.uniforms.uTime.value += dt;
  });
  return (
    <mesh material={mat} renderOrder={-1}>
      <sphereGeometry args={[400, 48, 24]} />
    </mesh>
  );
}

// ---------------------------------------------------------------- water
const WATER_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uScale;
  uniform vec3 uSun;
  uniform vec3 uFog;
  uniform vec2 uFogRange;
  varying vec3 vWorld;
  vec2 waveGrad(vec2 p, float t) {
    vec2 g = vec2(0.0);
    vec2 k;
    k = vec2(0.09, 0.04);  g += 0.20 * k * cos(dot(k, p) + t * 0.8);
    k = vec2(-0.05, 0.11); g += 0.18 * k * cos(dot(k, p) + t * 1.0);
    k = vec2(0.27, -0.19); g += 0.14 * k * cos(dot(k, p) + t * 1.7);
    k = vec2(-0.41, 0.33); g += 0.10 * k * cos(dot(k, p) + t * 2.3);
    k = vec2(0.63, 0.52);  g += 0.07 * k * cos(dot(k, p) + t * 2.9);
    k = vec2(-0.95, 0.21); g += 0.05 * k * cos(dot(k, p) + t * 3.6);
    k = vec2(1.31, -0.77); g += 0.035 * k * cos(dot(k, p) + t * 4.4);
    k = vec2(-1.7, -1.3);  g += 0.025 * k * cos(dot(k, p) + t * 5.3);
    k = vec2(2.4, 1.1);    g += 0.016 * k * cos(dot(k, p) + t * 6.1);
    return g;
  }
  void main() {
    vec2 p = vWorld.xz / uScale;
    vec2 g = waveGrad(p, uTime);
    vec3 N = normalize(vec3(-g.x, 1.0, -g.y));
    vec3 V = normalize(cameraPosition - vWorld);
    float fres = pow(1.0 - max(dot(N, V), 0.0), 4.0);
    // Turquoise shallows near the pad and the beach, deeper blue out at sea
    float dist = length(p);
    vec3 shallow = vec3(0.20, 0.72, 0.72);
    vec3 deep = vec3(0.09, 0.34, 0.52);
    vec3 base = mix(shallow, deep, smoothstep(45.0, 230.0, dist));
    float nearShore = smoothstep(-28.0, -48.0, p.y) * step(-70.0, p.x);
    base = mix(base, vec3(0.42, 0.86, 0.80), nearShore * 0.55);
    // Sky reflection at grazing angles
    vec3 skyRefl = mix(vec3(1.0, 0.62, 0.52), vec3(0.62, 0.40, 0.66), clamp(N.x * 2.0 + 0.5, 0.0, 1.0));
    vec3 col = mix(base, skyRefl, clamp(fres, 0.0, 0.85));
    // Sun glitter path
    vec3 R = reflect(-V, N);
    float sp = max(dot(R, normalize(uSun)), 0.0);
    col += vec3(1.0, 0.74, 0.42) * (pow(sp, 90.0) * 0.8 + pow(sp, 900.0) * 3.5);
    // Foam where the water meets the beach
    float shore = smoothstep(3.0, 0.0, abs(p.y - (${SHORE_Z.toFixed(1)} + 0.6 * sin(p.x * 0.15 + uTime)))) * step(${BEACH_X0.toFixed(1)}, p.x);
    col = mix(col, vec3(1.0, 0.96, 0.92), shore * (0.45 + 0.25 * sin(p.x * 0.8 - uTime * 2.0)));
    float fog = smoothstep(uFogRange.x, uFogRange.y, length(cameraPosition - vWorld));
    col = mix(col, uFog, fog);
    gl_FragColor = vec4(col, 1.0);
  }
`;

function Water({ animate, scale, fogNear, fogFar }: { animate: boolean; scale: number; fogNear: number; fogFar: number }) {
  const mat = useMemo(() => {
    const fog = new THREE.Color(scene.fog);
    return new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uScale: { value: scale },
        uSun: { value: SUN_DIR.clone() },
        // Display-space fog colour: this shader writes straight to the screen
        uFog: { value: (() => { const o = { r: 0, g: 0, b: 0 }; fog.getRGB(o, THREE.SRGBColorSpace); return new THREE.Vector3(o.r, o.g, o.b); })() },
        uFogRange: { value: new THREE.Vector2(fogNear, fogFar) },
      },
      vertexShader: `varying vec3 vWorld; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: WATER_FRAG,
    });
  }, [scale, fogNear, fogFar]);
  useEffect(() => () => mat.dispose(), [mat]);
  useFrame((_, dt) => {
    if (animate) mat.uniforms.uTime.value += dt;
  });
  return (
    <mesh rotation-x={-Math.PI / 2} position-y={WATER_Y} material={mat}>
      <planeGeometry args={[780, 780]} />
    </mesh>
  );
}

// ---------------------------------------------------------------- shore: beach, road, lamps
function Shore({ animate }: { animate: boolean }) {
  const roadTex = useMemo(() => {
    const [c, ctx] = canvas(512, 64);
    ctx.fillStyle = '#2A2B3B';
    ctx.fillRect(0, 0, 512, 64);
    ctx.fillStyle = '#F4C26B';
    for (let x = 0; x < 512; x += 64) ctx.fillRect(x, 30, 34, 3);
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    ctx.fillRect(0, 3, 512, 2);
    ctx.fillRect(0, 59, 512, 2);
    const t = texture(c);
    t.wrapS = THREE.RepeatWrapping;
    t.repeat.set(24, 1);
    return t;
  }, []);
  const sandTex = useMemo(() => {
    const [c, ctx] = canvas(256, 64);
    const g = ctx.createLinearGradient(0, 64, 0, 0);
    g.addColorStop(0, '#D9B48C'); // wet sand at the water
    g.addColorStop(0.3, '#F2CFA2');
    g.addColorStop(1, '#F7DDB6');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 64);
    for (let i = 0; i < 500; i++) {
      ctx.fillStyle = `rgba(150,100,70,${0.08 + rand(i) * 0.08})`;
      ctx.fillRect(rand(i + 1) * 256, rand(i + 2) * 64, 1, 1);
    }
    const t = texture(c);
    t.wrapS = THREE.RepeatWrapping;
    t.repeat.set(12, 1);
    return t;
  }, []);
  const glow = useGlowTexture();
  useEffect(() => () => { roadTex.dispose(); sandTex.dispose(); }, [roadTex, sandTex]);
  const beachW = 360;
  const cx = BEACH_X0 + beachW / 2;
  const lamps = useMemo(() => Array.from({ length: 22 }, (_, i) => BEACH_X0 + 6 + i * 16), []);
  const umbrellas = useMemo(
    () => Array.from({ length: 14 }, (_, i) => ({ x: BEACH_X0 + 10 + i * 13 + rand(i + 40) * 6, z: SHORE_Z - 4 - rand(i + 50) * 4, c: pick(scene.deco, i + 60) })),
    []
  );
  return (
    <group>
      {/* Beach */}
      <mesh position={[cx, -0.7, SHORE_Z - 6]}>
        <boxGeometry args={[beachW, 0.5, 12]} />
        <meshStandardMaterial attach="material-0" color="#E9C79C" />
        <meshStandardMaterial attach="material-1" color="#E9C79C" />
        <meshStandardMaterial attach="material-2" map={sandTex} roughness={1} />
        <meshStandardMaterial attach="material-3" color="#D9B48C" />
        <meshStandardMaterial attach="material-4" color="#D9B48C" />
        <meshStandardMaterial attach="material-5" color="#D9B48C" />
      </mesh>
      {umbrellas.map((u, i) => (
        <group key={i} position={[u.x, -0.45, u.z]}>
          <mesh position-y={1.1}>
            <cylinderGeometry args={[0.04, 0.04, 2.2, 6]} />
            <meshStandardMaterial color="#EEE6DA" />
          </mesh>
          <mesh position-y={2.2}>
            <coneGeometry args={[1.6, 0.6, 10, 1, true]} />
            <meshStandardMaterial color={u.c} side={THREE.DoubleSide} roughness={0.7} />
          </mesh>
          <mesh position={[0.9, 0.08, 0.6]} rotation-y={0.4}>
            <boxGeometry args={[1.8, 0.12, 0.7]} />
            <meshStandardMaterial color={i % 2 ? '#3FC7C0' : '#FF8FB3'} />
          </mesh>
        </group>
      ))}
      {/* Sidewalk and ocean drive */}
      <mesh position={[cx, -0.38, SHORE_Z - 13.5]}>
        <boxGeometry args={[beachW, 0.4, 3]} />
        <meshStandardMaterial color="#E7D8CC" roughness={0.9} />
      </mesh>
      <mesh position={[cx, -0.4, SHORE_Z - 18.5]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[beachW, 7]} />
        <meshStandardMaterial map={roadTex} roughness={0.8} />
      </mesh>
      <mesh position={[cx, -0.38, SHORE_Z - 23.5]}>
        <boxGeometry args={[beachW, 0.4, 3]} />
        <meshStandardMaterial color="#E7D8CC" roughness={0.9} />
      </mesh>
      {/* Street lamps */}
      {lamps.map((x, i) => (
        <group key={i} position={[x, -0.2, SHORE_Z - 15]}>
          <mesh position-y={2.6}>
            <cylinderGeometry args={[0.06, 0.09, 5.2, 6]} />
            <meshStandardMaterial color="#3A3550" />
          </mesh>
          <mesh position={[0, 5.2, -0.7]}>
            <boxGeometry args={[0.1, 0.1, 1.5]} />
            <meshStandardMaterial color="#3A3550" />
          </mesh>
          <mesh position={[0, 5.05, -1.35]}>
            <sphereGeometry args={[0.18, 8, 6]} />
            <meshBasicMaterial color="#FFE2A8" toneMapped={false} />
          </mesh>
          <sprite position={[0, 5.05, -1.35]} scale={[2.6, 2.6, 1]}>
            <spriteMaterial map={glow} color="#FFC47A" transparent opacity={0.8} depthWrite={false} blending={THREE.AdditiveBlending} />
          </sprite>
        </group>
      ))}
      <Cars animate={animate} />
    </group>
  );
}

/** Soft round glow used by lamps, lights and the sun halo. */
let glowTex: THREE.Texture | null = null;
function useGlowTexture() {
  return useMemo(() => {
    if (glowTex) return glowTex;
    const [c, ctx] = canvas(64, 64);
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,255,255,.45)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    glowTex = texture(c);
    return glowTex;
  }, []);
}

// ---------------------------------------------------------------- cars on the ocean drive
function Car({ color }: { color: string }) {
  return (
    <group>
      <mesh position-y={0.42}>
        <boxGeometry args={[4.3, 0.55, 1.85]} />
        <meshStandardMaterial color={color} metalness={0.55} roughness={0.28} />
      </mesh>
      <mesh position={[-0.3, 0.88, 0]}>
        <boxGeometry args={[2.0, 0.5, 1.6]} />
        <meshStandardMaterial color="#1B2238" metalness={0.6} roughness={0.15} />
      </mesh>
      {[-1.4, 1.4].map((x) =>
        [-0.85, 0.85].map((z) => (
          <mesh key={`${x}${z}`} position={[x, 0.22, z]} rotation-x={Math.PI / 2}>
            <cylinderGeometry args={[0.32, 0.32, 0.2, 10]} />
            <meshStandardMaterial color="#141418" />
          </mesh>
        ))
      )}
      {[-0.6, 0.6].map((z) => (
        <React.Fragment key={z}>
          <mesh position={[2.16, 0.45, z]}>
            <boxGeometry args={[0.05, 0.14, 0.34]} />
            <meshBasicMaterial color="#FFF6DC" toneMapped={false} />
          </mesh>
          <mesh position={[-2.16, 0.48, z]}>
            <boxGeometry args={[0.05, 0.12, 0.4]} />
            <meshBasicMaterial color="#FF2A4A" toneMapped={false} />
          </mesh>
        </React.Fragment>
      ))}
    </group>
  );
}

function Cars({ animate }: { animate: boolean }) {
  const CAR_COLORS = ['#FF4F9A', '#F4F1EA', '#2EC4C6', '#FFC93C', '#B04BFF', '#E8433F', '#1F2A44', '#7CF0D8'];
  const cars = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => ({
        lane: i % 2 === 0 ? 1 : -1,
        offset: rand(i + 100) * 300,
        speed: 9 + rand(i + 110) * 7,
        color: CAR_COLORS[i % CAR_COLORS.length],
      })),
    []
  );
  const refs = useRef<(THREE.Group | null)[]>([]);
  const span = 320;
  const place = (t: number) => {
    cars.forEach((c, i) => {
      const g = refs.current[i];
      if (!g) return;
      const d = (c.offset + t * c.speed) % span;
      g.position.x = c.lane === 1 ? BEACH_X0 + d : BEACH_X0 + span - d;
    });
  };
  useFrame(({ clock }) => {
    if (animate) place(clock.elapsedTime);
  });
  useLayoutEffect(() => place(0));
  return (
    <group>
      {cars.map((c, i) => (
        <group
          key={i}
          ref={(g) => {
            refs.current[i] = g;
          }}
          position={[0, -0.4, SHORE_Z - (c.lane === 1 ? 16.9 : 20.1)]}
          rotation-y={c.lane === 1 ? 0 : Math.PI}
        >
          <Car color={c.color} />
        </group>
      ))}
    </group>
  );
}

// ---------------------------------------------------------------- palms
const palmFrond = (() => {
  const vertices: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    const width = Math.sin(Math.PI * t) * (1.15 - 0.45 * t) * (i % 2 ? 0.86 : 1);
    const y = 0.3 + Math.sin(Math.PI * t) * 0.65 - 2.5 * t * t;
    vertices.push(-width, y, -7 * t, width, y, -7 * t);
    if (i < 12) indices.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
})();
const PALM_TRUNK = new THREE.MeshStandardMaterial({ color: '#5A4646', roughness: 1 });
const PALM_LEAF = [
  new THREE.MeshStandardMaterial({ color: '#1E4A3E', side: THREE.DoubleSide, roughness: 1 }),
  new THREE.MeshStandardMaterial({ color: '#2D5E44', side: THREE.DoubleSide, roughness: 1 }),
];

/** A tall, gently curved palm: trunk in leaning segments, a crown of fronds that sways. */
function Palm({ position, height = 13, lean = 0.12, phase = 0, animate, fronds = 8 }: { position: [number, number, number]; height?: number; lean?: number; phase?: number; animate: boolean; fronds?: number }) {
  const crown = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!crown.current || !animate) return;
    crown.current.rotation.y = Math.sin(clock.elapsedTime * 0.48 + phase) * motion.palmSway;
    crown.current.rotation.z = Math.sin(clock.elapsedTime * 0.63 + phase) * 0.05;
  });
  const segs = 4;
  const segH = height / segs;
  let node: React.ReactNode = (
    <group ref={crown} position-y={segH}>
      {Array.from({ length: fronds }, (_, i) => (
        <group key={i} rotation={[0.15 * Math.sin(i * 1.7), (i * Math.PI * 2) / fronds, 0]}>
          <mesh geometry={palmFrond} material={PALM_LEAF[i % 2]} />
        </group>
      ))}
    </group>
  );
  for (let i = segs - 1; i >= 0; i--) {
    node = (
      <group position-y={i === 0 ? 0 : segH} rotation-z={lean / segs + (i === 0 ? lean * 0.4 : 0)}>
        <mesh position-y={segH / 2} material={PALM_TRUNK}>
          <cylinderGeometry args={[0.22 + (segs - i - 1) * 0.04, 0.26 + (segs - i - 1) * 0.05, segH * 1.02, 7]} />
        </mesh>
        {node}
      </group>
    );
  }
  return <group position={position} rotation-y={rand(phase * 9) * Math.PI * 2}>{node}</group>;
}

function Palms({ animate, compact }: { animate: boolean; compact: boolean }) {
  const palms = useMemo(() => {
    const out: { pos: [number, number, number]; h: number; lean: number }[] = [];
    // A row along the beach side of the drive
    const step = compact ? 16 : 10;
    for (let x = BEACH_X0 + 4, i = 0; x < 200; x += step + rand(i) * 4, i++) {
      out.push({ pos: [x, -0.45, SHORE_Z - 11 + rand(i + 5) * 1.5], h: 11 + rand(i + 7) * 7, lean: (rand(i + 9) - 0.5) * 0.5 });
    }
    // A few on the far side of the drive, in front of the hotels
    for (let x = BEACH_X0 + 12, i = 0; x < 180; x += step * 2.2, i++) {
      out.push({ pos: [x, -0.2, SHORE_Z - 26], h: 13 + rand(i + 20) * 6, lean: (rand(i + 21) - 0.5) * 0.3 });
    }
    return out;
  }, [compact]);
  return (
    <group>
      {palms.map((p, i) => (
        <Palm key={i} position={p.pos} height={p.h} lean={p.lean} phase={i} animate={animate} fronds={compact ? 6 : 8} />
      ))}
    </group>
  );
}

// ---------------------------------------------------------------- art deco hotels and towers
function decoFacade(wall: string, seed: number) {
  const [c, ctx] = canvas(128, 256);
  ctx.fillStyle = wall;
  ctx.fillRect(0, 0, 128, 256);
  // Horizontal "eyebrow" ledges with soft shadows
  for (let y = 20; y < 256; y += 32) {
    ctx.fillStyle = 'rgba(255,255,255,.35)';
    ctx.fillRect(0, y, 128, 3);
    ctx.fillStyle = 'rgba(60,30,60,.18)';
    ctx.fillRect(0, y + 3, 128, 5);
  }
  // Windows: teal glass, some warm and lit
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 4; col++) {
      const lit = rand(seed * 31 + row * 7 + col) < 0.3;
      ctx.fillStyle = lit ? '#FFD49A' : '#3E7F8F';
      ctx.fillRect(12 + col * 30, 26 + row * 32, 18, 14);
    }
  }
  return texture(c);
}

function glassFacade(seed: number) {
  const [c, ctx] = canvas(128, 512);
  const g = ctx.createLinearGradient(0, 0, 128, 0);
  g.addColorStop(0, '#2B2F5A');
  g.addColorStop(0.5, '#4A4C7E');
  g.addColorStop(1, '#2A2C52');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 512);
  for (let row = 0; row < 64; row++) {
    for (let col = 0; col < 8; col++) {
      const r = rand(seed * 97 + row * 13 + col);
      ctx.fillStyle = r < 0.16 ? (r < 0.04 ? '#9FE7F2' : '#FFD29A') : `rgba(20,22,48,${0.5 + r * 0.3})`;
      ctx.fillRect(4 + col * 16, 4 + row * 8, 12, 5);
    }
  }
  // Sunset reflected on the glass, strongest at the top
  const refl = ctx.createLinearGradient(0, 0, 0, 512);
  refl.addColorStop(0, 'rgba(255,150,120,.35)');
  refl.addColorStop(0.5, 'rgba(255,110,170,.12)');
  refl.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = refl;
  ctx.fillRect(0, 0, 128, 512);
  return texture(c);
}

function neonSign(text: string, color: string, vertical: boolean) {
  const w = vertical ? 64 : 256;
  const h = vertical ? 256 : 64;
  const [c, ctx] = canvas(w, h);
  ctx.fillStyle = 'rgba(15,10,30,.85)';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.shadowColor = color;
  ctx.shadowBlur = 10;
  ctx.strokeRect(4, 4, w - 8, h - 8);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `900 ${vertical ? 38 : 40}px 'Nunito', 'Arial Black', sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowBlur = 16;
  if (vertical) {
    const letters = text.split('');
    const stepY = (h - 30) / letters.length;
    letters.forEach((ch, i) => {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(ch, w / 2, 18 + stepY * (i + 0.5));
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.6;
      ctx.fillText(ch, w / 2, 18 + stepY * (i + 0.5));
      ctx.globalAlpha = 1;
    });
  } else {
    ctx.fillText(text, w / 2, h / 2 + 2);
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.6;
    ctx.fillText(text, w / 2, h / 2 + 2);
    ctx.globalAlpha = 1;
  }
  return texture(c);
}

const SIGN_WORDS = ['HOTEL', 'OCEAN', 'PALMS', 'MOTEL', 'TIDES', 'BAR', 'SURF', 'CLUB', 'DINER', 'BREEZE'];

interface Hotel {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  wall: number;
  neon: string;
  sign: 'fin' | 'roof' | 'none';
  word: string;
  rounded: boolean;
}

function Hotels({ compact, animate }: { compact: boolean; animate: boolean }) {
  const hotels = useMemo<Hotel[]>(() => {
    const out: Hotel[] = [];
    let x = BEACH_X0 + 4;
    for (let i = 0; x < (compact ? 150 : 230); i++) {
      const w = 14 + rand(i + 300) * 12;
      out.push({
        x: x + w / 2,
        z: SHORE_Z - 34 - rand(i + 310) * 4,
        w,
        d: 12 + rand(i + 320) * 6,
        h: 9 + rand(i + 330) * 14,
        wall: i % scene.deco.length,
        neon: scene.neon[i % scene.neon.length],
        sign: i % 3 === 0 ? 'fin' : i % 3 === 1 ? 'roof' : 'none',
        word: SIGN_WORDS[i % SIGN_WORDS.length],
        rounded: i % 2 === 0,
      });
      x += w + 2 + rand(i + 340) * 3;
    }
    return out;
  }, [compact]);
  const facades = useMemo(() => scene.deco.map((c, i) => decoFacade(c, i)), []);
  const signs = useMemo(() => hotels.map((h) => (h.sign === 'none' ? null : neonSign(h.word, h.neon, h.sign === 'fin'))), [hotels]);
  useEffect(() => () => { facades.forEach((f) => f.dispose()); signs.forEach((s) => s?.dispose()); }, [facades, signs]);
  const signMats = useRef<(THREE.MeshBasicMaterial | null)[]>([]);
  useFrame(({ clock }) => {
    if (!animate) return;
    const t = clock.elapsedTime;
    signMats.current.forEach((m, i) => {
      if (!m) return;
      // Neon hum, with the odd flicker
      const flicker = Math.sin(t * 23 + i * 7) > 0.985 ? 0.35 : 1;
      m.opacity = (0.88 + Math.sin(t * 3 + i) * 0.06) * flicker;
    });
  });
  return (
    <group>
      {hotels.map((h, i) => {
        const tex = facades[h.wall];
        return (
          <group key={i} position={[h.x, -0.2, h.z]}>
            <mesh position-y={h.h / 2}>
              <boxGeometry args={[h.w, h.h, h.d]} />
              <meshStandardMaterial map={tex} roughness={0.85} />
            </mesh>
            {h.rounded && (
              // Rounded art deco corner
              <mesh position={[h.w / 2, h.h / 2, h.d / 2 - h.d * 0.25]}>
                <cylinderGeometry args={[h.d * 0.25, h.d * 0.25, h.h, 20, 1, false, 0, Math.PI]} />
                <meshStandardMaterial map={tex} roughness={0.85} />
              </mesh>
            )}
            {/* Stepped parapet */}
            <mesh position-y={h.h + 0.4}>
              <boxGeometry args={[h.w * 0.6, 0.8, h.d * 0.7]} />
              <meshStandardMaterial color={scene.deco[(h.wall + 1) % scene.deco.length]} roughness={0.85} />
            </mesh>
            {/* Neon trim along the roofline and the front base */}
            <mesh position={[0, h.h - 0.1, h.d / 2 + 0.05]}>
              <boxGeometry args={[h.w, 0.14, 0.1]} />
              <meshBasicMaterial color={h.neon} toneMapped={false} />
            </mesh>
            <mesh position={[0, 3.2, h.d / 2 + 0.05]}>
              <boxGeometry args={[h.w, 0.1, 0.1]} />
              <meshBasicMaterial color={scene.neon[(i + 1) % scene.neon.length]} toneMapped={false} />
            </mesh>
            {h.sign === 'fin' && signs[i] && (
              <mesh position={[-h.w * 0.25, h.h * 0.62, h.d / 2 + 0.6]}>
                <boxGeometry args={[1.4, h.h * 0.55, 0.3]} />
                <meshBasicMaterial
                  ref={(m) => {
                    signMats.current[i] = m;
                  }}
                  map={signs[i]!}
                  transparent
                  toneMapped={false}
                />
              </mesh>
            )}
            {h.sign === 'roof' && signs[i] && (
              <mesh position={[0, h.h + 2.2, 0]}>
                <planeGeometry args={[h.w * 0.7, h.w * 0.7 * 0.25]} />
                <meshBasicMaterial
                  ref={(m) => {
                    signMats.current[i] = m;
                  }}
                  map={signs[i]!}
                  transparent
                  side={THREE.DoubleSide}
                  toneMapped={false}
                />
              </mesh>
            )}
          </group>
        );
      })}
    </group>
  );
}

function Towers({ compact, animate }: { compact: boolean; animate: boolean }) {
  const towers = useMemo(() => {
    const n = compact ? 12 : 22;
    return Array.from({ length: n }, (_, i) => ({
      x: BEACH_X0 + 20 + (i / n) * 250 + rand(i + 400) * 8,
      z: SHORE_Z - 70 - rand(i + 410) * 70,
      w: 10 + rand(i + 420) * 10,
      h: 35 + rand(i + 430) * 60,
      tex: i % 4,
      spire: rand(i + 440) < 0.3,
    }));
  }, [compact]);
  const facades = useMemo(() => [0, 1, 2, 3].map((i) => glassFacade(i)), []);
  useEffect(() => () => facades.forEach((f) => f.dispose()), [facades]);
  const blink = useRef<THREE.MeshBasicMaterial>(null);
  useFrame(({ clock }) => {
    if (blink.current) blink.current.opacity = animate ? (Math.sin(clock.elapsedTime * 2.5) > 0.6 ? 1 : 0.15) : 1;
  });
  return (
    <group>
      {towers.map((t, i) => (
        <group key={i} position={[t.x, -0.2, t.z]}>
          <mesh position-y={t.h / 2}>
            <boxGeometry args={[t.w, t.h, t.w * 0.85]} />
            <meshStandardMaterial map={facades[t.tex]} roughness={0.25} metalness={0.4} emissive="#FF9C7A" emissiveIntensity={0.08} />
          </mesh>
          {t.spire && (
            <mesh position-y={t.h + 4}>
              <cylinderGeometry args={[0.15, 0.4, 8, 6]} />
              <meshStandardMaterial color="#B7B2C8" metalness={0.6} roughness={0.3} />
            </mesh>
          )}
          <mesh position-y={t.h + (t.spire ? 8.2 : 0.3)}>
            <sphereGeometry args={[0.35, 6, 4]} />
            <meshBasicMaterial ref={i === 0 ? blink : undefined} color="#FF3040" transparent toneMapped={false} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

// ---------------------------------------------------------------- moving things on the water and in the air
function Wake() {
  const tex = useMemo(() => {
    const [c, ctx] = canvas(64, 256);
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, 'rgba(255,255,255,.9)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(26, 0);
    ctx.lineTo(38, 0);
    ctx.lineTo(64, 256);
    ctx.lineTo(0, 256);
    ctx.closePath();
    ctx.fill();
    return texture(c);
  }, []);
  return (
    <mesh rotation={[-Math.PI / 2, 0, -Math.PI / 2]} position={[-10, 0.02, 0]}>
      <planeGeometry args={[6, 16]} />
      <meshBasicMaterial map={tex} transparent depthWrite={false} opacity={0.7} toneMapped={false} />
    </mesh>
  );
}

function Speedboat({ hull, stripe }: { hull: string; stripe: string }) {
  return (
    <group>
      <mesh position-y={0.3} scale={[1, 1, 1]}>
        <boxGeometry args={[6.4, 0.7, 2.2]} />
        <meshStandardMaterial color={hull} metalness={0.3} roughness={0.3} />
      </mesh>
      <mesh position={[3.9, 0.3, 0]} rotation-z={-Math.PI / 2} rotation-y={Math.PI / 4}>
        <coneGeometry args={[1.55, 1.6, 4]} />
        <meshStandardMaterial color={hull} metalness={0.3} roughness={0.3} />
      </mesh>
      <mesh position={[0, 0.48, 1.12]}>
        <boxGeometry args={[6.4, 0.18, 0.04]} />
        <meshStandardMaterial color={stripe} />
      </mesh>
      <mesh position={[0, 0.48, -1.12]}>
        <boxGeometry args={[6.4, 0.18, 0.04]} />
        <meshStandardMaterial color={stripe} />
      </mesh>
      <mesh position={[0.6, 0.95, 0]} rotation-z={-0.5}>
        <boxGeometry args={[0.1, 0.7, 1.9]} />
        <meshStandardMaterial color="#9FD8EE" transparent opacity={0.6} metalness={0.5} roughness={0.1} />
      </mesh>
      <mesh position={[-1.2, 0.8, 0]}>
        <boxGeometry args={[1.6, 0.35, 1.7]} />
        <meshStandardMaterial color="#F2EDE6" />
      </mesh>
      <Wake />
    </group>
  );
}

function Boats({ animate, compact }: { animate: boolean; compact: boolean }) {
  const boats = useMemo(
    () =>
      [
        { z: 32, dir: 1, offset: 40, speed: motion.boatSpeed * 6, hull: '#F4F1EA', stripe: '#FF4F9A' },
        { z: 62, dir: -1, offset: 160, speed: motion.boatSpeed * 8, hull: '#1F2A44', stripe: '#2EC4C6' },
        { z: -36, dir: 1, offset: 220, speed: motion.boatSpeed * 4, hull: '#FF6FA9', stripe: '#FFFFFF' },
      ].slice(0, compact ? 1 : 3),
    [compact]
  );
  const refs = useRef<(THREE.Group | null)[]>([]);
  const span = 360;
  const place = (t: number) => {
    boats.forEach((b, i) => {
      const g = refs.current[i];
      if (!g) return;
      const d = (b.offset + t * b.speed) % span;
      g.position.x = b.dir === 1 ? -span / 2 + d : span / 2 - d;
      // Keep the near boat clear of the field pad
      if (Math.abs(b.z) < FIELD_HEIGHT_M / 2 + 12 && Math.abs(g.position.x) < FIELD_WIDTH_M / 2 + 8) g.position.z = b.z - 14;
      else g.position.z = b.z;
      g.position.y = WATER_Y + Math.sin(t * 2 + i) * 0.08;
      g.rotation.x = Math.sin(t * 1.6 + i) * 0.03;
      g.rotation.z = (b.dir === 1 ? 1 : -1) * 0.04;
    });
  };
  useFrame(({ clock }) => {
    if (animate) place(clock.elapsedTime);
  });
  useLayoutEffect(() => place(0));
  return (
    <group>
      {boats.map((b, i) => (
        <group
          key={i}
          ref={(g) => {
            refs.current[i] = g;
          }}
          rotation-y={b.dir === 1 ? 0 : Math.PI}
        >
          <group rotation-y={b.dir === 1 ? 0 : 0}>
            <Speedboat hull={b.hull} stripe={b.stripe} />
          </group>
        </group>
      ))}
    </group>
  );
}

function Yacht() {
  const glow = useGlowTexture();
  return (
    <group position={[-150, WATER_Y, -110]} rotation-y={0.4}>
      <mesh position-y={1}>
        <boxGeometry args={[22, 2.4, 5]} />
        <meshStandardMaterial color="#F2EEE8" />
      </mesh>
      <mesh position={[-1, 3, 0]}>
        <boxGeometry args={[12, 1.8, 4]} />
        <meshStandardMaterial color="#EDE7DE" />
      </mesh>
      <mesh position={[-2, 4.6, 0]}>
        <boxGeometry args={[6, 1.4, 3.4]} />
        <meshStandardMaterial color="#2A3150" metalness={0.5} roughness={0.2} />
      </mesh>
      {Array.from({ length: 8 }, (_, i) => (
        <sprite key={i} position={[-9 + i * 2.6, 2.4, 2.6]} scale={[1.2, 1.2, 1]}>
          <spriteMaterial map={glow} color="#FFD69A" transparent depthWrite={false} blending={THREE.AdditiveBlending} />
        </sprite>
      ))}
    </group>
  );
}

function Helicopter({ animate }: { animate: boolean }) {
  const g = useRef<THREE.Group>(null);
  const rotor = useRef<THREE.Mesh>(null);
  const light = useRef<THREE.MeshBasicMaterial>(null);
  useFrame(({ clock }, dt) => {
    if (!animate) return;
    const t = clock.elapsedTime * 0.12;
    if (g.current) {
      g.current.position.set(40 + Math.cos(t) * 75, 34 + Math.sin(t * 2) * 3, -70 + Math.sin(t) * 40);
      g.current.rotation.y = -t + Math.PI;
    }
    if (rotor.current) rotor.current.rotation.y += dt * 30;
    if (light.current) light.current.opacity = Math.sin(clock.elapsedTime * 6) > 0.7 ? 1 : 0.1;
  });
  return (
    <group ref={g} position={[115, 34, -70]}>
      <mesh scale={[1.6, 1, 1]}>
        <sphereGeometry args={[1.2, 14, 10]} />
        <meshStandardMaterial color="#1E2238" metalness={0.4} roughness={0.4} />
      </mesh>
      <mesh position={[-3, 0.3, 0]}>
        <boxGeometry args={[4, 0.3, 0.3]} />
        <meshStandardMaterial color="#1E2238" />
      </mesh>
      <mesh ref={rotor} position={[0, 1.35, 0]}>
        <boxGeometry args={[9, 0.05, 0.3]} />
        <meshStandardMaterial color="#111" />
      </mesh>
      <mesh position={[0, -1.1, 0]}>
        <sphereGeometry args={[0.15, 6, 4]} />
        <meshBasicMaterial ref={light} color="#FF3040" transparent toneMapped={false} />
      </mesh>
    </group>
  );
}

function Birds({ animate }: { animate: boolean }) {
  const flock = useRef<THREE.Group>(null);
  const wings = useRef<(THREE.Group | null)[]>([]);
  const birds = useMemo(() => Array.from({ length: 7 }, (_, i) => [i * 2.2 - (i % 2) * 1.4, (i % 3) * 0.9, -i * 1.6] as [number, number, number]), []);
  useFrame(({ clock }) => {
    if (!animate) return;
    const t = clock.elapsedTime;
    if (flock.current) flock.current.position.x = ((t * motion.birdSpeed * 3) % 260) - 130;
    wings.current.forEach((w, i) => {
      if (w) w.scale.y = 0.4 + Math.abs(Math.sin(t * 4 + i)) * 0.8;
    });
  });
  return (
    <group ref={flock} position={[-130, 26, -45]}>
      {birds.map((p, i) => (
        <group
          key={i}
          position={p}
          ref={(w) => {
            wings.current[i] = w;
          }}
        >
          <Line points={[[-1.2, 0.35, 0], [-0.45, 0.55, 0], [0, 0, 0], [0.45, 0.55, 0], [1.2, 0.35, 0]]} color="#2A2140" lineWidth={2} />
        </group>
      ))}
    </group>
  );
}

// ---------------------------------------------------------------- scene
export function CoastalSunsetWorld({ scale = 1, fogNear = 140, fogFar = 460 }: { scale?: number; fogNear?: number; fogFar?: number }) {
  const animate = useSceneryMotion();
  const compact = useMediaMatch('(max-width: 767px)');
  return (
    <group scale={scale} userData={{ noExport: true }}>
      <NoPick>
        <Sky animate={animate} />
        <Water animate={animate} scale={scale} fogNear={fogNear * scale} fogFar={fogFar * scale} />
        <Shore animate={animate} />
        <Palms animate={animate} compact={compact} />
        <Hotels compact={compact} animate={animate} />
        <Towers compact={compact} animate={animate} />
        <Boats animate={animate} compact={compact} />
        <Yacht />
        <Helicopter animate={animate} />
        <Birds animate={animate} />
      </NoPick>
    </group>
  );
}
