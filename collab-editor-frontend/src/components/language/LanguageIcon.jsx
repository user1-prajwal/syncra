import { useState } from 'react';
import { getLanguage } from '../../config/languages';
import { readableTextColor } from '../../lib/colors';

/**
 * Brand image from /public/lang_icons; falls back to a solid glyph chip when the image is missing,
 * so a wrong or absent file can never leave an empty slot.
 */
export default function LanguageIcon({ id, size = 16 }) {
  const lang = getLanguage(id);
  const [failedSrc, setFailedSrc] = useState(null);
  const useImage = lang.icon && failedSrc !== lang.icon;

  if (useImage) {
    return (
      <img
        className="sx-langicon"
        src={lang.icon}
        alt=""
        width={size}
        height={size}
        draggable={false}
        onError={() => setFailedSrc(lang.icon)}
      />
    );
  }
  return (
    <span
      className="sx-langicon sx-langicon--glyph"
      style={{
        width: size,
        height: size,
        background: lang.color,
        color: readableTextColor(lang.color),
        fontSize: Math.max(6, Math.round(size * (lang.glyph.length > 2 ? 0.34 : 0.46))),
      }}
      aria-hidden="true"
    >
      {lang.glyph}
    </span>
  );
}
