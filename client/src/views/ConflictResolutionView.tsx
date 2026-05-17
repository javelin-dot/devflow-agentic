import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../api/client';
import { useResumeRelease } from '../api/hooks';
import type { ConflictFile, ConflictBlock } from '@devflow/shared';

function getLangFromPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    py: 'python', go: 'go', rs: 'rust', java: 'java', cpp: 'cpp', c: 'c',
    h: 'c', hpp: 'cpp', cs: 'csharp', rb: 'ruby', php: 'php',
    swift: 'swift', kt: 'kotlin', scala: 'scala', sql: 'sql',
    sh: 'bash', zsh: 'bash', bash: 'bash', ps1: 'powershell',
    yaml: 'yaml', yml: 'yaml', json: 'json', xml: 'xml', html: 'html',
    css: 'css', scss: 'scss', sass: 'scss', less: 'less', md: 'markdown',
    dockerfile: 'dockerfile', vue: 'vue', svelte: 'svelte',
  };
  return map[ext] ?? 'text';
}

function syntaxHighlight(code: string, lang: string): string {
  if (lang === 'text') return escapeHtml(code);
  const keywords = new Set([
    'import', 'from', 'export', 'default', 'const', 'let', 'var', 'function',
    'class', 'extends', 'return', 'if', 'else', 'for', 'while', 'switch',
    'case', 'break', 'continue', 'try', 'catch', 'throw', 'new', 'this',
    'async', 'await', 'type', 'interface', 'enum', 'void', 'number',
    'string', 'boolean', 'any', 'null', 'undefined', 'true', 'false',
  ]);
  const lines = code.split('\n');
  return lines.map(line => {
    let html = escapeHtml(line);
    html = html.replace(/(\/\/.*$)/g, '<span style="color:var(--syntax-comment)">$1</span>');
    html = html.replace(/(['"`])(.*?)(\1)/g, '<span style="color:var(--syntax-string)">$1$2$3</span>');
    html = html.replace(/\b([a-zA-Z_]\w*)\b/g, (m) =>
      keywords.has(m) ? `<span style="color:var(--syntax-keyword)">${m}</span>` : m
    );
    html = html.replace(/\b(\d+(?:\.\d+)?)\b/g, '<span style="color:var(--syntax-number)">$1</span>');
    return html;
  }).join('<br>');
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function LineNumberedCode({ code, color, bg, borderColor, lang }: {
  code: string; color: string; bg: string; borderColor: string; lang: string;
}) {
  const lines = code.split('\n');
  return (
    <div style={{
      background: bg, border: `1px solid ${borderColor}`, borderRadius: 6,
      overflow: 'hidden', fontFamily: 'monospace', fontSize: 12,
    }}>
      {lines.map((line, i) => (
        <div key={i} style={{ display: 'flex' }}>
          <span style={{
            width: 36, textAlign: 'right', padding: '1px 6px',
            color: 'var(--text-tertiary)', background: `${bg}cc`, borderRight: `1px solid ${borderColor}44`,
            flexShrink: 0, userSelect: 'none', fontSize: 11,
          }}>
            {i + 1}
          </span>
          <span
            style={{ padding: '1px 8px', color, whiteSpace: 'pre-wrap', flex: 1, wordBreak: 'break-word' }}
            dangerouslySetInnerHTML={{ __html: syntaxHighlight(line, lang) }}
          />
        </div>
      ))}
    </div>
  );
}

interface BlockEditorProps {
  fileIdx: number;
  block: ConflictBlock;
  resolved: string;
  onChange: (val: string) => void;
  lang: string;
}

function BlockEditor({ block, resolved, onChange, lang }: BlockEditorProps) {
  const oursText = block.oursLines.join('\n');
  const theirsText = block.theirsLines.join('\n');

  const diffLines = (oursText || '').split('\n').map((line, i) => {
    const theirsLine = theirsText.split('\n')[i] ?? '';
    if (line === theirsLine) return { type: 'same', text: line };
    if (!theirsLine) return { type: 'del', text: line };
    if (!line) return { type: 'add', text: theirsLine };
    return { type: 'mod', text: line };
  });

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ color: 'var(--text-tertiary)', fontSize: 12, marginBottom: 10, display: 'flex', gap: 12, alignItems: 'center' }}>
        <span>冲突块 #{block.index + 1}（第 {block.startLine} 行）</span>
        <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
          {block.oursLines.length} ours / {block.theirsLines.length} theirs
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
        {/* OURS */}
        <div>
          <div style={{ color: 'var(--accent-blue)', fontSize: 12, marginBottom: 6, fontWeight: 600, display: 'flex', justifyContent: 'space-between' }}>
            <span>OURS</span>
            <button
              onClick={() => onChange(oursText)}
              style={{ padding: '2px 8px', borderRadius: 3, border: '1px solid var(--accent-blue)', background: 'transparent', color: 'var(--accent-blue)', cursor: 'pointer', fontSize: 10 }}
            >
              Accept
            </button>
          </div>
          <LineNumberedCode code={oursText || '(empty)'} color="var(--accent-blue)" bg="var(--bg-code)" borderColor="var(--bg-tertiary)" lang={lang} />
        </div>

        {/* RESULT */}
        <div>
          <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginBottom: 6, fontWeight: 600 }}>RESULT</div>
          <textarea
            value={resolved}
            onChange={e => onChange(e.target.value)}
            spellCheck={false}
            style={{
              width: '100%', boxSizing: 'border-box', background: 'var(--bg-primary)', border: '1px solid var(--border-default)',
              color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: 12, padding: 10,
              borderRadius: 6, minHeight: 120, resize: 'vertical', lineHeight: 1.6,
            }}
          />
        </div>

        {/* THEIRS */}
        <div>
          <div style={{ color: 'var(--accent-orange)', fontSize: 12, marginBottom: 6, fontWeight: 600, display: 'flex', justifyContent: 'space-between' }}>
            <span>THEIRS</span>
            <button
              onClick={() => onChange(theirsText)}
              style={{ padding: '2px 8px', borderRadius: 3, border: '1px solid var(--accent-orange)', background: 'transparent', color: 'var(--accent-orange)', cursor: 'pointer', fontSize: 10 }}
            >
              Accept
            </button>
          </div>
          <LineNumberedCode code={theirsText || '(empty)'} color="var(--accent-orange)" bg="var(--bg-tertiary)" borderColor="var(--border-default)" lang={lang} />
        </div>
      </div>
    </div>
  );
}

