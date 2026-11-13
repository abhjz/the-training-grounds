import React, { useEffect, useMemo } from 'react';
import { ThreeEvent, useThree } from '@react-three/fiber';
import { Html, Line } from '@react-three/drei';
import * as THREE from 'three';
import { TrackPoint } from '../types';
import { FIELD_HEIGHT_M, FIELD_WIDTH_M } from '../constants/equipment';
import { RaceLineControls, DEFAULT_LINE_ALT, clampAlt, clampX, clampY } from '../utils/raceLine';

const toV3 = (p: TrackPoint) => new THREE.Vector3(p.x - (FIELD_WIDTH_M / 2), p.z ?? DEFAULT_LINE_ALT, p.y - (FIELD_HEIGHT_M / 2));
const fromV3 = (v: THREE.Vector3): TrackPoint => ({ x: v.x + (FIELD_WIDTH_M / 2), y: v.z + (FIELD_HEIGHT_M / 2), z: v.y });

export interface PointDragState {
  index: number;
  vertical: boolean; // Shift held at grab time: change height instead of position
  plane: THREE.Plane;
  offset: THREE.Vector3; // point position minus grab position (scene space)
  startClientX: number;
  startClientY: number;
  started: boolean;
}

const DRAG_THRESHOLD_PX = 4;

/** Control-point handles, height stalks and an invisible tube for click-to-add. */
export function RaceLineHandles({
  ctrl,
  selected,
  color,
  onSelect,
  onGrabPoint,
  onInsert,
}: {
  ctrl: RaceLineControls;
  selected: number | null;
  color: string;
  onSelect: (i: number) => void;
  onGrabPoint: (i: number, e: ThreeEvent<PointerEvent>) => void;
  onInsert: (p: TrackPoint) => void;
}) {
  const tube = useMemo(() => {
    if (ctrl.points.length < 2) return null;
    const curve = new THREE.CatmullRomCurve3(ctrl.points.map(toV3), ctrl.closed, 'centripetal');
    return new THREE.TubeGeometry(curve, Math.max(64, ctrl.points.length * 12), 0.45, 6, ctrl.closed);
  }, [ctrl]);

  return (
    <group>
      {tube && (
        <mesh
          geometry={tube}
          onClick={(e: ThreeEvent<MouseEvent>) => {
            if (e.delta > DRAG_THRESHOLD_PX) return; // that was an orbit drag, not a click
            // Let gates win: clicking a gate selects it rather than adding a point
            const hitsGate = e.intersections.some((h) => {
              for (let o: THREE.Object3D | null = h.object; o; o = o.parent) if (o.userData?.gateId) return true;
              return false;
            });
            if (hitsGate) return;
            e.stopPropagation();
            onInsert(fromV3(e.point));
          }}
          onPointerOver={() => (document.body.style.cursor = 'copy')}
          onPointerOut={() => (document.body.style.cursor = '')}
        >
          {/* Fully transparent but still hit-testable */}
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      )}

      {ctrl.points.map((p, i) => {
        const v = toV3(p);
        const isSel = i === selected;
        return (
          <group key={i}>
            <Line
              points={[new THREE.Vector3(v.x, 0.03, v.z), v]}
              color={isSel ? '#fde047' : color}
              lineWidth={1}
              transparent
              opacity={0.5}
            />
            <mesh rotation-x={-Math.PI / 2} position={[v.x, 0.03, v.z]}>
              <circleGeometry args={[0.22, 16]} />
              <meshBasicMaterial color={isSel ? '#fde047' : color} transparent opacity={0.35} />
            </mesh>
            <group
              position={v}
              onClick={(e: ThreeEvent<MouseEvent>) => {
                e.stopPropagation();
                onSelect(i);
              }}
              onPointerDown={(e: ThreeEvent<PointerEvent>) => {
                if (e.button !== 0) return;
                e.stopPropagation();
                onGrabPoint(i, e);
              }}
              onPointerOver={(e: ThreeEvent<PointerEvent>) => {
                e.stopPropagation();
                document.body.style.cursor = 'grab';
              }}
              onPointerOut={() => (document.body.style.cursor = '')}
            >
              <mesh>
                <sphereGeometry args={[isSel ? 0.38 : 0.3, 16, 12]} />
                <meshStandardMaterial
                  color={isSel ? '#fde047' : '#f8fafc'}
                  emissive={isSel ? '#fde047' : color}
                  emissiveIntensity={isSel ? 0.9 : 0.6}
                />
              </mesh>
              {/* Larger invisible grab area so small handles are easy to pick */}
              <mesh>
                <sphereGeometry args={[0.8, 12, 8]} />
                <meshBasicMaterial transparent opacity={0} depthWrite={false} />
              </mesh>
            </group>
            {isSel && (
              <Html position={[v.x, v.y + 0.8, v.z]} center zIndexRange={[4, 0]} style={{ pointerEvents: 'none' }}>
                <div className="px-1.5 py-0.5 rounded bg-yellow-300 text-slate-900 font-mono text-[10px] font-bold whitespace-nowrap">
                  {(p.z ?? DEFAULT_LINE_ALT).toFixed(1)} m
                </div>
              </Html>
            )}
          </group>
        );
      })}
    </group>
  );
}

