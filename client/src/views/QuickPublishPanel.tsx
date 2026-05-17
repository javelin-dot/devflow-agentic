import { useState } from 'react';
import { Plus } from 'lucide-react';
import {
  useJenkinsTemplates,
  useCreateJenkinsTemplate,
  useDeleteJenkinsTemplate,
  useTriggerJenkins,
} from '../api/hooks';
import type { JenkinsTemplate } from '@devflow/shared';

interface TriggerFormProps {
  template: JenkinsTemplate;
  onClose: () => void;
}

function TriggerForm({ template, onClose }: TriggerFormProps) {
  const triggerMut = useTriggerJenkins();
  const [vars, setVars] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const k of Object.keys(template.params)) init[k] = '';
    return init;
  });
  const [extraVars, setExtraVars] = useState({ branch: '', service: '', version: '', env: '' });
  const [result, setResult] = useState<{ status: string; buildUrl?: string; message?: string } | null>(null);

  function handleTrigger() {
    const allVars = { ...extraVars, ...vars };
    triggerMut.mutate(
      { id: template.id, vars: allVars },
      {
        onSuccess: (data) => setResult(data),
        onError: (err) => setResult({ status: 'error', message: err.message }),
      }
    );
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', zIndex: 999,
    }}>
      <div style={{ background: 'var(--bg-secondary)', borderRadius: 10, padding: 28, width: 440, maxWidth: '95vw' }}>
        <h3 style={{ margin: '0 0 16px', color: 'var(--text-primary)' }}>触发构建: {template.name}</h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13, margin: '0 0 16px' }}>Job: {template.job}</p>

        {/* Standard substitution vars */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginBottom: 8 }}>替换变量 (用于模板参数中的 {'{branch}'}, {'{service}'} 等)</div>
          {(['branch', 'service', 'version', 'env'] as const).map(key => (
            <div key={key} style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center' }}>
              <span style={{ width: 70, color: 'var(--text-secondary)', fontSize: 13 }}>{key}</span>
              <input
                value={extraVars[key]}
                onChange={e => setExtraVars(prev => ({ ...prev, [key]: e.target.value }))}
                style={{ flex: 1, background: 'var(--bg-primary)', border: '1px solid var(--bg-tertiary)', color: 'var(--text-primary)', borderRadius: 4, padding: '5px 8px', fontSize: 13 }}
              />
            </div>
          ))}
        </div>

        {/* Per-param overrides */}
        {Object.keys(template.params).length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginBottom: 8 }}>参数覆盖</div>
            {Object.entries(template.params).map(([k, defaultVal]) => (
              <div key={k} style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center' }}>
                <span style={{ width: 100, color: 'var(--text-secondary)', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis' }}>{k}</span>
                <input
                  value={vars[k] ?? ''}
                  onChange={e => setVars(prev => ({ ...prev, [k]: e.target.value }))}
                  placeholder={defaultVal}
                  style={{ flex: 1, background: 'var(--bg-primary)', border: '1px solid var(--bg-tertiary)', color: 'var(--text-primary)', borderRadius: 4, padding: '5px 8px', fontSize: 13 }}
                />
              </div>
            ))}
          </div>
        )}

        {result && (
          <div style={{
            padding: 10, borderRadius: 6, marginBottom: 14,
            background: result.status === 'triggered' ? 'var(--scan-success-bg)' : 'var(--diff-del-bg)',
            color: result.status === 'triggered' ? 'var(--accent-green)' : 'var(--accent-red)',
            fontSize: 13,
          }}>
            {result.status === 'triggered' ? (
              <>
                构建已触发!{' '}
                {result.buildUrl && (
                  <a href={result.buildUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--accent-blue)' }}>
                    查看构建
                  </a>
                )}
              </>
            ) : (
              `错误: ${result.message}`
            )}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{ padding: '8px 20px', borderRadius: 6, border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer' }}
          >
            关闭
          </button>
          <button
            onClick={handleTrigger}
            disabled={triggerMut.isPending}
            style={{ padding: '8px 20px', borderRadius: 6, border: 'none', background: triggerMut.isPending ? 'var(--text-tertiary)' : 'var(--accent-blue)', color: 'var(--text-inverse)', cursor: triggerMut.isPending ? 'not-allowed' : 'pointer' }}
          >
            {triggerMut.isPending ? '触发中...' : '触发构建'}
          </button>
        </div>
      </div>
    </div>
  );
}

interface AddTemplateFormProps {
  onClose: () => void;
}

function AddTemplateForm({ onClose }: AddTemplateFormProps) {
  const createMut = useCreateJenkinsTemplate();
  const [name, setName] = useState('');
  const [job, setJob] = useState('');
  const [jenkinsUrl, setJenkinsUrl] = useState('http://localhost:8080');
  const [paramsJson, setParamsJson] = useState('{}');
  const [error, setError] = useState('');

  function handleSubmit() {
    setError('');
    let params: Record<string, string> = {};
    try {
      params = JSON.parse(paramsJson) as Record<string, string>;
    } catch {
      setError('params JSON 格式错误');
      return;
    }
    if (!name.trim() || !job.trim()) {
      setError('name 和 job 不能为空');
      return;
    }
    createMut.mutate(
      { name, job, params, jenkinsUrl },
      {
        onSuccess: () => onClose(),
        onError: (err) => setError(err.message),
      }
    );
  }

  return (
    <div style={{ background: 'var(--bg-tertiary)', borderRadius: 8, padding: 20, marginBottom: 20 }}>
      <h4 style={{ margin: '0 0 14px', color: 'var(--text-primary)' }}>添加 Jenkins 模板</h4>

      {error && <div style={{ color: 'var(--accent-red)', fontSize: 13, marginBottom: 10 }}>{error}</div>}

      {[
        { label: '名称', val: name, set: setName, placeholder: 'my-service' },
        { label: 'Job', val: job, set: setJob, placeholder: 'build-my-service' },
        { label: 'Jenkins URL', val: jenkinsUrl, set: setJenkinsUrl, placeholder: 'http://jenkins:8080' },
      ].map(({ label, val, set, placeholder }) => (
        <div key={label} style={{ marginBottom: 10 }}>
          <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: 13, marginBottom: 4 }}>{label}</label>
          <input
            value={val}
            onChange={e => set(e.target.value)}
            placeholder={placeholder}
            style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg-primary)', border: '1px solid var(--bg-tertiary)', color: 'var(--text-primary)', borderRadius: 6, padding: '7px 10px', fontSize: 13 }}
          />
        </div>
      ))}

      <div style={{ marginBottom: 14 }}>
        <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: 13, marginBottom: 4 }}>
          参数 (JSON)
        </label>
        <textarea
          value={paramsJson}
          onChange={e => setParamsJson(e.target.value)}
          rows={4}
          style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg-primary)', border: '1px solid var(--bg-tertiary)', color: 'var(--text-primary)', borderRadius: 6, padding: '7px 10px', fontSize: 13, fontFamily: 'monospace', resize: 'vertical' }}
        />
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={onClose}
          style={{ padding: '7px 16px', borderRadius: 6, border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 13 }}
        >
          取消
        </button>
        <button
          onClick={handleSubmit}
          disabled={createMut.isPending}
          style={{ padding: '7px 16px', borderRadius: 6, border: 'none', background: 'var(--accent-blue)', color: 'var(--text-inverse)', cursor: 'pointer', fontSize: 13 }}
        >
          保存
        </button>
      </div>
    </div>
  );
}

