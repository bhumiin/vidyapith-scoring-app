#!/usr/bin/env node
/**
 * token-audit.mjs — what the restyle still has to convert
 *
 * The design tokens live in the :root block at the top of styles.css. This script
 * answers three questions while the screens are migrated one by one:
 *
 *   - which tokens are defined, and which of those nothing uses yet
 *   - which var(--…) references point at a token that does not exist (a typo)
 *   - how many literal colours are still written into rules
 *
 * Usage:  node scripts/token-audit.mjs [--verbose]
 * Exit:   0 normally, 1 if a rule references an undefined token.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const cssPath = join(here, '..', 'styles.css');
const css = readFileSync(cssPath, 'utf8');

const rootMatch = css.match(/:root\s*\{([\s\S]*?)\}/);
if (!rootMatch) {
    console.error('no :root block found in styles.css');
    process.exit(1);
}
const rootBlock = rootMatch[1];
const outside = css.slice(0, rootMatch.index) + css.slice(rootMatch.index + rootMatch[0].length);

const defined = [...rootBlock.matchAll(/(--[a-z0-9-]+)\s*:/g)].map(m => m[1]);
const used = [...outside.matchAll(/var\((--[a-z0-9-]+)/g)].map(m => m[1]);
const definedSet = new Set(defined);
const usedSet = new Set(used);

const unknown = [...usedSet].filter(t => !definedSet.has(t));
const unused = [...definedSet].filter(t => !usedSet.has(t));

const hex = [...outside.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map(m => m[0].toLowerCase());
const rgb = [...outside.matchAll(/\brgba?\([^)]*\)/g)].map(m => m[0].replace(/\s+/g, ''));
const gradients = [...outside.matchAll(/linear-gradient\([^;]+/g)].length;

const byValue = new Map();
for (const c of [...hex, ...rgb]) byValue.set(c, (byValue.get(c) || 0) + 1);
const top = [...byValue.entries()].sort((a, b) => b[1] - a[1]);

console.log(`tokens defined            ${defined.length}`);
console.log(`tokens referenced         ${usedSet.size}`);
console.log(`literals outside :root    ${hex.length} hex, ${rgb.length} rgb(a), ${gradients} gradient(s)`);
console.log(`distinct literal colours  ${byValue.size}`);
console.log('');
console.log('most repeated literals (each is a candidate for a token):');
for (const [value, n] of top.slice(0, 12)) console.log(`  ${String(n).padStart(3)}  ${value}`);

if (unused.length) {
    console.log('');
    console.log(`defined but not used yet (${unused.length}) — expected until step 4:`);
    console.log('  ' + unused.join(' '));
}

if (unknown.length) {
    console.log('');
    console.log(`UNDEFINED token references (${unknown.length}):`);
    for (const t of unknown) console.log(`  ${t}`);
    process.exit(1);
}
