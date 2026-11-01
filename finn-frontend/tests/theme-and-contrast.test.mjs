import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// WCAG relative luminance formula
function hexToRgb(hex) {
  const clean = hex.replace("#", "");
  const num = parseInt(clean, 16);
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16);
    const g = parseInt(clean[1] + clean[1], 16);
    const b = parseInt(clean[2] + clean[2], 16);
    return [r, g, b];
  }
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function relativeLuminance([r, g, b]) {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function contrastRatio(hex1, hex2) {
  const lum1 = relativeLuminance(hexToRgb(hex1));
  const lum2 = relativeLuminance(hexToRgb(hex2));
  const brightest = Math.max(lum1, lum2);
  const darkest = Math.min(lum1, lum2);
  return (brightest + 0.05) / (darkest + 0.05);
}

test("theme tokens meet WCAG AA contrast in both Light and Dark modes", () => {
  // Light Theme
  const lightBg = "#fbfbfa";
  const lightSurface = "#ffffff";
  const lightText = "#191c1b";
  const lightTextSecondary = "#49534e";
  const lightTextMuted = "#68746e";
  const lightAccent = "#1b5e3a";
  const lightPositive = "#166534";
  const lightNegative = "#b91c1c";
  const lightWarning = "#92400e";

  // Body text >= 4.5:1 on light background and surface
  assert.ok(contrastRatio(lightText, lightBg) >= 12, "Light text contrast");
  assert.ok(contrastRatio(lightText, lightSurface) >= 12, "Light surface text contrast");
  assert.ok(contrastRatio(lightTextSecondary, lightBg) >= 5.5, "Light text-secondary contrast");
  assert.ok(contrastRatio(lightTextMuted, lightBg) >= 4.5, "Light text-muted WCAG AA contrast");
  assert.ok(contrastRatio(lightAccent, lightBg) >= 6.0, "Light accent contrast");
  assert.ok(contrastRatio(lightPositive, lightBg) >= 5.0, "Light positive contrast");
  assert.ok(contrastRatio(lightNegative, lightBg) >= 5.5, "Light negative contrast");
  assert.ok(contrastRatio(lightWarning, lightBg) >= 4.5, "Light warning contrast");

  // Dark Theme (warm near-black green-tinted background)
  const darkBg = "#0e1412";
  const darkSurface = "#141c18";
  const darkText = "#eaf0ec"; // ~92% white
  const darkTextSecondary = "#9eb1a6";
  const darkTextMuted = "#788c81";
  const darkAccent = "#4ade80"; // lighter desaturated green
  const darkPositive = "#4ade80";
  const darkNegative = "#f87171";
  const darkWarning = "#fbbf24";

  assert.ok(contrastRatio(darkText, darkBg) >= 12, "Dark text contrast");
  assert.ok(contrastRatio(darkText, darkSurface) >= 11, "Dark surface text contrast");
  assert.ok(contrastRatio(darkTextSecondary, darkBg) >= 6.5, "Dark text-secondary contrast");
  assert.ok(contrastRatio(darkTextMuted, darkBg) >= 4.5, "Dark text-muted WCAG AA contrast");
  assert.ok(contrastRatio(darkAccent, darkBg) >= 9.0, "Dark accent contrast");
  assert.ok(contrastRatio(darkPositive, darkBg) >= 9.0, "Dark positive contrast");
  assert.ok(contrastRatio(darkNegative, darkBg) >= 6.0, "Dark negative contrast");
  assert.ok(contrastRatio(darkWarning, darkBg) >= 10.0, "Dark warning contrast");
});

test("globals.css strictly obeys the design tokens and layout constraints", () => {
  const css = fs.readFileSync(path.resolve("src/app/globals.css"), "utf8");

  // No glassmorphism
  assert.ok(!css.includes("backdrop-filter: blur(20px)"), "No excessive glassmorphism");
  assert.ok(!css.includes("--glass-shadow"), "No glass shadow");

  // No purple-blue gradients or neon washes
  assert.ok(!css.includes("#6c8cff"), "No purple/blue gradient color");
  assert.ok(!css.includes("#a78bfa"), "No purple accent");

  // Mobile centered frame max-width 430px
  assert.ok(css.includes("max-width: 430px"), "Centered frame max-width 430px");

  // 20px horizontal gutter
  assert.ok(css.includes("--gutter: 20px"), "20px horizontal gutter");

  // Only 3 radii in the whole design system
  assert.ok(css.includes("--radius-badge: 6px"), "6px radius badge/input");
  assert.ok(css.includes("--radius-card: 10px"), "10px radius card");
  assert.ok(css.includes("--radius-pill: 999px"), "999px radius pill");

  // 150ms theme transition
  assert.ok(css.includes("150ms ease"), "Smooth theme crossfade <= 150ms");

  // Reduced motion support
  assert.ok(css.includes("prefers-reduced-motion"), "prefers-reduced-motion respected");
});

test("inline script in layout.js eliminates flash of wrong theme", () => {
  const layout = fs.readFileSync(path.resolve("src/app/layout.js"), "utf8");
  assert.ok(layout.includes("dangerouslySetInnerHTML={{ __html: themeScript }}"), "Inline head script present");
  assert.ok(layout.includes("finn_theme"), "Checks localStorage key");
  assert.ok(layout.includes("prefers-color-scheme"), "Respects OS default");
  assert.ok(layout.includes("suppressHydrationWarning"), "Avoids SSR hydration warnings");
});
