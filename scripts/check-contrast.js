'use strict';

const fs = require('node:fs');
const path = require('node:path');

const css = fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8');
const root = css.match(/:root\s*\{([^}]+)\}/);

if (!root) {
  console.error('Contrast audit failed: CSS :root token block was not found.');
  process.exit(1);
}

const tokens = new Map();
for (const match of root[1].matchAll(/(--[\w-]+)\s*:\s*(#[\da-fA-F]{3,8})\s*;/g)) {
  tokens.set(match[1], match[2]);
}

function resolveColor(value) {
  const token = value.match(/^var\((--[\w-]+)\)$/);
  const color = token ? tokens.get(token[1]) : value;
  if (!color || !/^#[\da-fA-F]{6}$/.test(color)) {
    throw new Error(`Unsupported or missing color: ${value}`);
  }
  return color;
}

function luminance(value) {
  const channels = resolveColor(value).slice(1).match(/../g).map((channel) => parseInt(channel, 16) / 255);
  const linear = channels.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrastRatio(foreground, background) {
  const first = luminance(foreground);
  const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

const checks = [
  { name: 'body text on application background', foreground: 'var(--ink)', background: 'var(--bg)', minimum: 4.5 },
  { name: 'body text on card', foreground: 'var(--ink)', background: 'var(--card)', minimum: 4.5 },
  { name: 'muted text on card', foreground: 'var(--muted)', background: 'var(--card)', minimum: 4.5 },
  { name: 'muted text on application background', foreground: 'var(--muted)', background: 'var(--bg)', minimum: 4.5 },
  { name: 'primary button label', foreground: '#ffffff', background: 'var(--brand)', minimum: 4.5 },
  { name: 'default navigation label', foreground: '#d6e0e8', background: 'var(--brand)', minimum: 4.5 },
  { name: 'active navigation label', foreground: '#ffffff', background: 'var(--nav-active)', minimum: 4.5 },
  { name: 'error text on white', foreground: 'var(--bad)', background: '#ffffff', minimum: 4.5 },
  { name: 'success badge text', foreground: 'var(--ok)', background: '#e3f3ea', minimum: 4.5 },
  { name: 'danger badge text', foreground: 'var(--bad)', background: '#fbe4e2', minimum: 4.5 },
  { name: 'warning badge text', foreground: 'var(--warn)', background: '#fff1cf', minimum: 4.5 },
  { name: 'warning banner text', foreground: '#5c4400', background: '#fff4d6', minimum: 4.5 },
  { name: 'error toast text', foreground: '#ffffff', background: 'var(--bad)', minimum: 4.5 },
  { name: 'success toast text', foreground: '#ffffff', background: 'var(--ok)', minimum: 4.5 },
  { name: 'chart bar against chart track', foreground: 'var(--brand)', background: '#eef1f4', minimum: 3 },
  { name: 'chart hover accent against chart track', foreground: 'var(--accent)', background: '#eef1f4', minimum: 3 },
  { name: 'general focus outline on white control', foreground: 'var(--focus)', background: '#ffffff', minimum: 3 },
  { name: 'navigation focus outline on brand surface', foreground: '#f3d17c', background: 'var(--brand)', minimum: 3 },
  { name: 'navigation focus outline on active item', foreground: '#f3d17c', background: 'var(--nav-active)', minimum: 3 },
];

let failures = 0;
for (const check of checks) {
  try {
    const ratio = contrastRatio(check.foreground, check.background);
    const passed = ratio >= check.minimum;
    console.log(`${passed ? 'PASS' : 'FAIL'} ${check.name}: ${ratio.toFixed(2)}:1 (minimum ${check.minimum}:1)`);
    if (!passed) failures += 1;
  } catch (error) {
    console.error(`FAIL ${check.name}: ${error.message}`);
    failures += 1;
  }
}

if (failures) {
  console.error(`Contrast audit failed: ${failures} of ${checks.length} documented color-pair checks did not meet their threshold.`);
  process.exit(1);
}

console.log(`Contrast audit passed: all ${checks.length} documented color-pair checks meet their thresholds.`);
