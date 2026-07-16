import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  useReactFlow,
  type Edge,
  type NodeTypes,
  type OnConnectEnd,
  type OnNodeDrag,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { ShaderNode } from '../nodes/ShaderNode';
import { NODE_TEMPLATES, type RFNode } from '../nodes/library';
import { outputTypeOf } from '../compiler/compile';
import { useGraph } from '../store';

/** Can this node be spliced into this edge? Needs an input and an output, and must not already be an endpoint. */
function canSplice(node: RFNode, edge: Edge): boolean {
  return (
    node.data.inputs.length > 0 &&
    node.data.outputs.length > 0 &&
    edge.source !== node.id &&
    edge.target !== node.id
  );
}

/** State for the drop-on-empty node search menu. */
interface SearchMenu {
  /** Popup position, relative to the panel body. */
  x: number;
  y: number;
  /** Where the new node goes, in graph coordinates. */
  flow: { x: number; y: number };
  /** Socket the connection was dragged from. */
  from: { nodeId: string; handleId: string; handleType: 'source' | 'target' };
}

function GraphPanelInner() {
  const nodes = useGraph((s) => s.nodes);
  const edges = useGraph((s) => s.edges);
  const onNodesChange = useGraph((s) => s.onNodesChange);
  const onEdgesChange = useGraph((s) => s.onEdgesChange);
  const onConnect = useGraph((s) => s.onConnect);
  const addNode = useGraph((s) => s.addNode);
  const addNodeAt = useGraph((s) => s.addNodeAt);
  const setSelected = useGraph((s) => s.setSelected);
  const graphRevision = useGraph((s) => s.graphRevision);
  const copySelection = useGraph((s) => s.copySelection);
  const cutSelection = useGraph((s) => s.cutSelection);
  const pasteClipboard = useGraph((s) => s.pasteClipboard);
  const insertNodeOnEdge = useGraph((s) => s.insertNodeOnEdge);
  const reconnectEdge = useGraph((s) => s.reconnectEdge);
  const deleteEdge = useGraph((s) => s.deleteEdge);
  const { screenToFlowPosition } = useReactFlow();

  const nodeTypes = useMemo<NodeTypes>(() => ({ shader: ShaderNode }), []);
  const bodyRef = useRef<HTMLDivElement>(null);

  // Ctrl/Cmd+C / X / V on selected nodes. Only preventDefault when we actually
  // acted, so native copy/paste keeps working everywhere else.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key !== 'c' && key !== 'x' && key !== 'v') return;
      // Never hijack the clipboard from text fields or the Monaco editor.
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, [contenteditable="true"], .monaco-editor')) return;
      // Copying selected page text wins over copying nodes.
      if (key !== 'v' && !window.getSelection()?.isCollapsed) return;

      const acted =
        key === 'c' ? copySelection() : key === 'x' ? cutSelection() : pasteClipboard();
      if (acted) e.preventDefault();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [copySelection, cutSelection, pasteClipboard]);

  // Blender-style splice: drag a node over a wire to insert it there.
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

  // Wire breaking: drag an edge end off its socket and drop it on empty space
  // to delete it; dropping on a socket rewires instead. (Plus double-click.)
  const reconnectDone = useRef(true);
  const reconnecting = useRef(false);
  const onReconnectStart = () => {
    reconnectDone.current = false;
    reconnecting.current = true;
  };
  const onReconnect = (oldEdge: Edge, connection: Parameters<typeof reconnectEdge>[1]) => {
    reconnectDone.current = true;
    reconnectEdge(oldEdge.id, connection);
  };
  const onReconnectEnd = (_event: unknown, edge: Edge) => {
    if (!reconnectDone.current) deleteEdge(edge.id);
    reconnectDone.current = true;
    // Cleared next tick so a same-gesture onConnectEnd can't open the menu.
    setTimeout(() => {
      reconnecting.current = false;
    }, 0);
  };

  // Drop a new connection on empty space -> searchable "add node" menu that
  // wires the picked node to the socket the drag started from.
  const [menu, setMenu] = useState<SearchMenu | null>(null);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);

  const onConnectEnd: OnConnectEnd = (event, connectionState) => {
    if (reconnecting.current) return;
    if (connectionState.isValid) return; // landed on a socket -> normal connect
    const fromNode = connectionState.fromNode;
    const fromHandle = connectionState.fromHandle;
    if (!fromNode || !fromHandle?.type) return;
    const p = 'changedTouches' in event ? event.changedTouches[0] : event;
    if (!p) return;

    const rect = bodyRef.current?.getBoundingClientRect();
    const local = rect
      ? { x: p.clientX - rect.left, y: p.clientY - rect.top }
      : { x: p.clientX, y: p.clientY };
    setMenu({
      x: Math.max(4, Math.min(local.x, (rect?.width ?? Infinity) - 230)),
      y: Math.max(4, Math.min(local.y, (rect?.height ?? Infinity) - 270)),
      flow: screenToFlowPosition({ x: p.clientX, y: p.clientY }),
      from: {
        nodeId: fromNode.id,
        handleId: fromHandle.id ?? '',
        handleType: fromHandle.type,
      },
    });
    setQuery('');
    setHighlight(0);
  };

  // Template sockets, probed once (a made node's data describes its sockets).
  const templateInfo = useMemo(
    () =>
      NODE_TEMPLATES.map((t) => ({
        kind: t.kind,
        label: t.label,
        data: t.make('__probe', 0, 0).data,
      })),
    [],
  );

  const matches = useMemo(() => {
    if (!menu) return [];
    const q = query.trim().toLowerCase();
    return templateInfo.filter((t) => {
      // Dragging from an output needs a node with inputs, and vice versa.
      const fits =
        menu.from.handleType === 'source'
          ? t.data.inputs.length > 0
          : t.data.outputs.length > 0;
      if (!fits) return false;
      return !q || t.label.toLowerCase().includes(q) || t.kind.toLowerCase().includes(q);
    });
  }, [menu, query, templateInfo]);

  const activeIndex = Math.min(highlight, Math.max(0, matches.length - 1));

  const pickNode = (kind: string) => {
    if (!menu) return;
    const id = addNodeAt(kind, menu.flow.x - 75, menu.flow.y - 15);
    setMenu(null);
    if (!id) return;

    const state = useGraph.getState();
    const newNode = state.nodes.find((n) => n.id === id);
    const fromNode = state.nodes.find((n) => n.id === menu.from.nodeId);
    if (!newNode || !fromNode) return;

    if (menu.from.handleType === 'source') {
      // Dragged from an output: the new node receives the wire.
      const srcType = outputTypeOf(fromNode, menu.from.handleId);
      const inputs = newNode.data.inputs;
      const chosen = inputs.find((s) => s.type === srcType) ?? inputs[0];
      if (chosen) {
        onConnect({
          source: fromNode.id,
          sourceHandle: menu.from.handleId,
          target: id,
          targetHandle: chosen.id,
        });
      }
    } else {
      // Dragged from an input: the new node feeds it.
      const inType = fromNode.data.inputs.find(
        (s) => s.id === menu.from.handleId,
      )?.type;
      const outputs = newNode.data.outputs;
      const chosen = outputs.find((s) => s.type === inType) ?? outputs[0];
      if (chosen) {
        onConnect({
          source: id,
          sourceHandle: chosen.id,
          target: fromNode.id,
          targetHandle: menu.from.handleId,
        });
      }
    }
    setSelected(id);
  };

  // Close the search menu on any pointer press outside of it.
  useEffect(() => {
    if (!menu) return;
    const close = (e: PointerEvent) => {
      if (!(e.target as Element | null)?.closest?.('.node-search')) {
        setMenu(null);
      }
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [menu]);

  return (
    <div className="panel">
      <div className="panel-header">
        <span>Nodes</span>
        <div className="toolbar">
          {NODE_TEMPLATES.map((t) => (
            <button key={t.kind} onClick={() => addNode(t.kind)}>
              + {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="panel-body" ref={bodyRef}>
        <ReactFlow
          // Remount when a project is opened/imported so fitView reruns.
          key={graphRevision}
          nodes={nodes}
          edges={displayEdges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onConnectEnd={onConnectEnd}
          onNodeDrag={onNodeDrag}
          onNodeDragStop={onNodeDragStop}
          onReconnectStart={onReconnectStart}
          onReconnect={onReconnect}
          onReconnectEnd={onReconnectEnd}
          onEdgeDoubleClick={(_e, edge) => deleteEdge(edge.id)}
          // No onPaneClick clearing: the code editor sticks to the last
          // selected node even after clicking the pane deselects it.
          colorMode="dark"
          // Double-click renames a node; don't let it zoom the canvas too.
          zoomOnDoubleClick={false}
          fitView
          deleteKeyCode={['Backspace', 'Delete']}
          // Don't let React Flow swallow the spacebar (default pan key) —
          // it otherwise blocks typing spaces in the Monaco code editor.
          panActivationKeyCode={null}
        >
          <Background />
          <Controls />
          <MiniMap pannable zoomable />
        </ReactFlow>

        {menu && (
          <div className="node-search" style={{ left: menu.x, top: menu.y }}>
            <input
              autoFocus
              placeholder="Search nodes…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setHighlight(0);
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setHighlight((h) => Math.min(h + 1, matches.length - 1));
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setHighlight((h) => Math.max(h - 1, 0));
                } else if (e.key === 'Enter') {
                  const m = matches[activeIndex];
                  if (m) pickNode(m.kind);
                } else if (e.key === 'Escape') {
                  setMenu(null);
                }
              }}
            />
            <div className="node-search__list">
              {matches.map((t, i) => (
                <button
                  key={t.kind}
                  className={i === activeIndex ? 'active' : ''}
                  onMouseEnter={() => setHighlight(i)}
                  onClick={() => pickNode(t.kind)}
                >
                  {t.label}
                </button>
              ))}
              {matches.length === 0 && (
                <div className="node-search__empty">No matching nodes</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function GraphPanel() {
  return (
    <ReactFlowProvider>
      <GraphPanelInner />
    </ReactFlowProvider>
  );
}
