import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';

interface DocNode {
  id: string;
  title: string;
  type: string;
  status: string;
  deletedAt: string | null;
}

interface DocLink {
  fromDocId: string;
  toDocId: string;
  relation: string;
}

interface DocumentLinkGraphProps {
  reqId: string;
}

const TYPE_COLORS: Record<string, string> = {
  requirement_spec: 'var(--accent-blue)',
  design_spec: 'var(--accent-purple)',
  test_case: 'var(--accent-green)',
  test_report: 'var(--accent-orange)',
  release_doc: 'var(--accent-red)',
};

export function DocumentLinkGraph({ reqId }: DocumentLinkGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [nodes, setNodes] = useState<DocNode[]>([]);
  const [links, setLinks] = useState<DocLink[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!reqId) return;
    setLoading(true);
    Promise.all([
      fetch(`/api/documents?reqId=${reqId}`).then(r => r.json()) as Promise<DocNode[]>,
      fetch(`/api/documents/links?reqId=${reqId}`).catch(() => []).then(r => Array.isArray(r) ? r : r.json()) as Promise<DocLink[]>,
    ]).then(([docs, docLinks]) => {
      setNodes(docs);
      setLinks(docLinks);
      setLoading(false);
    });
  }, [reqId]);

  useEffect(() => {
    if (!svgRef.current || nodes.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const width = svgRef.current.clientWidth || 800;
    const height = svgRef.current.clientHeight || 500;

    // Build link data with source/target as indices
    const linkData = links.map(l => ({
      source: nodes.findIndex(n => n.id === l.fromDocId),
      target: nodes.findIndex(n => n.id === l.toDocId),
      relation: l.relation,
    })).filter(l => (l as any).source >= 0 && (l as any).target >= 0) as any[];

    const simulation = d3.forceSimulation(nodes as d3.SimulationNodeDatum[])
      .force('link', d3.forceLink(linkData).id((_d: any, i: number) => i).distance(120))
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(50));

    // Arrow marker
    svg.append('defs').append('marker')
      .attr('id', 'arrow')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 28)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', 'var(--text-tertiary)');

    const g = svg.append('g');

    // Links
    const link = g.selectAll('.link')
      .data(linkData)
      .enter().append('line')
      .attr('class', 'link')
      .attr('stroke', 'var(--border-default)')
      .attr('stroke-width', 1.5)
      .attr('marker-end', 'url(#arrow)');

    // Link labels
    const linkLabel = g.selectAll('.link-label')
      .data(linkData)
      .enter().append('text')
      .attr('class', 'link-label')
      .attr('font-size', 9)
      .attr('fill', 'var(--text-tertiary)')
      .text(d => d.relation);

    // Nodes
    const node = g.selectAll('.node')
      .data(nodes)
      .enter().append('g')
      .attr('class', 'node')
      .style('cursor', 'pointer')
      .call(d3.drag<any, any>()
        .on('start', (event, d) => {
          if (!event.active) simulation.alphaTarget(0.3).restart();
          d.fx = d.x;
          d.fy = d.y;
        })
        .on('drag', (event, d) => {
          d.fx = event.x;
          d.fy = event.y;
        })
        .on('end', (event, d) => {
          if (!event.active) simulation.alphaTarget(0);
          d.fx = null;
          d.fy = null;
        }));

    node.append('circle')
      .attr('r', 20)
      .attr('fill', (d: any) => TYPE_COLORS[d.type] ?? 'var(--text-tertiary)')
      .attr('stroke', (d: any) => d.deletedAt ? 'var(--accent-red)' : 'var(--border-default)')
      .attr('stroke-width', (d: any) => d.deletedAt ? 3 : 1.5);

    node.append('text')
      .attr('dy', 35)
      .attr('text-anchor', 'middle')
      .attr('font-size', 10)
      .attr('fill', (d: any) => d.deletedAt ? 'var(--accent-red)' : 'var(--text-secondary)')
      .text((d: any) => {
        const t = d.title;
        return t.length > 12 ? t.slice(0, 10) + '...' : t;
      });

    // Upstream deleted warning label
    node.filter((d: any) => {
      // Find if any upstream (source of links targeting this node) is deleted
      const upstreamIds = links.filter(l => l.toDocId === d.id).map(l => l.fromDocId);
      return upstreamIds.some(id => nodes.find(n => n.id === id)?.deletedAt);
    }).append('text')
      .attr('dy', -28)
      .attr('text-anchor', 'middle')
      .attr('font-size', 9)
      .attr('fill', 'var(--accent-red)')
      .text('上游已删除');

    simulation.on('tick', () => {
      link
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y);

      linkLabel
        .attr('x', (d: any) => (d.source.x + d.target.x) / 2)
        .attr('y', (d: any) => (d.source.y + d.target.y) / 2);

      node.attr('transform', (d: any) => `translate(${d.x},${d.y})`);
    });

    return () => {
      simulation.stop();
    };
  }, [nodes, links]);

  if (!reqId) return <div style={{ color: 'var(--text-tertiary)', padding: 24 }}>请输入需求ID</div>;
  if (loading) return <div style={{ color: 'var(--text-tertiary)', padding: 24 }}>加载中...</div>;
  if (nodes.length === 0) return <div style={{ color: 'var(--text-tertiary)', padding: 24 }}>暂无文档数据</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-primary)' }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-default)', display: 'flex', gap: 16, alignItems: 'center' }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>文档关联图</span>
        <div style={{ display: 'flex', gap: 10 }}>
          {Object.entries(TYPE_COLORS).map(([type, color]) => (
            <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: color }} />
              <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{type.replace('_', ' ')}</span>
            </div>
          ))}
        </div>
      </div>
      <svg ref={svgRef} style={{ flex: 1, width: '100%' }} />
    </div>
  );
}
