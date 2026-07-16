import { useMemo, useRef } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  useReactFlow,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { ShaderNode } from '../nodes/ShaderNode';
import { NODE_TEMPLATES } from '../nodes/library';
import { useGraph } from '../store';
import { useClipboardShortcuts } from './graph/useClipboardShortcuts';
import { useSpliceOnDrop } from './graph/useSpliceOnDrop';
import { useWireBreaking } from './graph/useWireBreaking';
import { NodeSearchMenu, useNodeSearchMenu } from './graph/NodeSearchMenu';

function GraphPanelInner() {
  const nodes = useGraph((s) => s.nodes);
  const edges = useGraph((s) => s.edges);
  const onNodesChange = useGraph((s) => s.onNodesChange);
  const onEdgesChange = useGraph((s) => s.onEdgesChange);
  const onConnect = useGraph((s) => s.onConnect);
  const addNodeAt = useGraph((s) => s.addNodeAt);
  const graphRevision = useGraph((s) => s.graphRevision);
  const { screenToFlowPosition } = useReactFlow();

  const nodeTypes = useMemo<NodeTypes>(() => ({ shader: ShaderNode }), []);
  const bodyRef = useRef<HTMLDivElement>(null);

  useClipboardShortcuts();
  const { displayEdges, onNodeDrag, onNodeDragStop } = useSpliceOnDrop(edges);
  const {
    onReconnectStart,
    onReconnect,
    onReconnectEnd,
    onEdgeDoubleClick,
    reconnecting,
  } = useWireBreaking();
  const { menu, onConnectEnd, closeMenu } = useNodeSearchMenu(
    bodyRef,
    reconnecting,
  );

  // Place toolbar nodes in the visible viewport center (not fixed flow coords).
  const addNodeInView = (kind: string) => {
    const rect = bodyRef.current?.getBoundingClientRect();
    const center = screenToFlowPosition({
      x: (rect?.left ?? 0) + (rect?.width ?? 0) / 2,
      y: (rect?.top ?? 0) + (rect?.height ?? 0) / 2,
    });
    // Small jitter so repeated adds don't stack perfectly.
    addNodeAt(
      kind,
      center.x - 75 + Math.random() * 40,
      center.y - 20 + Math.random() * 40,
    );
  };

  return (
    <div className="panel">
      <div className="panel-header">
        <span>Nodes</span>
        <div className="toolbar">
          {NODE_TEMPLATES.map((t) => (
            <button key={t.kind} onClick={() => addNodeInView(t.kind)}>
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
          onEdgeDoubleClick={onEdgeDoubleClick}
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

        {menu && <NodeSearchMenu menu={menu} onClose={closeMenu} />}
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
