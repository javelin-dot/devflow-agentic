import { useState, useMemo } from 'react';
import { Check, X } from 'lucide-react';
import { useDocument, useDocumentVersions, usePatchDocument } from '../api/hooks';
import type { Document, DocumentVersion } from '@devflow/shared';

interface DocumentEditorProps {
  docId: string;
  readOnly?: boolean;
}

function VersionList({
  versions,
  current,
  onSelect,
}: {
  versions: DocumentVersion[];
  current: number;
  onSelect: (v: number) => void;
}) {
  return (
    <div style={{ width: 180, borderRight: '1px solid var(--border-default)', overflowY: 'auto', flexShrink: 0 }}>
      <div style={{ padding: '10px 12px', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-default)' }}>
        版本历史
      </div>
      {versions.map((v) => (
        <div
          key={v.id}
          onClick={() => onSelect(v.version)}
          style={{
            padding: '8px 12px', cursor: 'pointer',
            background: current === v.version ? 'var(--bg-secondary)' : 'transparent',
            borderBottom: '1px solid var(--bg-tertiary)',
          }}
        >
          <div style={{ fontSize: 12, color: current === v.version ? 'var(--accent-blue)' : 'var(--text-primary)' }}>
            v{v.version}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2 }}>
            {new Date(v.createdAt).toLocaleString('zh-CN')}
          </div>
          {v.summary && (
            <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {v.summary}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function DiffView({ oldText, newText, oldLabel, newLabel }: { oldText: string; newText: string; oldLabel: string; newLabel: string }) {
  const diff = useMemo(() => {
    const ops = computeLCS(oldText.split('\n'), newText.split('\n'));
    return ops;
  }, [oldText, newText]);

  return (
    <div style={{ fontFamily: 'monospace', fontSize: 12, lineHeight: 1.6, overflow: 'auto' }}>
      <div style={{ color: 'var(--text-secondary)', marginBottom: 8 }}>--- {oldLabel} → +++ {newLabel}</div>
      {diff.map((op, i) => (
        <div
          key={i}
          style={{
            color: op.type === 'del' ? 'var(--accent-red)' : op.type === 'add' ? 'var(--accent-green)' : 'var(--text-secondary)',
            background: op.type === 'del' ? 'var(--diff-del-bg)' : op.type === 'add' ? 'var(--diff-add-bg)' : 'transparent',
            padding: '1px 4px',
            whiteSpace: 'pre-wrap',
          }}
        >
          {op.type === 'del' ? '-' : op.type === 'add' ? '+' : ' '} {op.line}
        </div>
      ))}
    </div>
  );
}

export function DocumentEditor({ docId, readOnly }: DocumentEditorProps) {
  const { data: doc } = useDocument(docId);
  const { data: versions = [] } = useDocumentVersions(docId);
  const patchDoc = usePatchDocument();

  const [editContent, setEditContent] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [previewVersion, setPreviewVersion] = useState<number | null>(null);
  const [showDiff, setShowDiff] = useState(false);

  const currentVersion = previewVersion ?? doc?.currentVersion ?? 0;
  const versionData = versions.find((v) => v.version === currentVersion);
  const displayContent = versionData?.content ?? doc?.content ?? '';

  const prevVersion = versions.find((v) => v.version === currentVersion - 1);

  const handleSave = () => {
    if (!editContent.trim() || !doc) return;
    patchDoc.mutate(
      { id: docId, reqId: doc.reqId ?? undefined, patch: { content: editContent } },
      { onSuccess: () => { setIsEditing(false); setPreviewVersion(null); } }
    );
  };

  const handleExportMD = () => {
    const blob = new Blob([displayContent], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${doc?.title || 'document'}-v${currentVersion}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExport = async (format: 'pdf' | 'docx') => {
    if (!doc) return;
    const resp = await fetch(`/api/documents/${doc.id}/export?format=${format}`);
    if (!resp.ok) {
      alert(`导出失败: ${resp.status}`);
      return;
    }
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const header = resp.headers.get('content-disposition');
    const match = header?.match(/filename="(.+)"/);
    a.download = match?.[1] ?? `${doc.title}-v${currentVersion}.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const effectiveReadOnly = readOnly || !isEditing || previewVersion !== null;

  return (
    <div style={{ display: 'flex', height: '100%', background: 'var(--bg-primary)' }}>
      <VersionList
        versions={versions}
        current={currentVersion}
        onSelect={(v) => { setPreviewVersion(v); setIsEditing(false); setShowDiff(false); }}
      />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Toolbar */}
        <div style={{
          padding: '8px 12px', borderBottom: '1px solid var(--border-default)',
          display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
        }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', flex: 1 }}>
            {doc?.title} <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>v{currentVersion}</span>
            {doc?.status === 'approved' && <span style={{ color: 'var(--accent-green)', marginLeft: 8, fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}><Check size={12} /> 已批准</span>}
            {doc?.status === 'rejected' && <span style={{ color: 'var(--accent-red)', marginLeft: 8, fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}><X size={12} /> 已打回</span>}
          </span>

          {!readOnly && (
            <>
              {!isEditing ? (
                <button
                  onClick={() => { setEditContent(displayContent); setIsEditing(true); setPreviewVersion(null); setShowDiff(false); }}
                  style={{
                    padding: '4px 10px', background: 'var(--accent-blue)', border: 'none',
                    borderRadius: 4, color: 'var(--text-inverse)', cursor: 'pointer', fontSize: 12,
                  }}
                >
                  编辑
                </button>
              ) : (
                <button
                  onClick={handleSave}
                  disabled={patchDoc.isPending}
                  style={{
                    padding: '4px 10px', background: 'var(--accent-blue)', border: 'none',
                    borderRadius: 4, color: 'var(--text-inverse)', cursor: 'pointer', fontSize: 12,
                  }}
                >
                  {patchDoc.isPending ? '保存中...' : '保存为新版本'}
                </button>
              )}
            </>
          )}

          {prevVersion && (
            <button
              onClick={() => setShowDiff(!showDiff)}
              style={{
                padding: '4px 10px', background: 'var(--bg-secondary)', border: '1px solid var(--border-default)',
                borderRadius: 4, color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 12,
              }}
            >
              {showDiff ? '关闭diff' : '与上一版diff'}
            </button>
          )}

          <button
            onClick={handleExportMD}
            style={{
              padding: '4px 10px', background: 'var(--bg-secondary)', border: '1px solid var(--border-default)',
              borderRadius: 4, color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 12,
            }}
          >
            导出MD
          </button>

          <button
            onClick={() => handleExport('pdf')}
            style={{
              padding: '4px 10px', background: 'var(--bg-secondary)', border: '1px solid var(--border-default)',
              borderRadius: 4, color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 12,
            }}
          >
            导出PDF
          </button>

          <button
            onClick={() => handleExport('docx')}
            style={{
              padding: '4px 10px', background: 'var(--bg-secondary)', border: '1px solid var(--border-default)',
              borderRadius: 4, color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 12,
            }}
          >
            导出DOCX
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: 'auto', padding: '12px 16px' }}>
          {showDiff && prevVersion ? (
            <DiffView
              oldText={prevVersion.content}
              newText={displayContent}
              oldLabel={`v${prevVersion.version}`}
              newLabel={`v${currentVersion}`}
            />
          ) : effectiveReadOnly ? (
            <pre style={{
              whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'inherit',
              fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, margin: 0,
            }}>
              {displayContent}
            </pre>
          ) : (
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              style={{
                width: '100%', height: '100%', background: 'var(--bg-primary)', border: '1px solid var(--border-default)',
                borderRadius: 4, color: 'var(--text-primary)', fontSize: 13, lineHeight: 1.7,
                resize: 'none', padding: 8, boxSizing: 'border-box', fontFamily: 'inherit',
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

interface DiffOp {
  type: 'same' | 'del' | 'add';
  line: string;
}

function computeLCS(a: string[], b: string[]): DiffOp[] {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      if (a[i] === b[j]) dp[i][j] = 1 + dp[i + 1][j + 1];
      else dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const ops: DiffOp[] = [];
  let i = 0, j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      ops.push({ type: 'same', line: a[i] });
      i++; j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ type: 'del', line: a[i] });
      i++;
    } else {
      ops.push({ type: 'add', line: b[j] });
      j++;
    }
  }
  while (i < m) { ops.push({ type: 'del', line: a[i] }); i++; }
  while (j < n) { ops.push({ type: 'add', line: b[j] }); j++; }

  return ops;
}