/** Builds the drag state when a point is grabbed. Shift = vertical (height) drag. */
export function makePointDrag(
  index: number,
  point: TrackPoint,
  e: ThreeEvent<PointerEvent>
): PointDragState | null {
  const v = toV3(point);
  const vertical = e.nativeEvent.shiftKey;
  let plane: THREE.Plane;
  if (vertical) {
    // Upright plane through the point, facing the camera
    const n = new THREE.Vector3().subVectors(e.camera.position, v);
    n.y = 0;
    if (n.lengthSq() < 1e-6) n.set(0, 0, 1);
    plane = new THREE.Plane().setFromNormalAndCoplanarPoint(n.normalize(), v);
  } else {
    // Horizontal plane at the point's height
    plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -v.y);
  }
  const grab = new THREE.Vector3();
  if (!e.ray.intersectPlane(plane, grab)) return null;
  return {
    index,
    vertical,
    plane,
    offset: v.clone().sub(grab),
    startClientX: e.nativeEvent.clientX,
    startClientY: e.nativeEvent.clientY,
    started: false,
  };
}

/** Follows the pointer while a race line point is held. */
export function PointDragManager({
  dragRef,
  getPoint,
  onStart,
  onMove,
  onEnd,
}: {
  dragRef: React.MutableRefObject<PointDragState | null>;
  getPoint: (i: number) => TrackPoint | undefined;
  onStart: () => void;
  onMove: (i: number, p: TrackPoint) => void;
  onEnd: (didMove: boolean) => void;
}) {
  const { camera, gl } = useThree();
  useEffect(() => {
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const hit = new THREE.Vector3();

    const move = (ev: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      if (!d.started) {
        if (Math.hypot(ev.clientX - d.startClientX, ev.clientY - d.startClientY) < DRAG_THRESHOLD_PX) return;
        d.started = true;
        onStart();
        document.body.style.cursor = 'grabbing';
      }
      const rect = gl.domElement.getBoundingClientRect();
      ndc.set(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      if (!raycaster.ray.intersectPlane(d.plane, hit)) return;
      const target = fromV3(hit.add(d.offset));
      const cur = getPoint(d.index);
      if (!cur) return;
      const next: TrackPoint = d.vertical
        ? { ...cur, z: Number(clampAlt(target.z ?? DEFAULT_LINE_ALT).toFixed(2)) }
        : { ...cur, x: Number(clampX(target.x).toFixed(2)), y: Number(clampY(target.y).toFixed(2)) };
      onMove(d.index, next);
    };
    const up = () => {
      const d = dragRef.current;
      if (!d) return;
      dragRef.current = null;
      document.body.style.cursor = '';
      onEnd(d.started);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [camera, gl, dragRef, getPoint, onStart, onMove, onEnd]);
  return null;
}
