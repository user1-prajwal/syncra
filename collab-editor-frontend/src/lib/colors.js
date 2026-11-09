// Colours arrive from other clients over the WebSocket and end up inside CSS text (remote cursor labels).
// Only a small set of well-formed values is accepted so a collaborator cannot inject CSS.

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const RGB = /^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(?:,\s*(?:0|1|0?\.\d+)\s*)?\)$/i;
const HSL = /^hsla?\(\s*\d{1,3}(?:\.\d+)?\s*,\s*\d{1,3}(?:\.\d+)?%\s*,\s*\d{1,3}(?:\.\d+)?%\s*(?:,\s*(?:0|1|0?\.\d+)\s*)?\)$/i;
const NAMED = /^[a-z]{3,20}$/i;

export const FALLBACK_COLOR = '#8b949e';

export function safeColor(value, fallback = FALLBACK_COLOR) {
  if (typeof value !== 'string') return fallback;
  const v = value.trim();
  return HEX.test(v) || RGB.test(v) || HSL.test(v) || NAMED.test(v) ? v : fallback;
}

function hslToRgb(h, s, l) {
  const sat = s / 100;
  const light = l / 100;
  const k = (n) => (n + h / 30) % 12;
  const a = sat * Math.min(light, 1 - light);
  const f = (n) => light - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [255 * f(0), 255 * f(8), 255 * f(4)];
}

function toRgb(color) {
  const v = String(color).trim();
  if (HEX.test(v)) {
    const h = v.slice(1);
    const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
    return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
  }
  const nums = v.match(/[\d.]+/g)?.map(Number);
  if (!nums || nums.length < 3) return null;
  if (/^rgb/i.test(v)) return nums.slice(0, 3);
  if (/^hsl/i.test(v)) return hslToRgb(nums[0], nums[1], nums[2]);
  return null;
}

function channel(v) {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

/** Black or white, whichever has more contrast against `color`. */
export function readableTextColor(color) {
  const rgb = toRgb(color);
  if (!rgb) return '#ffffff';
  const luminance = 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
  return luminance > 0.18 ? '#0b0f14' : '#ffffff';
}
