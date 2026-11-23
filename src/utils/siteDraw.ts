import { EquipmentDef, PlacedItem } from '../types';
import { itemDims } from '../constants/siteEquipment';
import { cachedLogoImage } from './logos';

/**
 * 2D map drawings for the site pieces (top-down, in metres, already translated and rotated to the
 * item). Local x = width, local y = length (down the map at rotation 0).
 * Returns false when the piece isn't a site piece.
 */
export function drawSiteItem(ctx: CanvasRenderingContext2D, item: PlacedItem, equip: EquipmentDef, isSelected: boolean, isHovered: boolean): boolean {
  const { w, d, h: hDim } = itemDims(item, equip);
  const h = hDim ?? equip.tierHeight ?? 8;
  const hw = w / 2;
  const hd = d / 2;
  const outline = isSelected ? '#fde047' : isHovered ? '#fef9c3' : equip.borderColor;
  const rect = (fill: string, stroke?: string, lw = 0.15) => {
    ctx.fillStyle = fill;
    ctx.fillRect(-hw, -hd, w, d);
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lw;
      ctx.strokeRect(-hw, -hd, w, d);
    }
  };
  const shadow = (dx: number, rx: number, ry: number, a = 0.25) => {
    ctx.fillStyle = `rgba(0,0,0,${a})`;
    ctx.beginPath();
    ctx.ellipse(dx, 0, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  };
  const circle = (x: number, y: number, r: number, fill: string, stroke?: string, lw = 0.1) => {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lw;
      ctx.stroke();
    }
  };
  const seed = (() => {
    let h = 2166136261;
    for (let i = 0; i < item.id.length; i++) h = Math.imul(h ^ item.id.charCodeAt(i), 16777619);
    return () => {
      h = Math.imul(h ^ (h >>> 15), 2246822507);
      h ^= h >>> 13;
      return (h >>> 0) / 4294967296;
    };
  })();

  switch (equip.visualType) {
    case 'turf_pitch': {
      const stripes = Math.max(4, Math.round(w / 6));
      for (let i = 0; i < stripes; i++) {
        ctx.fillStyle = i % 2 ? '#2E7D1F' : '#287019';
        ctx.fillRect(-hw + (i * w) / stripes, -hd, w / stripes + 0.02, d);
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 0.25;
      ctx.strokeRect(-hw + 1, -hd + 1, w - 2, d - 2);
      ctx.strokeStyle = isSelected ? '#fde047' : '#1F5F2A';
      ctx.lineWidth = 0.45;
      ctx.setLineDash([1, 0.6]);
      ctx.strokeRect(-hw, -hd, w, d);
      ctx.setLineDash([]);
      return true;
    }
    case 'sand_pit':
      rect('#BFAF94', isSelected ? '#fde047' : '#9E9C97', 0.4);
      return true;
    case 'asphalt':
      rect('#4B4A48', isSelected ? '#fde047' : undefined);
      return true;
    case 'gravel_road':
      rect('#8E8478', isSelected ? '#fde047' : undefined);
      ctx.fillStyle = 'rgba(70,62,52,0.3)';
      ctx.fillRect(-hw, -hd, 0.5, d);
      ctx.fillRect(hw - 0.5, -hd, 0.5, d);
      return true;
    case 'dirt_lane':
    case 'dirt_area':
      rect(equip.visualType === 'dirt_lane' ? '#C9BBA3' : '#C2B49C', isSelected ? '#fde047' : undefined);
      ctx.strokeStyle = 'rgba(120,105,85,0.35)';
      ctx.lineWidth = 0.25;
      for (const f of [-0.22, -0.1, 0.12, 0.24]) {
        ctx.beginPath();
        ctx.moveTo(f * w, -hd);
        ctx.lineTo(f * w + 0.3, hd);
        ctx.stroke();
      }
      return true;
    case 'dirt_curve': {
      // Quarter circle round the origin, from local +x up to local -y
      ctx.strokeStyle = '#C9BBA3';
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.arc(0, 0, d, -Math.PI / 2, 0);
      ctx.stroke();
      if (isSelected || isHovered) {
        ctx.strokeStyle = outline;
        ctx.lineWidth = 0.2;
        ctx.beginPath();
        ctx.arc(0, 0, d + w / 2, -Math.PI / 2, 0);
        ctx.arc(0, 0, Math.max(0.1, d - w / 2), 0, -Math.PI / 2, true);
        ctx.closePath();
        ctx.stroke();
      }
      return true;
    }
    case 'grass': {
      rect('#5E7D3A', isSelected ? '#fde047' : isHovered ? '#a3c97a' : undefined, 0.2);
      const n = Math.min(220, Math.max(10, Math.round((w * d) / 3)));
      for (let i = 0; i < n; i++) circle((seed() - 0.5) * w, (seed() - 0.5) * d, 0.15 + seed() * 0.3, seed() < 0.5 ? '#4C6A2E' : '#6F8E45');
      return true;
    }
    case 'scrub_patch': {
      const n = Math.min(160, Math.max(4, Math.round((w * d) / 12)));
      for (let i = 0; i < n; i++) {
        const x = (seed() - 0.5) * w;
        const y = (seed() - 0.5) * d;
        circle(x, y, 0.4 + seed() * 0.7, seed() < 0.5 ? '#4A4A33' : '#3B3A2A');
      }
      if (isSelected || isHovered) {
        ctx.strokeStyle = outline;
        ctx.lineWidth = 0.2;
        ctx.setLineDash([0.8, 0.6]);
        ctx.strokeRect(-hw, -hd, w, d);
        ctx.setLineDash([]);
      }
      return true;
    }
    case 'berm': {
      ctx.fillStyle = '#A8997F';
      ctx.beginPath();
      ctx.ellipse(0, 0, hw, hd, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = isSelected ? '#fde047' : 'rgba(80,68,50,0.45)';
      ctx.lineWidth = 0.15;
      ctx.stroke();
      return true;
    }
    case 'tree_big':
    case 'tree_small': {
      const r = w / 2;
      shadow(-r * 0.5, r, r * 0.85);
      const n = equip.visualType === 'tree_big' ? 7 : 4;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + seed();
        const dist = i === 0 ? 0 : r * 0.45;
        circle(Math.cos(a) * dist, Math.sin(a) * dist, r * 0.55, i % 2 ? '#2F4A22' : '#3A5A2A');
      }
      if (isSelected || isHovered) circle(0, 0, r, 'rgba(0,0,0,0)', outline, 0.25);
      return true;
    }
    case 'palm': {
      const k = w / 5;
      shadow(-1.5 * k, 2 * k, 1.6 * k, 0.2);
      ctx.strokeStyle = '#5C7A34';
      ctx.lineWidth = 0.35 * k;
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(Math.cos(a) * 1.2 * k, Math.sin(a) * 1.2 * k, Math.cos(a + 0.3) * 2.4 * k, Math.sin(a + 0.3) * 2.4 * k);
        ctx.stroke();
      }
      circle(0, 0, 0.35, '#6B543C', isSelected ? '#fde047' : undefined, 0.2);
      return true;
    }
    case 'building':
    case 'cabin':
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(-hw - 1.2, -hd, w, d);
      rect(equip.visualType === 'building' ? '#E8E6E1' : '#F1F1EE', isSelected ? '#fde047' : '#A8A29E', 0.25);
      return true;
    case 'shade_shed':
    case 'open_shelter':
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.fillRect(-hw - 1, -hd, w, d);
      rect(equip.color, isSelected ? '#fde047' : '#8B8F94', 0.2);
      ctx.strokeStyle = 'rgba(80,84,90,0.5)';
      ctx.lineWidth = 0.08;
      for (let x = -hw + 1; x < hw; x += 1) {
        ctx.beginPath();
        ctx.moveTo(x, -hd);
        ctx.lineTo(x, hd);
        ctx.stroke();
      }
      if (equip.visualType === 'open_shelter') {
        ctx.fillStyle = '#F3F4F6';
        ctx.fillRect(-hw, -hd, w, 0.35);
      }
      return true;
    case 'gazebo':
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.fillRect(-hw - 0.6, -hd, w, d);
      rect(equip.color, isSelected ? '#fde047' : 'rgba(0,0,0,0.25)', 0.1);
      ctx.strokeStyle = 'rgba(0,0,0,0.2)';
      ctx.lineWidth = 0.06;
      ctx.beginPath();
      ctx.moveTo(-hw, -hd);
      ctx.lineTo(hw, hd);
      ctx.moveTo(hw, -hd);
      ctx.lineTo(-hw, hd);
      ctx.stroke();
      return true;
    case 'floodlight':
    case 'light_pole': {
      const big = equip.visualType === 'floodlight';
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = big ? 0.3 : 0.18;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-h * 0.5, 0);
      ctx.stroke();
      circle(0, 0, big ? 0.45 : 0.3, '#9CA3AF', isSelected ? '#fde047' : '#374151', 0.12);
      if (big) {
        ctx.fillStyle = '#F8FAFC';
        ctx.fillRect(-0.9, -0.2, 1.8, 0.4);
      }
      return true;
    }
    case 'mast': {
      ctx.strokeStyle = 'rgba(0,0,0,0.2)';
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-h * 0.5, 0);
      ctx.stroke();
      ctx.strokeStyle = isSelected ? '#fde047' : '#DC2626';
      ctx.lineWidth = 0.18;
      ctx.strokeRect(-hw, -hd, w, d);
      ctx.beginPath();
      ctx.moveTo(-hw, -hd);
      ctx.lineTo(hw, hd);
      ctx.moveTo(hw, -hd);
      ctx.lineTo(-hw, hd);
      ctx.strokeStyle = '#F8FAFC';
      ctx.stroke();
      return true;
    }
    case 'wreck':
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(-hw - 1, -hd, w, d);
      rect('#2E2A24');
      ctx.fillStyle = '#5C5A3A';
      ctx.fillRect(-hw * 0.8, -hd * 0.85, w * 0.8, d * 0.8);
      ctx.fillStyle = '#7A4A2A';
      ctx.fillRect(-hw * 0.8, -hd * 0.85, w * 0.8, 0.5);
      ctx.fillRect(-hw * 0.8, hd * 0.75 - 0.5, w * 0.8, 0.5);
      if (isSelected || isHovered) {
        ctx.strokeStyle = outline;
        ctx.lineWidth = 0.2;
        ctx.strokeRect(-hw, -hd, w, d);
      }
      return true;
    case 'double_arch':
      ctx.fillStyle = isSelected ? '#fde047' : '#3A3F44';
      ctx.fillRect(-hw, -0.15, w, 0.3);
      for (const x of [-hw, 0, hw]) circle(x, 0, 0.25, '#B91C1C');
      return true;
    case 'tyre':
      circle(0, 0, hw, '#1F2937', isSelected ? '#fde047' : undefined, 0.15);
      circle(0, 0, hw * 0.45, '#B3A58E');
      return true;
    case 'cable_drum':
      ctx.fillStyle = '#8B5A2B';
      ctx.fillRect(-hw, -hd, w, d);
      ctx.strokeStyle = isSelected ? '#fde047' : '#5B3A1C';
      ctx.lineWidth = 0.12;
      ctx.strokeRect(-hw, -hd, w, d);
      return true;
    case 'jeep':
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.fillRect(-hw - 0.6, -hd, w, d);
      rect('#6B5B3E', isSelected ? '#fde047' : '#3F3A30', 0.12);
      ctx.fillStyle = '#151515';
      for (const y of [-d * 0.33, d * 0.33]) for (const x of [-hw, hw - 0.25]) ctx.fillRect(x, y - 0.35, 0.25, 0.7);
      return true;
    case 'flagpole': {
      circle(0, 0, 0.15, '#E5E7EB', isSelected ? '#fde047' : '#6b7280', 0.08);
      const img = item.logos?.flag ? cachedLogoImage(item.logos.flag) : null;
      if (img) {
        ctx.save();
        ctx.globalAlpha = 0.95;
        ctx.drawImage(img, 0.2, -0.45, 1.8, 0.9);
        ctx.restore();
      } else {
        ctx.fillStyle = '#E5E7EB';
        ctx.fillRect(0.2, -0.45, 1.8, 0.9);
      }
      return true;
    }
    default:
      return false;
  }
}
