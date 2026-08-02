import { memo, useEffect, useMemo, useState } from 'react';
import {
  Handle,
  Position,
  useUpdateNodeInternals,
  type NodeProps,
} from '@xyflow/react';
import {
  TYPE_COLORS,
  isFuncNode,
  rgbToHex,
  type ShaderNodeData,
} from '../types';
import { useGraph } from '../store';
import type { RFNode } from './library';

function ShaderNodeComponent({ id, data, selected }: NodeProps<RFNode>) {
  const d = data as ShaderNodeData;
  const sig = d.funcSignature ?? [];
  const renameNode = useGraph((s) => s.renameNode);
  const controlFocused = useGraph((s) => s.controlFocusId === id);
  const updateNodeInternals = useUpdateNodeInternals();
  const [draft, setDraft] = useState<string | null>(null);
  const funcDef = isFuncNode(d);

  // React Flow caches handle positions; new @in/@out sockets must force a
  // remeasure or the handle DOM exists but won't accept connections.
  const handleLayoutKey = useMemo(
    () =>
      [
        ...d.inputs.map((s) => `i:${s.id}:${s.type}`),
        ...d.outputs.map((s) => `o:${s.id}:${s.type}`),
        `sig:${sig.map((s) => `${s.type}:${s.name}`).join(',')}`,
      ].join('|'),
    [d.inputs, d.outputs, sig],
  );

  useEffect(() => {
    updateNodeInternals(id);
  }, [id, handleLayoutKey, updateNodeInternals]);

  const commit = () => {
    if (draft !== null) renameNode(id, draft);
    setDraft(null);
  };

  return (
    <div
      className={`shader-node${selected ? ' selected' : ''}${controlFocused ? ' control-focus' : ''}${funcDef ? ' shader-node--func' : ''}`}
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
          <>
            {d.label}
            {funcDef && <span className="shader-node__badge">func</span>}
          </>
        ) : (
          <input
            className="shader-node__title-input nodrag"
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
      {funcDef && sig.length > 0 && (
        <div className="shader-node__sig">
          ({sig.map((s) => `${s.type} ${s.name}`).join(', ')})
        </div>
      )}
      <div>
        {Array.from({ length: Math.max(d.inputs.length, d.outputs.length) }).map(
          (_, i) => {
            const input = d.inputs[i];
            const output = d.outputs[i];
            return (
              <div
                key={input?.id ?? `out-${output?.id ?? i}`}
                className="shader-node__row"
              >
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
          },
        )}
      </div>
    </div>
  );
}

export const ShaderNode = memo(ShaderNodeComponent);
