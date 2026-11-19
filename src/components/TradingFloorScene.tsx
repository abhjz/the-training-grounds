// Trading Floor look, 3D: flat colour blocks, no atmosphere. The field is a dark card-coloured pad
// on a near-black floor with hairline grid; around it, candlestick columns in trading green and red
// rise and fall like a live chart, with a yellow price line running across their closes.
// Only the field pad is exported; the rest is decoration that ignores clicks.

import React, { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import * as THREE from 'three';
import { FIELD_HEIGHT_M, FIELD_WIDTH_M, PERIMETER_FENCE_M } from '../constants/equipment';
import { FieldColors } from '../theme/engine';
import { TRADING_FLOOR } from '../theme/tradingFloor';
import { drawWatermarkText } from '../utils/watermark';
import { useMediaMatch } from '../hooks/useMediaMatch';

const noPick = () => {};
const { ui } = TRADING_FLOOR;

function NoPick({ children }: { children: React.ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  useLayoutEffect(() => {
    ref.current?.traverse((o) => {
      (o as THREE.Mesh).raycast = noPick;
    });
  });
  return <group ref={ref}>{children}</group>;
}

export function TradingField({ groundName, fc }: { groundName: string; fc: FieldColors }) {
  const w = FIELD_WIDTH_M;
  const h = FIELD_HEIGHT_M;
  const f = PERIMETER_FENCE_M;
  const watermark = useMemo(() => {
    const pxPerM = 24;
    const c = document.createElement('canvas');
    c.width = Math.round(w * pxPerM);
    c.height = Math.round(h * pxPerM);
    const ctx = c.getContext('2d');
    if (ctx && groundName.trim()) drawWatermarkText(ctx, groundName, c.width, c.height, 'rgba(234, 236, 239, 0.06)');
    return new THREE.CanvasTexture(c);
  }, [groundName, w, h]);
  useEffect(() => () => watermark.dispose(), [watermark]);
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
      <mesh position-y={-0.15}>
        <boxGeometry args={[w, 0.3, h]} />
        <meshStandardMaterial color={fc.ground} roughness={0.9} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={0.006}>
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial map={watermark} transparent depthWrite={false} />
      </mesh>
      <lineSegments geometry={grid}>
        <lineBasicMaterial color={fc.grid3d} />
      </lineSegments>
      <Line points={fence} color={fc.fence ?? ui.muted} lineWidth={1.6} dashed dashSize={0.8} gapSize={0.45} />
      {/* Yellow hairline rim: the one accent marks the playing field */}
      <Line
        points={[[-w / 2, 0.02, -h / 2], [w / 2, 0.02, -h / 2], [w / 2, 0.02, h / 2], [-w / 2, 0.02, h / 2], [-w / 2, 0.02, -h / 2]]}
        color={ui.yellow}
        lineWidth={1.4}
      />
    </group>
  );
}

/** A ring of candlestick columns behind and beside the field; bodies and wicks move like a live chart. */
function Candles({ animate, compact }: { animate: boolean; compact: boolean }) {
  const count = compact ? 28 : 48;
  const candles = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const a = -Math.PI * 0.95 + (i / (count - 1)) * Math.PI * 0.9;
        const r = 78 + (i % 3) * 6;
        return { x: Math.cos(a) * r, z: Math.sin(a) * r * 0.85, rot: -a + Math.PI / 2, seed: i * 1.37 };
      }),
    [count]
  );
  const bodyRefs = useRef<(THREE.Mesh | null)[]>([]);
  const wickRefs = useRef<(THREE.Mesh | null)[]>([]);
  const mats = useMemo(
    () => candles.map(() => new THREE.MeshBasicMaterial({ color: ui.up })),
    [candles]
  );
  useEffect(() => () => mats.forEach((m) => m.dispose()), [mats]);
  const up = useMemo(() => new THREE.Color(ui.up), []);
  const down = useMemo(() => new THREE.Color(ui.down), []);
  const closes = useRef<THREE.Vector3[]>(candles.map((c) => new THREE.Vector3(c.x, 20, c.z)));
  const lineRef = useRef<any>(null);

  const place = (t: number) => {
    candles.forEach((c, i) => {
      // A smooth "price" walk per candle; open = previous moment, close = now
      const price = (u: number) => 18 + Math.sin(u * 0.35 + c.seed) * 7 + Math.sin(u * 0.9 + c.seed * 2.1) * 3 + Math.sin(c.seed * 5) * 6;
      const open = price(t - 2.5);
      const close = price(t);
      const hi = Math.max(open, close) + 1.5 + Math.abs(Math.sin(c.seed * 3 + t * 0.4)) * 2;
      const lo = Math.min(open, close) - 1.5 - Math.abs(Math.cos(c.seed * 2 + t * 0.3)) * 2;
      const body = bodyRefs.current[i];
      const wick = wickRefs.current[i];
      if (body) {
        const hgt = Math.max(0.6, Math.abs(close - open));
        body.scale.set(1, hgt, 1);
        body.position.set(c.x, (open + close) / 2, c.z);
      }
      if (wick) {
        wick.scale.set(1, hi - lo, 1);
        wick.position.set(c.x, (hi + lo) / 2, c.z);
      }
      mats[i].color.copy(close >= open ? up : down);
      closes.current[i].set(c.x, close + 12, c.z);
    });
    const geom = lineRef.current?.geometry;
    if (geom?.setPositions) geom.setPositions(closes.current.flatMap((v) => [v.x, v.y, v.z]));
  };
  useFrame(({ clock }) => {
    if (animate) place(clock.elapsedTime);
  });
  useLayoutEffect(() => place(0));
  return (
    <group>
      {candles.map((c, i) => (
        <group key={i}>
          <mesh
            ref={(m) => {
              bodyRefs.current[i] = m;
            }}
            material={mats[i]}
            rotation-y={c.rot}
          >
            <boxGeometry args={[2.6, 1, 2.6]} />
          </mesh>
          <mesh
            ref={(m) => {
              wickRefs.current[i] = m;
            }}
            material={mats[i]}
          >
            <boxGeometry args={[0.28, 1, 0.28]} />
          </mesh>
        </group>
      ))}
      {/* Yellow price line across the closes, floating above the chart */}
      <Line ref={lineRef} points={closes.current.map((v) => v.clone())} color={ui.yellow} lineWidth={2} />
    </group>
  );
}

export function TradingFloorWorld({ scale = 1 }: { scale?: number }) {
  const animate = !useMediaMatch('(prefers-reduced-motion: reduce)');
  const compact = useMediaMatch('(max-width: 767px)');
  const floorGrid = useMemo(() => {
    const p: number[] = [];
    const R = 160;
    for (let x = -R; x <= R; x += 10) p.push(x, -0.04, -R, x, -0.04, R);
    for (let z = -R; z <= R; z += 10) p.push(-R, -0.04, z, R, -0.04, z);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    return g;
  }, []);
  return (
    <group userData={{ noExport: true }}>
      <NoPick>
        <group scale={scale}>
          <mesh rotation-x={-Math.PI / 2} position-y={-0.05}>
            <planeGeometry args={[900, 900]} />
            <meshBasicMaterial color={ui.canvas} />
          </mesh>
          <lineSegments geometry={floorGrid}>
            <lineBasicMaterial color={ui.elevated} transparent opacity={0.7} />
          </lineSegments>
          <Candles animate={animate} compact={compact} />
        </group>
      </NoPick>
    </group>
  );
}
