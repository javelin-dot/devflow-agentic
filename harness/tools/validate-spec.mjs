#!/usr/bin/env node
// validate-spec.mjs — RequirementSpec 校验器
// 落地 harness/02-requirement-spec.md § 4 的九条规则。
// 用法:
//   node harness/tools/validate-spec.mjs <spec.yaml> [--projects <name1,name2>]
// 退出码: 0 通过 / 1 校验失败 / 2 用法错误。

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// ---------- 极简 YAML frontmatter 解析（不引外部依赖） ----------
// 仅支持 harness 实际使用的子集：scalar / list / nested map / inline list。
function parseSpec(raw) {
  let body = raw;
  let fm = raw;
  const m = raw.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?([\s\S]*)$/);
  if (m) {
    fm = m[1];
    body = m[2] ?? '';
  }
  return { frontmatter: parseYaml(fm), body };
}

function parseYaml(text) {
  const lines = text.split(/\r?\n/);
  let i = 0;
  function indent(s) {
    let n = 0;
    while (n < s.length && s[n] === ' ') n++;
    return n;
  }
  function isBlank(s) { return /^\s*(#.*)?$/.test(s); }
  function stripComment(s) {
    // 简化：从第一个空格 # 起截断；不处理引号内的 #
    const idx = s.search(/\s#/);
    return idx === -1 ? s : s.slice(0, idx);
  }
  function parseScalar(v) {
    v = v.trim();
    if (v === '' || v === '~' || v.toLowerCase() === 'null') return null;
    if (v === 'true') return true;
    if (v === 'false') return false;
    if (/^-?\d+$/.test(v)) return Number(v);
    if (/^-?\d+\.\d+$/.test(v)) return Number(v);
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      return v.slice(1, -1);
    }
    if (v.startsWith('[') && v.endsWith(']')) {
      const inner = v.slice(1, -1).trim();
      if (!inner) return [];
      return inner.split(',').map(x => parseScalar(x));
    }
    if (v.startsWith('{') && v.endsWith('}')) {
      // inline map（仅供 contracts 等深层使用，本校验器无需理解结构）
      return v;
    }
    return v;
  }

  function parseBlock(baseIndent) {
    // 决定是 mapping 还是 sequence
    while (i < lines.length && isBlank(lines[i])) i++;
    if (i >= lines.length) return null;
    const ind = indent(lines[i]);
    if (ind < baseIndent) return null;
    const isList = /^\s*-\s/.test(lines[i]) && ind === baseIndent;
    if (isList) return parseList(baseIndent);
    return parseMap(baseIndent);
  }

  function parseMap(baseIndent) {
    const obj = {};
    while (i < lines.length) {
      const raw = lines[i];
      if (isBlank(raw)) { i++; continue; }
      const ind = indent(raw);
      if (ind < baseIndent) break;
      if (ind > baseIndent) break; // 被父级处理
      const line = stripComment(raw).trimEnd();
      const m = line.match(/^\s*([A-Za-z0-9_\-]+):\s*(\|[-+]?\s*)?(.*)$/);
      if (!m) { i++; continue; }
      const key = m[1];
      const blockMarker = m[2];
      const inline = m[3];
      i++;
      if (blockMarker) {
        // 块字面量
        const blockLines = [];
        const childInd = baseIndent + 2;
        while (i < lines.length) {
          const r = lines[i];
          if (r.trim() === '') { blockLines.push(''); i++; continue; }
          if (indent(r) < childInd) break;
          blockLines.push(r.slice(childInd));
          i++;
        }
        obj[key] = blockLines.join('\n');
        continue;
      }
      if (inline === '' || inline == null) {
        // 嵌套结构
        // 跳过空行
        let j = i;
        while (j < lines.length && isBlank(lines[j])) j++;
        if (j >= lines.length) { obj[key] = null; continue; }
        const childInd = indent(lines[j]);
        if (childInd <= baseIndent) { obj[key] = null; continue; }
        i = j;
        const isChildList = /^\s*-\s/.test(lines[j]);
        obj[key] = isChildList ? parseList(childInd) : parseMap(childInd);
      } else {
        obj[key] = parseScalar(inline);
      }
    }
    return obj;
  }

  function parseList(baseIndent) {
    const arr = [];
    while (i < lines.length) {
      const raw = lines[i];
      if (isBlank(raw)) { i++; continue; }
      const ind = indent(raw);
      if (ind < baseIndent) break;
      if (ind > baseIndent) break;
      const line = stripComment(raw).trimEnd();
      const m = line.match(/^(\s*)-\s?(.*)$/);
      if (!m) break;
      const rest = m[2];
      i++;
      if (rest === '') {
        // 子结构在下一行
        let j = i;
        while (j < lines.length && isBlank(lines[j])) j++;
        if (j >= lines.length) { arr.push(null); continue; }
        const childInd = indent(lines[j]);
        if (childInd <= baseIndent) { arr.push(null); continue; }
        i = j;
        const isChildList = /^\s*-\s/.test(lines[j]);
        arr.push(isChildList ? parseList(childInd) : parseMap(childInd));
      } else if (rest.includes(': ') || /:\s*$/.test(rest)) {
        // 行内 key: value，紧跟同 item 的其他键
        // 把它作为 map 的第一行处理：制造一行虚拟同缩进 key
        // 简化：将 "- key: v" 当作 "  key: v" 解析为单 map item
        const itemMap = {};
        const km = rest.match(/^([A-Za-z0-9_\-]+):\s*(.*)$/);
        if (km) {
          const k = km[1];
          const v = km[2];
          if (v === '') {
            // 子结构
            let j = i;
            while (j < lines.length && isBlank(lines[j])) j++;
            if (j < lines.length && indent(lines[j]) > baseIndent) {
              const childInd = indent(lines[j]);
              i = j;
              const isChildList = /^\s*-\s/.test(lines[j]);
              itemMap[k] = isChildList ? parseList(childInd) : parseMap(childInd);
            } else {
              itemMap[k] = null;
            }
          } else {
            itemMap[k] = parseScalar(v);
          }
        }
        // 继续读后续同 item 的兄弟键（缩进 = baseIndent + 2）
        const childInd = baseIndent + 2;
        while (i < lines.length) {
          const r = lines[i];
          if (isBlank(r)) { i++; continue; }
          const id = indent(r);
          if (id !== childInd) break;
          if (/^\s*-\s/.test(r)) break;
          Object.assign(itemMap, parseMap(childInd));
        }
        arr.push(itemMap);
      } else {
        arr.push(parseScalar(rest));
      }
    }
    return arr;
  }

  return parseMap(0);
}

// ---------- 校验规则 ----------
const SUPPORTED_VERSIONS = new Set(['1.0']);
const PRIORITIES = new Set(['critical', 'high', 'medium', 'low']);
const KINDS = new Set(['standard', 'no_code']);
const STAGES = new Set(['backlog', 'analyzing', 'development', 'uat', 'prerelease', 'released']);
const ACCEPTANCE_TYPES = new Set(['behavior', 'api', 'data', 'ui', 'perf', 'security']);

const errors = [];
const warns = [];
function err(rule, msg) { errors.push({ rule, msg }); }
function warn(rule, msg) { warns.push({ rule, msg }); }

function validate(spec, opts) {
  const fm = spec.frontmatter || {};

  // R1: spec_version
  if (!fm.spec_version) err('R1', 'spec_version 缺失');
  else if (!SUPPORTED_VERSIONS.has(String(fm.spec_version))) {
    err('R1', `spec_version=${fm.spec_version} 不在支持范围 (${[...SUPPORTED_VERSIONS].join(', ')})`);
  }

  // R2: 顶层必填
  if (!fm.title) err('R2', 'title 缺失');
  else if (typeof fm.title !== 'string' || fm.title.length === 0) err('R2', 'title 非空字符串');
  else if (fm.title.length > 60) warn('R2', `title 长度 ${fm.title.length} > 60（约定）`);
  if (!fm.priority) err('R2', 'priority 缺失');
  else if (!PRIORITIES.has(fm.priority)) err('R2', `priority=${fm.priority} 非法，应 ∈ ${[...PRIORITIES].join('|')}`);
  if (!fm.kind) err('R2', 'kind 缺失');
  else if (!KINDS.has(fm.kind)) err('R2', `kind=${fm.kind} 非法，应 ∈ ${[...KINDS].join('|')}`);

  const projects = Array.isArray(fm.projects) ? fm.projects : [];

  // R3: kind=standard → projects ≥1 + ≥1 primary
  if (fm.kind === 'standard') {
    if (projects.length === 0) err('R3', 'kind=standard 但 projects 为空');
    const primaries = projects.filter(p => p && p.isPrimary === true);
    if (projects.length > 0 && primaries.length === 0) {
      err('R3', 'projects 中必须至少 1 个 isPrimary=true');
    }
  } else if (fm.kind === 'no_code') {
    if (projects.length > 0) warn('R3', 'kind=no_code 但 projects 非空（一般应为 []）');
  }

  // R4: projects 存在性（仅当 --projects 提供时校验）
  if (opts.knownProjects && projects.length) {
    for (const p of projects) {
      if (!p || !p.project) continue;
      if (!opts.knownProjects.has(p.project)) {
        err('R4', `projects[].project="${p.project}" 不在已知项目集合中（提示扫描项目）`);
      }
    }
  }

  const tasks = Array.isArray(fm.tasks) ? fm.tasks : [];
  const projectNames = new Set(projects.map(p => p && p.project).filter(Boolean));

  // R5: tasks[*].project ⊆ projects
  for (const t of tasks) {
    if (!t) continue;
    if (fm.kind === 'standard' && t.project && !projectNames.has(t.project)) {
      err('R5', `task ${t.id || '?'} 的 project="${t.project}" 不在 projects[] 中`);
    }
  }

  // R6: tasks DAG 无环 + id 唯一
  const idSet = new Set();
  for (const t of tasks) {
    if (!t || !t.id) { err('R6', 'task.id 缺失'); continue; }
    if (idSet.has(t.id)) err('R6', `task.id 重复: ${t.id}`);
    idSet.add(t.id);
  }
  // depends_on 引用必须存在
  for (const t of tasks) {
    if (!t) continue;
    const deps = Array.isArray(t.depends_on) ? t.depends_on : [];
    for (const d of deps) {
      if (!idSet.has(d)) err('R6', `task ${t.id} 依赖不存在的 ${d}`);
    }
  }
  // Kahn 拓扑检测环
  const indeg = new Map();
  const adj = new Map();
  for (const t of tasks) {
    if (!t || !t.id) continue;
    if (!indeg.has(t.id)) indeg.set(t.id, 0);
    if (!adj.has(t.id)) adj.set(t.id, []);
  }
  for (const t of tasks) {
    if (!t || !t.id) continue;
    const deps = Array.isArray(t.depends_on) ? t.depends_on : [];
    for (const d of deps) {
      if (!adj.has(d)) adj.set(d, []);
      adj.get(d).push(t.id);
      indeg.set(t.id, (indeg.get(t.id) || 0) + 1);
    }
  }
  const queue = [...indeg.entries()].filter(([, v]) => v === 0).map(([k]) => k);
  let visited = 0;
  while (queue.length) {
    const u = queue.shift();
    visited++;
    for (const v of adj.get(u) || []) {
      indeg.set(v, indeg.get(v) - 1);
      if (indeg.get(v) === 0) queue.push(v);
    }
  }
  if (tasks.length > 0 && visited !== indeg.size) {
    err('R6', `tasks DAG 含环（已访问 ${visited}/${indeg.size}）`);
  }

  const acceptance = Array.isArray(fm.acceptance) ? fm.acceptance : [];
  const acIds = new Set();
  for (const a of acceptance) {
    if (!a || !a.id) { err('R7', 'acceptance.id 缺失'); continue; }
    if (acIds.has(a.id)) err('R7', `acceptance.id 重复: ${a.id}`);
    acIds.add(a.id);
    if (a.type && !ACCEPTANCE_TYPES.has(a.type)) {
      warn('R7', `acceptance ${a.id} type=${a.type} 非建议词表`);
    }
  }

  // R7: acceptance.id 集合 ⊇ tasks[*].acceptance 引用
  for (const t of tasks) {
    if (!t) continue;
    const refs = Array.isArray(t.acceptance) ? t.acceptance : [];
    for (const r of refs) {
      if (!acIds.has(r)) err('R7', `task ${t.id} 引用不存在的 acceptance ${r}`);
    }
  }

  // R8: 每条 measurable=true 的 acceptance 至少被一个 task.verify_commands 覆盖
  const acCoverage = new Map();
  for (const a of acceptance) if (a && a.id) acCoverage.set(a.id, false);
  for (const t of tasks) {
    if (!t) continue;
    const refs = Array.isArray(t.acceptance) ? t.acceptance : [];
    const vcs = Array.isArray(t.verify_commands) ? t.verify_commands : [];
    if (vcs.length === 0) continue;
    for (const r of refs) if (acCoverage.has(r)) acCoverage.set(r, true);
  }
  for (const a of acceptance) {
    if (!a || a.measurable !== true) continue;
    if (!acCoverage.get(a.id)) {
      err('R8', `acceptance ${a.id} measurable=true 但未被任何 task.verify_commands 覆盖`);
    }
  }

  // R9: stage='prerelease' 起步 → planned_release_date 必填
  if (fm.stage === 'prerelease' && !fm.planned_release_date) {
    err('R9', "stage='prerelease' 但 planned_release_date 缺失");
  }
  if (fm.stage && !STAGES.has(fm.stage)) {
    err('R9', `stage=${fm.stage} 非法`);
  }

  // 反例补充：危险 verify_commands
  const DANGEROUS = [/\brm\s+-rf\b/, /\bpush\s+--force\b/, /\bsudo\b/, /\bdd\s+if=/];
  for (const t of tasks) {
    if (!t) continue;
    for (const c of (t.verify_commands || [])) {
      if (typeof c !== 'string') continue;
      for (const re of DANGEROUS) {
        if (re.test(c)) err('SAFETY', `task ${t.id} verify_commands 含危险命令: ${c}`);
      }
    }
  }
}

// ---------- main ----------
function parseArgs(argv) {
  const args = { file: null, knownProjects: null };
  for (let k = 0; k < argv.length; k++) {
    const a = argv[k];
    if (a === '--projects') {
      args.knownProjects = new Set((argv[++k] || '').split(',').filter(Boolean));
    } else if (!a.startsWith('--') && !args.file) {
      args.file = a;
    }
  }
  return args;
}

function main() {
  const argv = process.argv.slice(2);
  const args = parseArgs(argv);
  if (!args.file) {
    console.error('Usage: node validate-spec.mjs <spec.yaml> [--projects name1,name2]');
    process.exit(2);
  }
  const path = resolve(args.file);
  if (!existsSync(path)) {
    console.error(`file not found: ${path}`);
    process.exit(2);
  }
  const raw = readFileSync(path, 'utf8');
  let spec;
  try {
    spec = parseSpec(raw);
  } catch (e) {
    console.error(`parse error: ${e.message}`);
    process.exit(1);
  }
  validate(spec, { knownProjects: args.knownProjects });

  const banner = `validate-spec  ${path}`;
  console.log(banner);
  console.log('-'.repeat(banner.length));
  if (errors.length === 0 && warns.length === 0) {
    console.log('OK · R1-R9 + SAFETY passed');
    process.exit(0);
  }
  for (const w of warns) console.log(`WARN  [${w.rule}] ${w.msg}`);
  for (const e of errors) console.log(`ERROR [${e.rule}] ${e.msg}`);
  console.log('-'.repeat(banner.length));
  console.log(`errors=${errors.length}  warnings=${warns.length}`);
  process.exit(errors.length > 0 ? 1 : 0);
}

main();
