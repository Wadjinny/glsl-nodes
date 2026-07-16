import { useCallback, useRef } from 'react';
import Editor, { type Monaco } from '@monaco-editor/react';
import { useGraph } from '../store';
import { registerGLSL } from '../monaco/glsl-language';

export function CodePanel() {
  const selectedNodeId = useGraph((s) => s.selectedNodeId);
  const nodes = useGraph((s) => s.nodes);
  const updateNodeGlsl = useGraph((s) => s.updateNodeGlsl);
  const debounceRef = useRef<number | undefined>(undefined);

  const node = nodes.find((n) => n.id === selectedNodeId);

  const handleMount = useCallback((_editor: unknown, monaco: Monaco) => {
    registerGLSL(monaco);
  }, []);

  const handleChange = useCallback(
    (value: string | undefined) => {
      if (!selectedNodeId || value === undefined) return;
      window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => {
        updateNodeGlsl(selectedNodeId, value);
      }, 250);
    },
    [selectedNodeId, updateNodeGlsl],
  );

  const editable =
    node &&
    !node.data.isInput &&
    !node.data.isOutput &&
    !node.data.isSlider &&
    !node.data.isColor &&
    !node.data.isVec2;

  return (
    <div className="panel">
      <div className="panel-header">
        <span>Shader Code{node ? ` — ${node.data.label}` : ''}</span>
        {editable && (
          <span className="panel-hint">
            uv · fragCoord · resolution · time · mouse are built in — add
            inputs with // @in &lt;type&gt; &lt;name&gt;
          </span>
        )}
      </div>
      <div className="panel-body">
        {editable ? (
          <Editor
            key={node.id}
            language="glsl"
            theme="vs-dark"
            defaultValue={node.data.glsl}
            onMount={handleMount}
            onChange={handleChange}
            options={{
              fontSize: 13,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              automaticLayout: true,
              tabSize: 2,
            }}
          />
        ) : (
          <div className="empty-hint">
            {node
              ? `The ${node.data.label} node has no editable code.`
              : 'Select a node to edit its GLSL function body.'}
          </div>
        )}
      </div>
    </div>
  );
}
