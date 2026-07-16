import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { TYPE_COLORS, type ShaderNodeData } from '../types';
import type { RFNode } from './library';

function ShaderNodeComponent({ data, selected }: NodeProps<RFNode>) {
  const d = data as ShaderNodeData;
  const rows = Math.max(d.inputs.length, d.outputs.length);

  return (
    <div className={`shader-node${selected ? ' selected' : ''}`}>
      <div className="shader-node__title">{d.label}</div>
      {d.isSlider && (
        <div className="shader-node__value">{(d.value ?? 0).toFixed(3)}</div>
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
