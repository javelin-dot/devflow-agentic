import { useStats, useHealth } from '../api/hooks';
import { STAGE_LABELS } from '@devflow/shared';
import type { Stage } from '@devflow/shared';

const STAGES: Stage[] = ['backlog', 'analyzing', 'development', 'uat', 'prerelease', 'released'];

const STAGE_COLORS: Record<Stage, string> = {
  backlog: 'var(--text-tertiary)',
  analyzing: 'var(--accent-orange)',
  development: 'var(--accent-blue)',
  uat: 'var(--accent-purple)',
  prerelease: 'var(--accent-coral)',
  released: 'var(--accent-green)',
};

function MetricCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div style={{
      background: 'var(--bg-secondary)',
      borderRadius: 8,
      padding: '20px 24px',
      flex: 1,
      minWidth: 140,
      border: `1px solid ${color}33`,
    }}>
      <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 36, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

export function DashboardView() {
  const { data: stats, isLoading: statsLoading } = useStats();
  const { data: health, isLoading: healthLoading } = useHealth();

  if (statsLoading || healthLoading) {
    return (
      <div style={{ padding: 24, color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        加载中...
      </div>
    );
  }

  const byStage = stats?.byStage ?? {};
  const maxCount = Math.max(...Object.values(byStage), 1);
  const tableRowCounts = health?.tableRowCounts ?? {};

  return (
    <div style={{ padding: 24, overflowY: 'auto', height: '100%', boxSizing: 'border-box' }}>
      <h2 style={{ margin: '0 0 20px', color: 'var(--text-primary)', fontSize: 20, fontWeight: 600 }}>系统仪表板</h2>

      {/* Row 1: Metric cards */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <MetricCard label="需求总数" value={stats?.totalRequirements ?? 0} color="var(--accent-blue)" />
        <MetricCard label="本周发布" value={stats?.weeklyThroughput ?? 0} color="var(--accent-green)" />
        <MetricCard label="平均周期" value={`${stats?.avgCycleDays ?? 0} 天`} color="var(--accent-purple)" />
        <MetricCard
          label="未解决缺陷"
          value={stats?.openDefects ?? 0}
          color={(stats?.openDefects ?? 0) > 0 ? 'var(--accent-red)' : 'var(--accent-green)'}
        />
      </div>

      {/* Row 2: Stage distribution bar chart */}
      <div style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: 20, marginBottom: 24, border: '1px solid var(--bg-tertiary)' }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 16 }}>需求阶段分布</div>
        {STAGES.map(stage => {
          const count = byStage[stage] ?? 0;
          const barWidth = (count / maxCount) * 280;
          return (
            <div key={stage} style={{ display: 'flex', alignItems: 'center', marginBottom: 10, gap: 12 }}>
              <div style={{ width: 80, fontSize: 12, color: 'var(--text-tertiary)', textAlign: 'right', flexShrink: 0 }}>
                {STAGE_LABELS[stage]}
              </div>
              <div style={{ width: 280, background: 'var(--bg-primary)', borderRadius: 3, height: 18, flexShrink: 0 }}>
                <div style={{
                  width: barWidth,
                  height: 18,
                  background: STAGE_COLORS[stage],
                  borderRadius: 3,
                  transition: 'width 0.3s ease',
                }} />
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', minWidth: 24 }}>{count}</div>
            </div>
          );
        })}
      </div>

      {/* Row 3: System health card */}
      <div style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: 20, marginBottom: 24, border: '1px solid var(--bg-tertiary)' }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 16 }}>系统状态</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>运行时间: </span>
            <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>{formatUptime(health?.uptimeSeconds ?? 0)}</span>
          </div>
          <div>
            <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>数据库大小: </span>
            <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>{health?.dbSizeKb ?? 0} KB</span>
          </div>
          <div>
            <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>状态: </span>
            <span style={{
              fontSize: 12,
              fontWeight: 600,
              padding: '2px 8px',
              borderRadius: 3,
              background: health?.status === 'ok' ? 'var(--accent-green)' : 'var(--accent-red)',
              color: 'var(--text-inverse)',
              border: `1px solid ${health?.status === 'ok' ? 'var(--accent-green)' : 'var(--accent-red)'}`,
            }}>
              {health?.status === 'ok' ? '正常' : '异常'}
            </span>
          </div>
          <div>
            <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>版本: </span>
            <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>{health?.version}</span>
          </div>
          <div>
            <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Node: </span>
            <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>{health?.nodeVersion}</span>
          </div>
          <div>
            <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>平台: </span>
            <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>{health?.platform}</span>
          </div>
        </div>
      </div>

      {/* Row 4: Table row counts */}
      <div style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: 20, border: '1px solid var(--bg-tertiary)' }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 16 }}>数据表统计</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
          {Object.entries(tableRowCounts).map(([table, count]) => (
            <div key={table} style={{
              background: 'var(--bg-primary)',
              borderRadius: 6,
              padding: '10px 14px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{table}</span>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--accent-blue)' }}>{count}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
