export function hexToRgb(hex) {
  const h = String(hex).replace("#", "").trim();
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

export function rgbToHex(r, g, b) {
  return (
    "#" +
    [r, g, b]
      .map((n) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase()
  );
}

function channel(c) {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex) {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrast(a, b) {
  const l1 = luminance(a);
  const l2 = luminance(b);
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

export function mix(a, b, t) {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  return rgbToHex(
    ...A.map((v, i) => Math.round(v + (B[i] - v) * t)),
  );
}

export function readableOn(color, backgrounds, min = 4.5) {
  const passes = (c) => backgrounds.every((bg) => contrast(c, bg) >= min);
  if (passes(color)) return color;
  for (let i = 1; i <= 48; i += 1) {
    const darker = mix(color, "#000000", i / 48);
    if (passes(darker)) return darker;
  }
  for (let i = 1; i <= 48; i += 1) {
    const lighter = mix(color, "#FFFFFF", i / 48);
    if (passes(lighter)) return lighter;
  }
  return color;
}

export function inkFor(fill, preferred, alternate) {
  const a = contrast(preferred, fill);
  const b = contrast(alternate, fill);
  return a >= b ? preferred : alternate;
}

export function controlColor(from, toward, backgrounds, min = 3) {
  for (let i = 0; i <= 24; i += 1) {
    const c = mix(from, toward, i / 24);
    if (backgrounds.every((bg) => contrast(c, bg) >= min)) return c;
  }
  return toward;
}
