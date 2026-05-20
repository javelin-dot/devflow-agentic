import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const VERSIONS = JSON.parse(readFileSync(join(__dirname, 'node-versions.json'), 'utf8'));

/** @returns {'windows' | 'darwin' | 'linux' | 'default'} */
function platformKey() {
  if (process.platform === 'win32') return 'windows';
  if (process.platform === 'darwin') return 'darwin';
  if (process.platform === 'linux') return 'linux';
  return 'default';
}

export function getProfile() {
  const key = platformKey();
  const nodeVersion = VERSIONS[key] ?? VERSIONS.default;
  return {
    platform: key,
    nodeVersion,
    env: {
      PUPPETEER_SKIP_DOWNLOAD: 'true',
      DEVFLOW_NODE_PROFILE: key,
    },
  };
}

export function expectedNodeMajor() {
  return parseInt(getProfile().nodeVersion, 10);
}

export function currentNodeMajor() {
  return parseInt(process.version.slice(1).split('.')[0], 10);
}
