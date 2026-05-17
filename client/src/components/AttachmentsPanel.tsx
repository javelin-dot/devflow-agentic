import { useState, useRef, useCallback } from 'react';
import { FileText, Image, BookOpen, Package, FileCode, Table, X, Plus } from 'lucide-react';
import { useAttachmentsV2, useUploadAttachmentV2, useDeleteAttachmentV2 } from '../api/hooks';

const IMG_MIME = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'];

function isImage(mime: string | null): boolean {
  return !!mime && IMG_MIME.includes(mime);
}

function MimeIcon({ mime }: { mime: string | null }) {
  const s = 16;
  if (!mime) return <FileText size={s} />;
  if (mime.startsWith('image/')) return <Image size={s} />;
  if (mime.includes('pdf')) return <BookOpen size={s} />;
  if (mime.includes('zip')) return <Package size={s} />;
  if (mime.includes('word') || mime.includes('doc')) return <FileCode size={s} />;
  if (mime.includes('excel') || mime.includes('sheet')) return <Table size={s} />;
  return <FileText size={s} />;
}

function formatSize(n: number): string {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / 1024 / 1024).toFixed(1)}MB`;
}

interface AttachmentsPanelProps {
  reqId: string;
  embedded?: boolean;
}

export function AttachmentsPanel({ reqId, embedded }: AttachmentsPanelProps) {
  const { data: attachments = [], isLoading } = useAttachmentsV2(reqId);
  const upload = useUploadAttachmentV2();
  const del = useDeleteAttachmentV2();
  const [dragOver, setDragOver] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return;
    upload.mutate({ reqId, files });
  }, [reqId, upload]);

  const images = attachments.filter(a => isImage(a.mime));
  const others = attachments.filter(a => !isImage(a.mime));

  return (
    <div style={embedded ? { padding: 0 } : { padding: '8px 12px', borderBottom: '1px solid var(--border-default)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600 }}>附件 {attachments.length}</span>
        <button
          onClick={() => inputRef.current?.click()}
          style={{
            fontSize: 11, padding: '3px 8px', background: 'var(--bg-secondary)', border: '1px solid var(--border-default)',
            borderRadius: 4, color: 'var(--text-secondary)', cursor: 'pointer',
          }}
        >
          <Plus size={12} /> 上传
        </button>
      </div>

      <input
        ref={inputRef}
        type="file"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => handleFiles(e.target.files)}
      />

      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
        style={{
          border: `1px dashed ${dragOver ? 'var(--accent-blue)' : 'var(--border-default)'}`,
          borderRadius: 4, padding: '6px 0', textAlign: 'center', cursor: 'pointer',
          background: dragOver ? 'var(--bg-drop)' : 'transparent', transition: 'all 0.2s',
          marginBottom: 8, display: attachments.length > 0 ? 'none' : 'block',
        }}
        onClick={() => inputRef.current?.click()}
      >
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>拖拽文件到这里或点击上传</div>
      </div>

      {isLoading && <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>加载中...</div>}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {images.map((att) => (
          <div key={att.id} style={{ position: 'relative', width: 60, height: 60, flexShrink: 0 }}>
            <img
              src={`/api/attachments/${att.id}/raw`}
              alt={att.filename}
              style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 4, border: '1px solid var(--border-default)' }}
            />
            <button
              onClick={() => setConfirmDelete(att.id)}
              style={{
                position: 'absolute', top: -4, right: -4, width: 16, height: 16,
                borderRadius: '50%', background: 'var(--accent-red)', color: 'var(--text-inverse)', border: 'none',
                fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <X size={10} />
            </button>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: images.length > 0 ? 8 : 0 }}>
        {others.map((att) => (
          <div
            key={att.id}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '4px 6px',
              background: 'var(--bg-secondary)', borderRadius: 4, fontSize: 11,
            }}
          >
            <span><MimeIcon mime={att.mime} /></span>
            <a
              href={`/api/attachments/${att.id}/raw`}
              target="_blank"
              rel="noreferrer"
              style={{ color: 'var(--accent-blue)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: 'none' }}
              title={att.filename}
            >
              {att.filename}
            </a>
            <span style={{ color: 'var(--text-tertiary)', flexShrink: 0 }}>{formatSize(att.size)}</span>
            <button
              onClick={() => setConfirmDelete(att.id)}
              style={{
                background: 'transparent', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer',
                fontSize: 12, padding: '0 2px', flexShrink: 0,
              }}
            >
              <X size={12} />
            </button>
          </div>
        ))}
      </div>

      {confirmDelete && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300,
        }}>
          <div style={{
            background: 'var(--bg-secondary)', border: '1px solid var(--border-default)', borderRadius: 8,
            padding: 20, width: 300,
          }}>
            <div style={{ fontSize: 13, color: 'var(--text-primary)', marginBottom: 12 }}>确定删除此附件？</div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setConfirmDelete(null)}
                style={{
                  padding: '6px 12px', background: 'transparent', border: '1px solid var(--border-default)',
                  borderRadius: 4, color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 12,
                }}
              >
                取消
              </button>
              <button
                onClick={() => {
                  const id = confirmDelete;
                  setConfirmDelete(null);
                  del.mutate({ id, reqId });
                }}
                style={{
                  padding: '6px 12px', background: 'var(--accent-red)', border: 'none',
                  borderRadius: 4, color: 'var(--text-inverse)', cursor: 'pointer', fontSize: 12,
                }}
              >
                删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
