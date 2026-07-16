import { memo, useState } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { TYPE_COLORS, rgbToHex, type ShaderNodeData } from '../types';
import { useGraph } from '../store';
import type { RFNode } from './library';

function ShaderNodeComponent({ id, data, selected }: NodeProps<RFNode>) {
  const d = data as ShaderNodeData;
  const rows = Math.max(d.inputs.length, d.outputs.length);
  const renameNode = useGraph((s) => s.renameNode);
  const controlFocused = useGraph((s) => s.controlFocusId === id);
  /** Rename draft; null = not editing. */
  const [draft, setDraft] = useState<string | null>(null);

  const commit = () => {
    if (draft !== null) renameNode(id, draft);
    setDraft(null);
  };

  return (
    <div
      className={`shader-node${selected ? ' selected' : ''}${controlFocused ? ' control-focus' : ''}`}
    >
      <div
        className="shader-node__title"
        title="Double-click to rename"
        onDoubleClick={(e) => {
          e.stopPropagation();
          setDraft(d.label);
        }}
      >
        {draft === null ? (
          d.label
        ) : (
          <input
            // nodrag: keep React Flow from starting a node drag on the input.
            className="shader-node__title-input nodrag"
            // size=1 kills the input's intrinsic ~20ch width so it doesn't
            // widen the (content-sized) node; CSS width fills the title bar.
            size={1}
            value={draft}
            autoFocus
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit();
              else if (e.key === 'Escape') setDraft(null);
            }}
          />
        )}
      </div>
      {d.isSlider && (
        <div className="shader-node__value">{(d.value ?? 0).toFixed(3)}</div>
      )}
      {d.isVec2 && (
        <div className="shader-node__value">
          ({(d.vec?.[0] ?? 0).toFixed(2)}, {(d.vec?.[1] ?? 0).toFixed(2)})
        </div>
      )}
      {d.isColor && (
        <div className="shader-node__value">
          <span
            className="shader-node__swatch"
            style={{ background: rgbToHex(d.rgb) }}
          />
          {rgbToHex(d.rgb)}
        </div>
      )}
      <div>
        {Array.from({ length: rows }).map((_, i) => {
          const input = d.inputs[i];
          const output = d.outputs[i];
          return (
            <div key={i} className="shader-node__row">
              <div style={{ flex: 1 }}>
                {input && (
                  <>
                    <Handle
                      id={input.id}
                      type="target"
                      position={Position.Left}
                      style={{ background: TYPE_COLORS[input.type] }}
                    />
                    <span className="shader-node__socket-label">
                      {input.name}
                      <span className="shader-node__type">{input.type}</span>
                    </span>
                  </>
                )}
              </div>
              <div style={{ flex: 1, textAlign: 'right' }}>
                {output && (
                  <>
                    <span className="shader-node__socket-label">
                      <span className="shader-node__type">{output.type}</span>
                      {output.name}
                    </span>
                    <Handle
                      id={output.id}
                      type="source"
                      position={Position.Right}
                      style={{ background: TYPE_COLORS[output.type] }}
                    />
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export const ShaderNode = memo(ShaderNodeComponent);
