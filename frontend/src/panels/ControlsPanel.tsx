import { useEffect, useState } from 'react';
import type { RFNode } from '../nodes/library';
import { useGraph } from '../store';
import { clamp, hexToRgb, isControlNode, rgbToHex } from '../types';

function controlPreview(n: RFNode): string {
  if (n.data.isVec2) {
    const [vx, vy] = n.data.vec ?? [0, 0];
    return `(${vx.toFixed(2)}, ${vy.toFixed(2)})`;
  }
  if (n.data.isColor) {
    return rgbToHex(n.data.rgb);
  }
  return (n.data.value ?? 0).toFixed(3);
}

function ControlEditor({ node }: { node: RFNode }) {
  const updateSliderParam = useGraph((s) => s.updateSliderParam);
  const updateColorParam = useGraph((s) => s.updateColorParam);
  const updateVec2Param = useGraph((s) => s.updateVec2Param);

  if (node.data.isVec2) {
    const min = node.data.min ?? 0;
    const max = node.data.max ?? 1;
    const span = max - min || 1;
    const [vx, vy] = node.data.vec ?? [0, 0];
    const valueFromPad = (
      e: React.PointerEvent<HTMLDivElement>,
    ): [number, number] => {
      const rect = e.currentTarget.getBoundingClientRect();
      const nx = clamp((e.clientX - rect.left) / rect.width, 0, 1);
      const ny = clamp((e.clientY - rect.top) / rect.height, 0, 1);
      // Screen y grows downward; the pad's y axis grows upward.
      return [min + nx * span, min + (1 - ny) * span];
    };
    return (
      <div className="control-row">
        <div className="control-top">
          <span className="control-label">{node.data.label}</span>
          <span className="control-value">
            ({vx.toFixed(3)}, {vy.toFixed(3)})
          </span>
        </div>
        <div
          className="vec2-pad"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            updateVec2Param(node.id, { vec: valueFromPad(e) });
          }}
          onPointerMove={(e) => {
            if (e.buttons & 1) {
              updateVec2Param(node.id, { vec: valueFromPad(e) });
            }
          }}
        >
          <div
            className="vec2-pad__dot"
            style={{
              left: `${((vx - min) / span) * 100}%`,
              top: `${(1 - (vy - min) / span) * 100}%`,
            }}
          />
        </div>
        <div className="control-range">
          <label>
            min
            <input
              type="number"
              value={min}
              onChange={(e) =>
                updateVec2Param(node.id, { min: Number(e.target.value) })
              }
            />
          </label>
          <label>
            max
            <input
              type="number"
              value={max}
              onChange={(e) =>
                updateVec2Param(node.id, { max: Number(e.target.value) })
              }
            />
          </label>
        </div>
      </div>
    );
  }

  if (node.data.isColor) {
    const hex = rgbToHex(node.data.rgb);
    return (
      <div className="control-row">
        <div className="control-top">
          <span className="control-label">{node.data.label}</span>
          <span className="control-value">{hex}</span>
        </div>
        <input
          type="color"
          value={hex}
          onChange={(e) =>
            updateColorParam(node.id, hexToRgb(e.target.value))
          }
        />
      </div>
    );
  }

  const value = node.data.value ?? 0;
  const min = node.data.min ?? 0;
  const max = node.data.max ?? 1;
  const step = node.data.step ?? 0.01;
  return (
    <div className="control-row">
      <div className="control-top">
        <span className="control-label">{node.data.label}</span>
        <span className="control-value">{value.toFixed(3)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) =>
          updateSliderParam(node.id, { value: Number(e.target.value) })
        }
      />
      <div className="control-range">
        <label>
          min
          <input
            type="number"
            value={min}
            onChange={(e) =>
              updateSliderParam(node.id, { min: Number(e.target.value) })
            }
          />
        </label>
        <label>
          max
          <input
            type="number"
            value={max}
            onChange={(e) =>
              updateSliderParam(node.id, { max: Number(e.target.value) })
            }
          />
        </label>
        <label>
          step
          <input
            type="number"
            value={step}
            onChange={(e) =>
              updateSliderParam(node.id, { step: Number(e.target.value) })
            }
          />
        </label>
      </div>
    </div>
  );
}

export function ControlsPanel() {
  const nodes = useGraph((s) => s.nodes);
  const setControlFocus = useGraph((s) => s.setControlFocus);
  const controls = nodes.filter((n) => isControlNode(n.data));
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected =
    controls.find((n) => n.id === selectedId) ?? controls[0] ?? null;

  // Drop stale panel picks when the control node is deleted.
  useEffect(() => {
    if (selectedId && !controls.some((n) => n.id === selectedId)) {
      setSelectedId(controls[0]?.id ?? null);
    }
  }, [controls, selectedId]);

  // Mirror the open control onto the graph as a non-selection highlight.
  useEffect(() => {
    setControlFocus(selected?.id ?? null);
    return () => setControlFocus(null);
  }, [selected?.id, setControlFocus]);

  return (
    <div className="panel">
      <div className="panel-header">Controls</div>
      <div className="panel-body">
        {controls.length === 0 ? (
          <div className="empty-hint">
            Add a Slider or Color node to create a live control here.
          </div>
        ) : (
          <div className="controls-split">
            <ul className="controls-nav">
              {controls.map((n) => {
                const active = n.id === selected?.id;
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      className={
                        active
                          ? 'controls-nav__item is-active'
                          : 'controls-nav__item'
                      }
                      onClick={() => setSelectedId(n.id)}
                    >
                      {n.data.isColor ? (
                        <span
                          className="controls-nav__swatch"
                          style={{ background: rgbToHex(n.data.rgb) }}
                        />
                      ) : null}
                      <span className="controls-nav__label">{n.data.label}</span>
                      <span className="controls-nav__value">
                        {controlPreview(n)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="controls-detail">
              {selected ? <ControlEditor node={selected} /> : null}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
