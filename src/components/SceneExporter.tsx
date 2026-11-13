import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { FIELD_HEIGHT_M, FIELD_WIDTH_M, PERIMETER_FENCE_M } from '../constants/equipment';
import { isNativeApp, saveFile } from '../utils/fileSaver';

export type Export3DKind = 'glb' | 'png';

export interface Export3DRequest {
  kind: Export3DKind;
  fileBase: string; // file name without extension
  caption: string[]; // lines printed on the PNG snapshot (first line is the title)
  nonce: number; // changes for every request
}


/** True for things that only exist for interaction or screen drawing, not as real objects. */
function isScreenOnly(o: THREE.Object3D): boolean {
  const any = o as any;
  if (o.userData?.noExport) return true;
  if (any.isLine2 || any.isLineSegments2) return true; // fat screen-space lines don't survive export
  if (any.isLight) return true;
  const mat = any.material as THREE.Material | THREE.Material[] | undefined;
  if (mat && !Array.isArray(mat) && mat.transparent && mat.opacity === 0) return true; // invisible hit areas
  if (o.visible === false) return true;
  return false;
}

/** Build a clean, export-only copy of the field, gates and race line. */
function buildExportScene(scene: THREE.Scene, flight: THREE.Vector3[], pathColor: string, groundName: string) {
  const root = new THREE.Scene();
  root.name = groundName || 'Track';

  for (const child of scene.children) {
    if (!child.userData?.export) continue;
    const copy = child.clone(true);
    const drop: THREE.Object3D[] = [];
    copy.traverse((o) => {
      if (o !== copy && isScreenOnly(o)) drop.push(o);
    });
    drop.forEach((o) => o.removeFromParent());
    root.add(copy);
  }

  // Safety fence as real geometry (on screen it's a dashed screen-space line)
  const fence = new THREE.Group();
  fence.name = 'Safety fence';
  const f = PERIMETER_FENCE_M;
  const fenceMat = new THREE.MeshStandardMaterial({ color: '#f59e0b', emissive: '#f59e0b', emissiveIntensity: 0.4 });
  const w = FIELD_WIDTH_M - f * 2;
  const h = FIELD_HEIGHT_M - f * 2;
  const bar = (len: number, x: number, z: number, alongX: boolean) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(alongX ? len : 0.08, 0.06, alongX ? 0.08 : len), fenceMat);
    m.position.set(x, 0.03, z);
    fence.add(m);
  };
  const top = f - FIELD_HEIGHT_M / 2;
  const bottom = FIELD_HEIGHT_M / 2 - f;
  const left = f - FIELD_WIDTH_M / 2;
  const right = FIELD_WIDTH_M / 2 - f;
  bar(w, 0, top, true);
  bar(w, 0, bottom, true);
  bar(h, left, 0, false);
  bar(h, right, 0, false);
  root.add(fence);

  // Race line as a real tube
  if (flight.length >= 2) {
    const curve = new THREE.CatmullRomCurve3(flight, false, 'centripetal');
    const tube = new THREE.Mesh(
      new THREE.TubeGeometry(curve, Math.min(4000, flight.length * 3), 0.07, 8, false),
      new THREE.MeshStandardMaterial({ color: pathColor, emissive: pathColor, emissiveIntensity: 0.6 })
    );
    tube.name = 'Race line';
    root.add(tube);
  }

  // A light so viewers that honour glTF lights don't show it pitch black
  root.add(new THREE.HemisphereLight('#ffffff', '#1e293b', 1.2));
  return root;
}

/** Captures the current 3D view and adds a caption strip. */
function snapshotPNG(gl: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, caption: string[]) {
  const prevRatio = gl.getPixelRatio();
  gl.setPixelRatio(Math.min(3, Math.max(2, prevRatio * 2))); // render at higher resolution for the file
  gl.render(scene, camera);
  const src = gl.domElement;
  const out = document.createElement('canvas');
  out.width = src.width;
  out.height = src.height;
  const ctx = out.getContext('2d')!;
  ctx.drawImage(src, 0, 0);
  gl.setPixelRatio(prevRatio);
  gl.render(scene, camera);

  // Caption strip along the bottom
  const s = out.width / 1200; // scale text with image size
  const pad = 22 * s;
  const lineH = 22 * s;
  const stripH = pad * 2 + lineH * caption.length + 6 * s;
  const grad = ctx.createLinearGradient(0, out.height - stripH * 1.6, 0, out.height);
  grad.addColorStop(0, 'rgba(7,10,18,0)');
  grad.addColorStop(1, 'rgba(7,10,18,0.92)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, out.height - stripH * 1.6, out.width, stripH * 1.6);
  caption.forEach((line, i) => {
    ctx.fillStyle = i === 0 ? '#f8fafc' : '#94a3b8';
    ctx.font = `${i === 0 ? 700 : 500} ${(i === 0 ? 22 : 14) * s}px "Chakra Petch", "JetBrains Mono", monospace`;
    ctx.fillText(line, pad, out.height - stripH + pad + lineH * (i + 0.6) + (i > 0 ? 6 * s : 0));
  });
  return new Promise<Blob | null>((resolve) => out.toBlob(resolve, 'image/png'));
}

/** Lives inside the 3D canvas and runs export requests against the live scene. */
export function SceneExporter({
  request,
  flight,
  pathColor,
  groundName,
  onDone,
}: {
  request: Export3DRequest | null;
  flight: THREE.Vector3[];
  pathColor: string;
  groundName: string;
  onDone: (ok: boolean, message: string) => void;
}) {
  const { gl, scene, camera } = useThree();
  const handled = useRef<number | null>(null);
  // Read the latest values when the export runs (they can change while we wait for frames)
  const latest = useRef({ gl, scene, camera, flight, pathColor, groundName, onDone });
  latest.current = { gl, scene, camera, flight, pathColor, groundName, onDone };

  useEffect(() => {
    if (!request || handled.current === request.nonce) return;
    handled.current = request.nonce;
    // Wait two frames so a freshly opened 3D view has drawn everything
    requestAnimationFrame(() =>
      requestAnimationFrame(async () => {
        const L = latest.current;
        try {
          if (request.kind === 'glb') {
            const root = buildExportScene(L.scene, L.flight, L.pathColor, L.groundName);
            const result = await new GLTFExporter().parseAsync(root, { binary: true });
            await saveFile(new Blob([result as ArrayBuffer], { type: 'model/gltf-binary' }), `${request.fileBase}.glb`);
            L.onDone(true, `${isNativeApp() ? 'Exported' : 'Downloaded'} ${request.fileBase}.glb`);
          } else {
            const blob = await snapshotPNG(L.gl, L.scene, L.camera, request.caption);
            if (!blob) throw new Error('Could not capture the 3D view');
            await saveFile(blob, `${request.fileBase}.png`);
            L.onDone(true, `${isNativeApp() ? 'Exported' : 'Downloaded'} ${request.fileBase}.png`);
          }
        } catch (err: any) {
          L.onDone(false, `3D export failed: ${err?.message ?? err}`);
        }
      })
    );
  }, [request]);

  return null;
}
