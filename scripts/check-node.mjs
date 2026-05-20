#!/usr/bin/env node
import { getProfile, currentNodeMajor, expectedNodeMajor } from './node-profile.mjs';

const profile = getProfile();
const expected = expectedNodeMajor();
const current = currentNodeMajor();

if (current === expected) {
  process.exit(0);
}

console.warn(
  [
    '',
    `[devflow] Node version mismatch on ${profile.platform}.`,
    `  Expected: ${expected}.x (see scripts/node-versions.json)`,
    `  Current:  ${process.version}`,
    '',
    '  Fix:',
    '    npm run setup:node',
    '  Or with fnm:',
    `    fnm install ${profile.nodeVersion} && fnm use ${profile.nodeVersion}`,
    '',
  ].join('\n'),
);

process.exit(0);
