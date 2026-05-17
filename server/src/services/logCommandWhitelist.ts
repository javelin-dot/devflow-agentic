const ALLOWED_COMMANDS = new Set([
  'tail','grep','awk','sed','cat','ls','find','wc','head','sort','uniq',
  'cut','du','df','ps','stat','echo','date','hostname','uname','uptime',
  'free','journalctl','systemctl','netstat','ss','lsof',
]);

const FORBIDDEN_PATTERNS = [
  />/,
  /;/,
  /&&/,
  /\|\|/,
  /\$\(/,
  /`/,
];

export interface CheckResult {
  allowed: boolean;
  reason?: string;
}

export function checkCommand(cmd: string): CheckResult {
  const trimmed = cmd.trim();
  if (!trimmed) return { allowed: false, reason: 'empty command' };
  const base = trimmed.split(/\s+/)[0];
  if (!ALLOWED_COMMANDS.has(base)) return { allowed: false, reason: `'${base}' not in whitelist` };
  const withoutSingleQuoted = trimmed.replace(/'[^']*'/g, "''");
  for (const pat of FORBIDDEN_PATTERNS) {
    if (pat.test(withoutSingleQuoted)) return { allowed: false, reason: `forbidden pattern: ${pat.source}` };
  }
  const doubleQuotedMatches = withoutSingleQuoted.match(/"[^"]*"/g) ?? [];
  for (const dq of doubleQuotedMatches) {
    if (/\$|`/.test(dq)) return { allowed: false, reason: 'forbidden substitution in double quotes' };
  }
  return { allowed: true };
}
