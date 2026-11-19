// The 60·30·10 palettes (base / support / accent), plus the app's original look.
import { COASTAL_SUNSET } from './coastalSunset';
// 60% base → backgrounds and panels · 30% support → text and main content · 10% accent → active
// buttons, highlights and the race line.

export interface Palette {
  id: string;
  name: string;
  mood: string;
  base: string; // 60%
  support: string; // 30%
  accent: string; // 10%
}

export const DEFAULT_THEME_ID = 'classic';

export const PALETTES: Palette[] = [
  { id: 'classic', name: 'Classic Night', mood: 'The original look', base: '#0f172b', support: '#f1f5f9', accent: '#00bcff' },
  { id: 'sky-fresh', name: 'Sky Fresh', mood: 'Light, clean', base: '#52C5FF', support: '#FFFFFF', accent: '#FF1088' },
  { id: 'petrol-gaming', name: 'Petrol Gaming', mood: 'Dark, premium', base: '#062C30', support: '#E5D4B8', accent: '#FF4E00' },
  { id: 'monochrome-brown', name: 'Monochrome Brown', mood: 'Warm, classic', base: '#3D231A', support: '#F3EBDD', accent: '#00F0FF' },
  { id: 'teal-brand', name: 'Teal Brand', mood: 'Dark, bold', base: '#0B434C', support: '#FFFFFF', accent: '#FF5533' },
  { id: 'midnight-neon', name: 'Midnight Neon', mood: 'Dark, tech', base: '#0A0A0A', support: '#FFFFFF', accent: '#55FF00' },
  { id: 'navy-idea', name: 'Navy Idea', mood: 'Dark, serious', base: '#031326', support: '#FFFFFF', accent: '#D100D1' },
  { id: 'mauve-loud', name: 'Mauve Loud', mood: 'Warm, playful', base: '#913768', support: '#C29A74', accent: '#FDD001' },
  { id: 'olive-standout', name: 'Olive Standout', mood: 'Warm, earthy', base: '#778A3F', support: '#6E4B2C', accent: '#F16619' },
  { id: 'brick-hook', name: 'Brick Hook', mood: 'Warm, confident', base: '#C15B46', support: '#ABA6A3', accent: '#45DBE1' },
  COASTAL_SUNSET.palette,
];
