import { useEffect } from 'react';
import { create } from 'zustand';
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: string;
  type: ToastType;
  message: string;
}

interface ToastState {
  toasts: Toast[];
  add: (type: ToastType, message: string) => void;
  remove: (id: string) => void;
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  add: (type, message) =>
    set((state) => {
      const id = Math.random().toString(36).slice(2);
      const next = [...state.toasts, { id, type, message }];
      if (next.length > 3) next.shift();
      return { toasts: next };
    }),
  remove: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));

export function toast(type: ToastType, message: string) {
  useToastStore.getState().add(type, message);
}

const ICONS: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle size={16} color="var(--accent-green)" />,
  error: <AlertCircle size={16} color="var(--accent-red)" />,
  warning: <AlertTriangle size={16} color="var(--accent-orange)" />,
  info: <Info size={16} color="var(--accent-blue)" />,
};

const BG_MAP: Record<ToastType, string> = {
  success: 'var(--accent-green-15)',
  error: 'var(--accent-red-15)',
  warning: 'var(--accent-orange-15)',
  info: 'var(--accent-blue-15)',
};

const BORDER_MAP: Record<ToastType, string> = {
  success: 'var(--accent-green-44)',
  error: 'var(--accent-red-44)',
  warning: 'var(--accent-orange-44)',
  info: 'var(--accent-blue-44)',
};

function ToastItem({ toast }: { toast: Toast }) {
  const remove = useToastStore((s) => s.remove);

  useEffect(() => {
    const timer = setTimeout(() => remove(toast.id), 2500);
    return () => clearTimeout(timer);
  }, [toast.id, remove]);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '10px 14px',
        borderRadius: 'var(--radius-md)',
        background: BG_MAP[toast.type],
        border: `1px solid ${BORDER_MAP[toast.type]}`,
        color: 'var(--text-primary)',
        fontSize: 13,
        boxShadow: 'var(--shadow-md)',
        animation: 'toast-in 0.2s ease',
        minWidth: 220,
        maxWidth: 400,
      }}
    >
      {ICONS[toast.type]}
      <span style={{ flex: 1 }}>{toast.message}</span>
      <button
        onClick={() => remove(toast.id)}
        style={{
          background: 'none',
          border: 'none',
          color: 'var(--text-tertiary)',
          cursor: 'pointer',
          padding: 2,
          display: 'flex',
        }}
      >
        <X size={14} />
      </button>
    </div>
  );
}

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);

  if (toasts.length === 0) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 16,
        right: 16,
        zIndex: 300,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  );
}
