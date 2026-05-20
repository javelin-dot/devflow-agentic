/** Must match server `FS_ROOTS` — virtual path listing Windows drive letters. */
export const FS_ROOTS = '__roots__';

export function splitPathSegments(path: string): string[] {
  if (path === FS_ROOTS) return [];
  const normalized = path.replace(/\\/g, '/');
  const win = normalized.match(/^([A-Za-z]:)\/?(.*)$/);
  if (win) {
    const rest = win[2] ? win[2].split('/').filter(Boolean) : [];
    return [win[1], ...rest];
  }
  return normalized.split('/').filter(Boolean);
}

export function pathThroughSegments(segments: string[], endIndex: number): string {
  if (segments.length === 0) return FS_ROOTS;
  const drive = segments[0];
  if (/^[A-Za-z]:$/.test(drive)) {
    const rest = segments.slice(1, endIndex + 1);
    if (rest.length === 0) return `${drive}\\`;
    return `${drive}\\${rest.join('\\')}`;
  }
  return '/' + segments.slice(0, endIndex + 1).join('/');
}

export function formatDirEntryName(dir: string, isRoots: boolean): string {
  if (isRoots) {
    const m = dir.match(/^([A-Za-z]):/);
    return m ? `本地磁盘 (${m[1]}:)` : dir;
  }
  const parts = dir.replace(/\\/g, '/').split('/').filter(Boolean);
  return parts[parts.length - 1] ?? dir;
}

export function formatPathLabel(path: string | undefined, isRoots: boolean): string {
  if (!path || isRoots) return '此电脑';
  return path;
}
