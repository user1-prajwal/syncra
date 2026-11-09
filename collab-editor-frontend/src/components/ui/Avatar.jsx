import { readableTextColor, safeColor } from '../../lib/colors';

export default function Avatar({ name, color, size = 22 }) {
  const background = safeColor(color);
  const initial = Array.from((name || '?').trim())[0]?.toUpperCase() ?? '?';
  return (
    <span
      className="sx-avatar"
      style={{ width: size, height: size, background, color: readableTextColor(background), fontSize: Math.round(size * 0.46) }}
      aria-hidden="true"
    >
      {initial}
    </span>
  );
}
