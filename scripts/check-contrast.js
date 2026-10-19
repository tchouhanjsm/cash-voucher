'use strict';

const fs = require('node:fs');
const path = require('node:path');

const css = fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8');
const root = css.match(/:root\s*\{([^}]+)\}/);
const darkRoot = css.match(/:root\[data-theme=['"]dark['"]\]\s*\{([^}]+)\}/);
const paletteRoots = {
  blush: css.match(/:root:not\(\[data-theme=['"]dark['"]\]\)\[data-palette=['"]blush['"]\]\s*\{([^}]+)\}/),
  mint: css.match(/:root:not\(\[data-theme=['"]dark['"]\]\)\[data-palette=['"]mint['"]\]\s*\{([^}]+)\}/),
};

if (!root || !darkRoot || !paletteRoots.blush || !paletteRoots.mint) {
  console.error('Contrast audit failed: default, dark, blush and mint token blocks are required.');
  process.exit(1);
}

const tokenPattern = /(--[\w-]+)\s*:\s*(#[\da-fA-F]{3,8})\s*;/g;

function extractTokens(block) {
  const palette = new Map();
  for (const match of block.matchAll(tokenPattern)) palette.set(match[1], match[2]);
  return palette;
}

const tokens = extractTokens(root[1]);
const darkTokens = extractTokens(darkRoot[1]);
const lightPalettes = { sky: tokens };
for (const [name, block] of Object.entries(paletteRoots)) {
  lightPalettes[name] = new Map([...tokens, ...extractTokens(block[1])]);
}

function resolveColor(value, palette = tokens) {
  const token = value.match(/^var\((--[\w-]+)\)$/);
  const color = token ? palette.get(token[1]) : value;

  if (!color || !/^#(?:[\da-fA-F]{3}|[\da-fA-F]{6})$/.test(color)) {
    throw new Error(`Unsupported or missing color: ${value}`);
  }

  if (color.length === 4) {
    return `#${[...color.slice(1)].map((channel) => channel + channel).join('')}`;
  }

  return color;
}

function luminance(value, palette = tokens) {
  const channels = resolveColor(value, palette)
    .slice(1)
    .match(/../g)
    .map((channel) => parseInt(channel, 16) / 255);
  const linear = channels.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );

  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrastRatio(foreground, background, palette = tokens) {
  const first = luminance(foreground, palette);
  const second = luminance(background, palette);

  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

const checks = [
  {
    name: 'body text on application background',
    foreground: 'var(--ink)',
    background: 'var(--bg)',
    minimum: 4.5,
  },
  {
    name: 'body text on card',
    foreground: 'var(--ink)',
    background: 'var(--card)',
    minimum: 4.5,
  },
  {
    name: 'muted text on card',
    foreground: 'var(--muted)',
    background: 'var(--card)',
    minimum: 4.5,
  },
  {
    name: 'muted text on application background',
    foreground: 'var(--muted)',
    background: 'var(--bg)',
    minimum: 4.5,
  },
  {
    name: 'primary button label',
    foreground: '#ffffff',
    background: 'var(--brand)',
    minimum: 4.5,
  },
  {
    name: 'default navigation label on light navigation surface',
    foreground: 'var(--nav-muted)',
    background: 'var(--nav-bg)',
    minimum: 4.5,
  },
  {
    name: 'active navigation label on selected surface',
    foreground: 'var(--nav-active-ink)',
    background: 'var(--nav-active)',
    minimum: 4.5,
  },
  {
    name: 'error text on white',
    foreground: 'var(--bad)',
    background: '#ffffff',
    minimum: 4.5,
  },
  {
    name: 'success badge text',
    foreground: 'var(--ok)',
    background: '#e3f3ea',
    minimum: 4.5,
  },
  {
    name: 'danger badge text',
    foreground: 'var(--bad)',
    background: '#fbe4e2',
    minimum: 4.5,
  },
  {
    name: 'warning badge text',
    foreground: 'var(--warn)',
    background: '#fff1cf',
    minimum: 4.5,
  },
  {
    name: 'warning banner text',
    foreground: '#5c4400',
    background: '#fff4d6',
    minimum: 4.5,
  },
  {
    name: 'error toast text',
    foreground: '#ffffff',
    background: 'var(--bad)',
    minimum: 4.5,
  },
  {
    name: 'success toast text',
    foreground: '#ffffff',
    background: 'var(--ok)',
    minimum: 4.5,
  },
  {
    name: 'chart bar against chart track',
    foreground: 'var(--chart-bar)',
    background: 'var(--surface-muted)',
    minimum: 3,
  },
  {
    name: 'chart hover accent against chart track',
    foreground: 'var(--accent)',
    background: 'var(--surface-muted)',
    minimum: 3,
  },
  {
    name: 'general focus outline on white control',
    foreground: 'var(--focus)',
    background: '#ffffff',
    minimum: 3,
  },
  {
    name: 'navigation focus outline on light sidebar',
    foreground: 'var(--focus-on-brand)',
    background: 'var(--nav-bg)',
    minimum: 3,
  },
  {
    name: 'navigation focus outline on active item',
    foreground: 'var(--focus-on-brand)',
    background: 'var(--nav-active)',
    minimum: 3,
  },
];

let failures = 0;

for (const check of checks) {
  try {
    const ratio = contrastRatio(check.foreground, check.background);
    const passed = ratio >= check.minimum;
    const status = passed ? 'PASS' : 'FAIL';

    console.log(`${status} ${check.name}: ${ratio.toFixed(2)}:1 ` + `(minimum ${check.minimum}:1)`);

    if (!passed) failures += 1;
  } catch (error) {
    console.error(`FAIL ${check.name}: ${error.message}`);
    failures += 1;
  }
}

for (const [paletteName, paletteTokens] of Object.entries(lightPalettes)) {
  if (paletteName === 'sky') continue;

  for (const check of checks) {
    try {
      const ratio = contrastRatio(check.foreground, check.background, paletteTokens);
      const passed = ratio >= check.minimum;
      const status = passed ? 'PASS' : 'FAIL';

      console.log(
        `${status} ${paletteName} theme — ${check.name}: ${ratio.toFixed(2)}:1 ` +
          `(minimum ${check.minimum}:1)`,
      );

      if (!passed) failures += 1;
    } catch (error) {
      console.error(`FAIL ${paletteName} theme — ${check.name}: ${error.message}`);
      failures += 1;
    }
  }
}

const darkChecks = [
  {
    name: 'body text on dark application background',
    foreground: 'var(--ink)',
    background: 'var(--bg)',
    minimum: 4.5,
  },
  {
    name: 'body text on dark card',
    foreground: 'var(--ink)',
    background: 'var(--card)',
    minimum: 4.5,
  },
  {
    name: 'muted text on dark card',
    foreground: 'var(--muted)',
    background: 'var(--card)',
    minimum: 4.5,
  },
  {
    name: 'muted text on dark application background',
    foreground: 'var(--muted)',
    background: 'var(--bg)',
    minimum: 4.5,
  },
  {
    name: 'dark primary button label',
    foreground: '#ffffff',
    background: 'var(--brand)',
    minimum: 4.5,
  },
  {
    name: 'dark default navigation label',
    foreground: 'var(--nav-muted)',
    background: 'var(--nav-bg)',
    minimum: 4.5,
  },
  {
    name: 'dark active navigation label',
    foreground: 'var(--nav-active-ink)',
    background: 'var(--nav-active)',
    minimum: 4.5,
  },
  {
    name: 'dark error text on card',
    foreground: 'var(--bad)',
    background: 'var(--card)',
    minimum: 4.5,
  },
  {
    name: 'dark success badge text',
    foreground: 'var(--ok)',
    background: 'var(--surface-success)',
    minimum: 4.5,
  },
  {
    name: 'dark danger badge text',
    foreground: 'var(--bad)',
    background: 'var(--surface-danger)',
    minimum: 4.5,
  },
  {
    name: 'dark warning badge text',
    foreground: 'var(--warn)',
    background: 'var(--surface-warning)',
    minimum: 4.5,
  },
  {
    name: 'dark warning banner text',
    foreground: 'var(--warning-ink)',
    background: 'var(--surface-warning)',
    minimum: 4.5,
  },
  {
    name: 'dark error toast label',
    foreground: 'var(--status-ink)',
    background: 'var(--bad)',
    minimum: 4.5,
  },
  {
    name: 'dark success toast label',
    foreground: 'var(--status-ink)',
    background: 'var(--ok)',
    minimum: 4.5,
  },
  {
    name: 'dark chart bar against its track',
    foreground: 'var(--chart-bar)',
    background: 'var(--surface-muted)',
    minimum: 3,
  },
  {
    name: 'dark chart hover accent against its track',
    foreground: 'var(--accent)',
    background: 'var(--surface-muted)',
    minimum: 3,
  },
  {
    name: 'dark focus outline on control',
    foreground: 'var(--focus)',
    background: 'var(--control-bg)',
    minimum: 3,
  },
  {
    name: 'dark navigation focus outline',
    foreground: 'var(--focus-on-brand)',
    background: 'var(--nav-bg)',
    minimum: 3,
  },
  {
    name: 'dark navigation focus outline on active item',
    foreground: 'var(--focus-on-brand)',
    background: 'var(--nav-active)',
    minimum: 3,
  },
];

for (const check of darkChecks) {
  try {
    const ratio = contrastRatio(check.foreground, check.background, darkTokens);
    const passed = ratio >= check.minimum;
    const status = passed ? 'PASS' : 'FAIL';

    console.log(`${status} ${check.name}: ${ratio.toFixed(2)}:1 (minimum ${check.minimum}:1)`);

    if (!passed) failures += 1;
  } catch (error) {
    console.error(`FAIL ${check.name}: ${error.message}`);
    failures += 1;
  }
}

const totalChecks = checks.length * Object.keys(lightPalettes).length + darkChecks.length;

if (failures) {
  console.error(
    `Contrast audit failed: ${failures} of ${totalChecks} ` +
      'documented color-pair checks did not meet their threshold.',
  );
  process.exit(1);
}

console.log(
  `Contrast audit passed: all ${totalChecks} documented color-pair checks meet their thresholds ` +
    'across sky, blush, mint and dark themes.',
);