export function QuickPublishPanel() {
  const { data: templates = [], isLoading } = useJenkinsTemplates();
  const deleteMut = useDeleteJenkinsTemplate();
  const [showAdd, setShowAdd] = useState(false);
  const [triggerTemplate, setTriggerTemplate] = useState<JenkinsTemplate | null>(null);

  return (
    <div style={{ padding: 24, background: 'var(--bg-primary)', minHeight: '100%', color: 'var(--text-primary)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 20 }}>快速发布 / Jenkins 模板</h2>
        <button
          onClick={() => setShowAdd(v => !v)}
          style={{ padding: '8px 20px', borderRadius: 6, border: 'none', background: 'var(--accent-blue)', color: 'var(--text-inverse)', cursor: 'pointer', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}
        >
          <Plus size={16} /> 添加模板
        </button>
      </div>

      {showAdd && <AddTemplateForm onClose={() => setShowAdd(false)} />}

      {isLoading ? (
        <div style={{ color: 'var(--text-tertiary)', padding: 40, textAlign: 'center' }}>加载中...</div>
      ) : templates.length === 0 ? (
        <div style={{ color: 'var(--text-tertiary)', padding: 40, textAlign: 'center' }}>暂无 Jenkins 模板，点击上方按钮添加</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {templates.map(tpl => (
            <div
              key={tpl.id}
              style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
            >
              <div>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>{tpl.name}</div>
                <div style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>
                  Job: <span style={{ color: 'var(--text-secondary)' }}>{tpl.job}</span>
                  {' · '}
                  <span style={{ color: 'var(--text-tertiary)' }}>{tpl.jenkinsUrl}</span>
                </div>
                {Object.keys(tpl.params).length > 0 && (
                  <div style={{ color: 'var(--text-tertiary)', fontSize: 12, marginTop: 4 }}>
                    参数: {Object.keys(tpl.params).join(', ')}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => setTriggerTemplate(tpl)}
                  style={{ padding: '6px 16px', borderRadius: 6, border: '1px solid var(--accent-blue)', background: 'transparent', color: 'var(--accent-blue)', cursor: 'pointer', fontSize: 13 }}
                >
                  触发构建
                </button>
                <button
                  onClick={() => deleteMut.mutate({ id: tpl.id })}
                  style={{ padding: '6px 16px', borderRadius: 6, border: '1px solid var(--accent-red)', background: 'transparent', color: 'var(--accent-red)', cursor: 'pointer', fontSize: 13 }}
                >
                  删除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {triggerTemplate && (
        <TriggerForm template={triggerTemplate} onClose={() => setTriggerTemplate(null)} />
      )}
    </div>
  );
}
