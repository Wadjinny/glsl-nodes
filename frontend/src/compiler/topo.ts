import type { Edge } from '@xyflow/react';
import type { RFNode } from '../nodes/library';

export interface TopoResult {
  order: string[]; // node ids in dependency order
  hasCycle: boolean;
}

/**
 * Topologically sort nodes so that every source is emitted before its target.
 * Uses Kahn's algorithm; reports a cycle if not all nodes can be ordered.
 */
export function topoSort(nodes: RFNode[], edges: Edge[]): TopoResult {
  const ids = nodes.map((n) => n.id);
  const indegree = new Map<string, number>(ids.map((id) => [id, 0]));
  const adj = new Map<string, string[]>(ids.map((id) => [id, []]));

  for (const e of edges) {
    if (!indegree.has(e.source) || !indegree.has(e.target)) continue;
    if (e.source === e.target) continue;
    adj.get(e.source)!.push(e.target);
    indegree.set(e.target, (indegree.get(e.target) ?? 0) + 1);
  }

  const queue = ids.filter((id) => (indegree.get(id) ?? 0) === 0);
  const order: string[] = [];

  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const next of adj.get(id) ?? []) {
      const d = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, d);
      if (d === 0) queue.push(next);
    }
  }

  return { order, hasCycle: order.length !== ids.length };
}
