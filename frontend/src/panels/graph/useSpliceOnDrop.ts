import { useMemo, useState } from 'react';
import type { Edge, OnNodeDrag } from '@xyflow/react';
import type { RFNode } from '../../nodes/library';
import { useGraph } from '../../store';

/** Can this node be spliced into this edge? Needs value in/out, and must not already be an endpoint. */
function canSplice(node: RFNode, edge: Edge): boolean {
  return (
    node.data.inputs.some((s) => s.type !== 'func') &&
    node.data.outputs.length > 0 &&
    node.data.outputs[0]?.type !== 'func' &&
    edge.source !== node.id &&
    edge.target !== node.id
  );
}

/**
 * Blender-style splice: drag a node over a wire (highlighted) and drop to
 * insert it there. Returns the edges to render (with the highlight applied)
 * and the drag handlers to pass to React Flow.
 */
export function useSpliceOnDrop(edges: Edge[]) {
  const insertNodeOnEdge = useGraph((s) => s.insertNodeOnEdge);
  const [spliceEdgeId, setSpliceEdgeId] = useState<string | null>(null);

  /** Topmost splice-eligible edge under the pointer (React Flow renders a wide invisible interaction stroke per edge, so this is forgiving). */
  const findSpliceEdge = (
    event: MouseEvent | TouchEvent,
    node: RFNode,
  ): string | null => {
    const p = 'touches' in event ? event.touches[0] : event;
    if (!p) return null;
    for (const el of document.elementsFromPoint(p.clientX, p.clientY)) {
      const g = el.closest?.('.react-flow__edge');
      if (!g) continue;
      const id =
        g.getAttribute('data-id') ??
        g.getAttribute('data-testid')?.replace(/^rf__edge-/, '');
      if (!id) continue;
      const edge = edges.find((e) => e.id === id);
      if (edge && canSplice(node, edge)) return id;
    }
    return null;
  };

  const onNodeDrag: OnNodeDrag<RFNode> = (event, node, dragged) => {
    // Splicing a multi-node selection is ambiguous — only track single drags.
    setSpliceEdgeId(dragged.length === 1 ? findSpliceEdge(event, node) : null);
  };

  const onNodeDragStop: OnNodeDrag<RFNode> = (_event, node) => {
    if (spliceEdgeId) insertNodeOnEdge(node.id, spliceEdgeId);
    setSpliceEdgeId(null);
  };

  // Highlight the wire the dragged node would be spliced into.
  const displayEdges = useMemo(
    () =>
      spliceEdgeId
        ? edges.map((e) =>
            e.id === spliceEdgeId ? { ...e, className: 'splice-target' } : e,
          )
        : edges,
    [edges, spliceEdgeId],
  );

  return { displayEdges, onNodeDrag, onNodeDragStop };
}