interface Props {
  runId: string;
  onResolved: () => void;
}

export function ConflictResolutionView({ runId, onResolved }: Props) {
  const resumeMut = useResumeRelease();
  const { data: conflictFiles = [], isLoading } = useQuery<ConflictFile[]>({
    queryKey: ['conflicts', runId],
    queryFn: () => apiFetch<ConflictFile[]>(`/release/${runId}/conflicts`),
  });

  const [resolved, setResolved] = useState<Record<string, Record<number, string>>>({});
  const [activeFile, setActiveFile] = useState(0);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiLog, setAiLog] = useState('');

  function setBlockResolved(fileIdx: number, blockIdx: number, val: string) {
    setResolved(prev => ({
      ...prev,
      [fileIdx]: { ...(prev[fileIdx] ?? {}), [blockIdx]: val },
    }));
  }

  async function handleAiSuggest() {
    setAiLoading(true);
    setAiLog('');
    try {
      const resp = await fetch(`/api/release/${runId}/conflict-suggest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: conflictFiles }),
      });
      if (!resp.body) throw new Error('No response body');
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const ev = JSON.parse(line.slice(6)) as { type?: string; content?: string; suggestions?: Array<{ fileIdx: number; blockIdx: number; text: string }>; message?: string };
              if (ev.type === 'chunk' && ev.content) {
                setAiLog(prev => prev + ev.content);
              }
              if (ev.type === 'suggestions' && ev.suggestions) {
                for (const s of ev.suggestions) {
                  setBlockResolved(s.fileIdx, s.blockIdx, s.text);
                }
              }
              if (ev.type === 'error' && ev.message) {
                setAiLog(prev => prev + '\nError: ' + ev.message);
              }
            } catch { /* ignore */ }
          }
        }
      }
    } catch (err) {
      setAiLog(prev => prev + '\nError: ' + (err as Error).message);
    }
    setAiLoading(false);
  }

  function handleSubmit() {
    resumeMut.mutate({ id: runId }, {
      onSuccess: () => onResolved(),
    });
  }

  if (isLoading) {
    return <div style={{ color: 'var(--text-tertiary)', padding: 16 }}>加载冲突文件...</div>;
  }

  if (conflictFiles.length === 0) {
    return (
      <div style={{ padding: 16 }}>
        <div style={{ color: 'var(--accent-green)', marginBottom: 12 }}>无冲突文件</div>
        <button
          onClick={handleSubmit}
          disabled={resumeMut.isPending}
          style={{ padding: '8px 20px', borderRadius: 6, border: 'none', background: 'var(--accent-blue)', color: 'var(--text-inverse)', cursor: 'pointer' }}
        >
          {resumeMut.isPending ? '恢复中...' : '继续发布'}
        </button>
      </div>
    );
  }

  const currentFile = conflictFiles[activeFile];
  const lang = getLangFromPath(currentFile.path);

  return (
    <div>
      <h4 style={{ margin: '0 0 16px', color: 'var(--text-primary)' }}>冲突解决</h4>

      {/* File tabs + AI suggest */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {conflictFiles.map((file, idx) => (
            <button
              key={file.path}
              onClick={() => setActiveFile(idx)}
              style={{
                padding: '4px 10px', borderRadius: 4, border: '1px solid var(--border-default)',
                background: idx === activeFile ? 'var(--bg-tertiary)' : 'var(--bg-primary)',
                color: idx === activeFile ? 'var(--accent-blue)' : 'var(--text-tertiary)', cursor: 'pointer', fontSize: 11,
                fontFamily: 'monospace',
              }}
            >
              {file.path.split('/').pop()}
              <span style={{ marginLeft: 4, color: 'var(--text-tertiary)' }}>({file.blocks.length})</span>
            </button>
          ))}
        </div>
        <button
          onClick={handleAiSuggest}
          disabled={aiLoading}
          style={{
            padding: '4px 12px', borderRadius: 4, border: '1px solid var(--accent-purple)',
            background: 'transparent', color: 'var(--accent-purple)', cursor: aiLoading ? 'not-allowed' : 'pointer',
            fontSize: 12, display: 'flex', alignItems: 'center', gap: 4,
          }}
        >
          {aiLoading ? '生成中...' : 'AI 建议'}
        </button>
      </div>

      {aiLog && (
        <pre style={{
          background: 'var(--bg-code)', color: 'var(--accent-green)', fontFamily: 'monospace', fontSize: 11,
          padding: 10, borderRadius: 6, maxHeight: 120, overflowY: 'auto', whiteSpace: 'pre-wrap',
          marginBottom: 12,
        }}>
          {aiLog}
        </pre>
      )}

      <div style={{ marginBottom: 24, background: 'var(--bg-tertiary)', borderRadius: 8, padding: 16 }}>
        <div style={{ color: 'var(--accent-blue)', fontFamily: 'monospace', fontSize: 13, marginBottom: 12 }}>
          {currentFile.path}
          <span style={{ marginLeft: 8, fontSize: 10, color: 'var(--text-tertiary)' }}>{lang}</span>
        </div>
        {currentFile.blocks.map((block) => (
          <BlockEditor
            key={block.index}
            fileIdx={activeFile}
            block={block}
            resolved={resolved[activeFile]?.[block.index] ?? ''}
            onChange={(val) => setBlockResolved(activeFile, block.index, val)}
            lang={lang}
          />
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <button
          onClick={handleSubmit}
          disabled={resumeMut.isPending}
          style={{ padding: '8px 24px', borderRadius: 6, border: 'none', background: 'var(--accent-blue)', color: 'var(--text-inverse)', cursor: resumeMut.isPending ? 'not-allowed' : 'pointer', fontWeight: 600 }}
        >
          {resumeMut.isPending ? '提交中...' : '提交解决方案'}
        </button>
        <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
          已解决 {Object.values(resolved).flatMap(o => Object.values(o)).filter(v => v.trim()).length} / {conflictFiles.reduce((s, f) => s + f.blocks.length, 0)} 个冲突块
        </span>
      </div>
    </div>
  );
}
