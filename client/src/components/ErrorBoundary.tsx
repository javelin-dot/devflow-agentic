import { Component, type ReactNode, type ErrorInfo } from 'react';
import { AlertTriangle } from 'lucide-react';

interface Props { children: ReactNode; fallback?: ReactNode; viewName?: string; }
interface State { hasError: boolean; error: Error | null; }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          height: '100%', gap: 16, color: 'var(--text-tertiary)', background: 'var(--bg-primary)',
        }}>
          <div style={{ fontSize: 40 }}><AlertTriangle size={40} /></div>
          <div style={{ fontSize: 16, color: 'var(--text-primary)' }}>
            {this.props.viewName ?? '视图'}加载失败
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', maxWidth: 400, textAlign: 'center' }}>
            {this.state.error?.message}
          </div>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              padding: '8px 20px', background: 'var(--accent-blue)', border: 'none',
              borderRadius: 4, color: 'var(--text-inverse)', cursor: 'pointer', fontSize: 13,
            }}
          >
            重试
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
