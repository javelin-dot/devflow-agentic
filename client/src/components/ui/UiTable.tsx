import { UiEmptyState } from './UiEmptyState';

export interface Column<T> {
  key: string;
  title: string;
  width?: number | string;
  render?: (row: T) => React.ReactNode;
}

interface Props<T> {
  columns: Column<T>[];
  data: T[];
  rowKey: (row: T) => string;
  emptyTitle?: string;
  emptyDescription?: string;
  style?: React.CSSProperties;
}

export function UiTable<T extends Record<string, unknown>>({
  columns,
  data,
  rowKey,
  emptyTitle,
  emptyDescription,
  style,
}: Props<T>) {
  if (data.length === 0) {
    return (
      <UiEmptyState
        title={emptyTitle ?? '暂无数据'}
        description={emptyDescription}
      />
    );
  }

  return (
    <table
      style={{
        width: '100%',
        borderCollapse: 'collapse',
        fontSize: 13,
        ...style,
      }}
    >
      <thead>
        <tr>
          {columns.map((col) => (
            <th
              key={col.key}
              style={{
                textAlign: 'left',
                padding: '8px 10px',
                borderBottom: '1px solid var(--border-default)',
                color: 'var(--text-tertiary)',
                fontWeight: 600,
                fontSize: 12,
                whiteSpace: 'nowrap',
                width: col.width,
              }}
            >
              {col.title}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.map((row) => (
          <tr
            key={rowKey(row)}
            style={{ transition: 'background 0.1s' }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLTableRowElement).style.background = 'var(--bg-hover)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLTableRowElement).style.background = 'transparent';
            }}
          >
            {columns.map((col) => (
              <td
                key={col.key}
                style={{
                  padding: '8px 10px',
                  borderBottom: '1px solid var(--border-default)',
                  color: 'var(--text-primary)',
                  verticalAlign: 'middle',
                }}
              >
                {col.render ? col.render(row) : String((row as Record<string, unknown>)[col.key] ?? '')}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
