import { useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { ShaderNode } from '../nodes/ShaderNode';
import { NODE_TEMPLATES } from '../nodes/library';
import { useGraph } from '../store';

export function GraphPanel() {
  const nodes = useGraph((s) => s.nodes);
  const edges = useGraph((s) => s.edges);
  const onNodesChange = useGraph((s) => s.onNodesChange);
  const onEdgesChange = useGraph((s) => s.onEdgesChange);
  const onConnect = useGraph((s) => s.onConnect);
  const addNode = useGraph((s) => s.addNode);
  const setSelected = useGraph((s) => s.setSelected);

  const nodeTypes = useMemo<NodeTypes>(() => ({ shader: ShaderNode }), []);

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
      <div className="panel-body">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onPaneClick={() => setSelected(null)}
          colorMode="dark"
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
      </div>
    </div>
  );
}
