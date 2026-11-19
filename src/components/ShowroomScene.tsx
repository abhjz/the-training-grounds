// Showroom look, 3D: radical subtraction. The field is polished dark concrete that reflects the
// gates; around it lies matte concrete fading into a hazy late-afternoon city sky. Nothing moves.
// The exported model gets a plain pad; the reflective surface and the surroundings are screen-only.

import React, { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Line, MeshReflectorMaterial } from '@react-three/drei';
import * as THREE from 'three';
import { FIELD_HEIGHT_M, FIELD_WIDTH_M, PERIMETER_FENCE_M } from '../constants/equipment';
import { FieldColors } from '../theme/engine';
import { SHOWROOM } from '../theme/showroom';
import { drawWatermarkText } from '../utils/watermark';
import { useMediaMatch } from '../hooks/useMediaMatch';

const noPick = () => {};
const { scene } = SHOWROOM;

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

function useWatermark(name: string) {
  return useMemo(() => {
    const pxPerM = 24;
    const w = Math.round(FIELD_WIDTH_M * pxPerM);
    const h = Math.round(FIELD_HEIGHT_M * pxPerM);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    if (ctx && name.trim()) drawWatermarkText(ctx, name, w, h, 'rgba(255, 255, 255, 0.07)');
    const t = new THREE.CanvasTexture(c);
    t.anisotropy = 4;
    return t;
  }, [name]);
}

export function ShowroomField({ groundName, fc }: { groundName: string; fc: FieldColors }) {
  const compact = useMediaMatch('(max-width: 767px)');
  const watermark = useWatermark(groundName);
  useEffect(() => () => watermark.dispose(), [watermark]);
  const w = FIELD_WIDTH_M;
  const h = FIELD_HEIGHT_M;
  const f = PERIMETER_FENCE_M;
  const grid = useMemo(() => {
    const p: number[] = [];
    for (let x = 0; x <= w; x += 5) p.push(x - w / 2, 0.012, -h / 2, x - w / 2, 0.012, h / 2);
    for (let z = 0; z <= h; z += 5) p.push(-w / 2, 0.012, z - h / 2, w / 2, 0.012, z - h / 2);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    return g;
  }, [w, h]);
  const fence: [number, number, number][] = [
    [-w / 2 + f, 0.03, -h / 2 + f],
    [w / 2 - f, 0.03, -h / 2 + f],
    [w / 2 - f, 0.03, h / 2 - f],
    [-w / 2 + f, 0.03, h / 2 - f],
    [-w / 2 + f, 0.03, -h / 2 + f],
  ];
  return (
    <group name="Field" userData={{ export: true }}>
      {/* Plain pad: what the exported model gets (hidden under the polished surface on screen) */}
      <mesh rotation-x={-Math.PI / 2}>
        <planeGeometry args={[w, h]} />
        <meshStandardMaterial color={fc.ground} roughness={0.6} />
      </mesh>
      <mesh position-y={-0.15}>
        <boxGeometry args={[w, 0.3, h]} />
        <meshStandardMaterial color={fc.under} roughness={0.8} />
      </mesh>
      <lineSegments geometry={grid}>
        <lineBasicMaterial color={fc.grid3d} transparent opacity={0.6} />
      </lineSegments>
      <Line points={fence} color={fc.fence ?? '#D0D1D2'} lineWidth={1.6} dashed dashSize={0.8} gapSize={0.45} />
      <group userData={{ noExport: true }}>
        <NoPick>
          {/* Polished concrete: reflects the gates and the race line */}
          <mesh rotation-x={-Math.PI / 2} position-y={0.004}>
            <planeGeometry args={[w, h]} />
            <MeshReflectorMaterial
              color={fc.ground}
              blur={[260, 90]}
              resolution={compact ? 512 : 1024}
              mixBlur={1}
              mixStrength={1.4}
              mixContrast={1}
              roughness={0.82}
              metalness={0.35}
              depthScale={1.1}
              minDepthThreshold={0.4}
              maxDepthThreshold={1.4}
              mirror={0.4}
            />
          </mesh>
          <mesh rotation-x={-Math.PI / 2} position-y={0.008}>
            <planeGeometry args={[w, h]} />
            <meshBasicMaterial map={watermark} transparent depthWrite={false} />
          </mesh>
        </NoPick>
      </group>
    </group>
  );
}

/** Hazy sky: cool grey-blue overhead, warm pale haze at the horizon, a soft glow where the sun is. */
function Sky() {
  const mat = useMemo(() => {
    const top = new THREE.Color(scene.skyTop);
    const hor = new THREE.Color(scene.skyHorizon);
    const disp = (c: THREE.Color) => {
      const o = { r: 0, g: 0, b: 0 };
      c.getRGB(o, THREE.SRGBColorSpace);
      return new THREE.Vector3(o.r, o.g, o.b);
    };
    return new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: { uTop: { value: disp(top) }, uHorizon: { value: disp(hor) }, uSun: { value: new THREE.Vector3(0.35, 0.16, -0.92).normalize() } },
      vertexShader: `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      // Display-space colours written straight to the screen
      fragmentShader: `uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uSun; varying vec3 vDir;
        void main(){
          vec3 d = normalize(vDir);
          float h = clamp(d.y, 0.0, 1.0);
          vec3 c = mix(uHorizon, uTop, pow(h, 0.55));
          float s = max(dot(d, uSun), 0.0);
          c += vec3(1.0, 0.93, 0.82) * pow(s, 12.0) * 0.22;
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
  }, []);
  useEffect(() => () => mat.dispose(), [mat]);
  return (
    <mesh material={mat} renderOrder={-1}>
      <sphereGeometry args={[400, 32, 16]} />
    </mesh>
  );
}

/** A distant city, softened by haze. */
function Skyline() {
  const towers = useMemo(() => {
    const out: { x: number; z: number; w: number; h: number }[] = [];
    for (let i = 0; i < 40; i++) {
      const r = (n: number) => {
        const x = Math.sin((i + n) * 91.7 + 3.1) * 43758.5453;
        return x - Math.floor(x);
      };
      const a = -Math.PI * 0.92 + (i / 39) * Math.PI * 0.84;
      const dist = 190 + r(1) * 90;
      out.push({ x: Math.cos(a) * dist, z: Math.sin(a) * dist, w: 8 + r(2) * 16, h: 12 + r(3) * 55 + (i % 9 === 0 ? 40 : 0) });
    }
    return out;
  }, []);
  return (
    <group>
      {towers.map((t, i) => (
        <mesh key={i} position={[t.x, t.h / 2 - 1, t.z]}>
          <boxGeometry args={[t.w, t.h, t.w * 0.8]} />
          <meshStandardMaterial color={scene.city} roughness={1} />
        </mesh>
      ))}
    </group>
  );
}

export function ShowroomWorld({ scale = 1 }: { scale?: number }) {
  return (
    <group userData={{ noExport: true }}>
      <NoPick>
        <group scale={scale}>
          <Sky />
          <Skyline />
        </group>
        {/* Matte concrete apron around the field, fading into the haze */}
        <mesh rotation-x={-Math.PI / 2} position-y={-0.03}>
          <planeGeometry args={[900 * scale, 900 * scale]} />
          <meshStandardMaterial color={scene.concrete} roughness={0.95} />
        </mesh>
      </NoPick>
    </group>
  );
}
