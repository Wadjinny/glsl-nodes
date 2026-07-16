import { useGraph } from '../store';
import { hexToRgb, rgbToHex } from '../types';

export function ControlsPanel() {
  const nodes = useGraph((s) => s.nodes);
  const updateSliderParam = useGraph((s) => s.updateSliderParam);
  const updateColorParam = useGraph((s) => s.updateColorParam);
  const updateVec2Param = useGraph((s) => s.updateVec2Param);

  const controls = nodes.filter(
    (n) => n.data.isSlider || n.data.isColor || n.data.isVec2,
  );

  return (
    <div className="panel">
      <div className="panel-header">Controls</div>
      <div className="panel-body" style={{ overflow: 'auto' }}>
        {controls.length === 0 ? (
          <div className="empty-hint">
            Add a Slider or Color node to create a live control here.
          </div>
        ) : (
          <div className="controls-list">
            {controls.map((n) => {
              if (n.data.isVec2) {
                const min = n.data.min ?? 0;
                const max = n.data.max ?? 1;
                const span = max - min || 1;
                const [vx, vy] = n.data.vec ?? [0, 0];
                const valueFromPad = (
                  e: React.PointerEvent<HTMLDivElement>,
                ): [number, number] => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const nx = Math.min(
                    1,
                    Math.max(0, (e.clientX - rect.left) / rect.width),
                  );
                  const ny = Math.min(
                    1,
                    Math.max(0, (e.clientY - rect.top) / rect.height),
                  );
                  // Screen y grows downward; the pad's y axis grows upward.
                  return [min + nx * span, min + (1 - ny) * span];
                };
                return (
                  <div key={n.id} className="control-row">
                    <div className="control-top">
                      <span className="control-label">{n.data.label}</span>
                      <span className="control-value">
                        ({vx.toFixed(3)}, {vy.toFixed(3)})
                      </span>
                    </div>
                    <div
                      className="vec2-pad"
                      onPointerDown={(e) => {
                        e.currentTarget.setPointerCapture(e.pointerId);
                        updateVec2Param(n.id, { vec: valueFromPad(e) });
                      }}
                      onPointerMove={(e) => {
                        if (e.buttons & 1) {
                          updateVec2Param(n.id, { vec: valueFromPad(e) });
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
                            updateVec2Param(n.id, {
                              min: Number(e.target.value),
                            })
                          }
                        />
                      </label>
                      <label>
                        max
                        <input
                          type="number"
                          value={max}
                          onChange={(e) =>
                            updateVec2Param(n.id, {
                              max: Number(e.target.value),
                            })
                          }
                        />
                      </label>
                    </div>
                  </div>
                );
              }
              if (n.data.isColor) {
                const hex = rgbToHex(n.data.rgb);
                return (
                  <div key={n.id} className="control-row">
                    <div className="control-top">
                      <span className="control-label">{n.data.label}</span>
                      <span className="control-value">{hex}</span>
                    </div>
                    <input
                      type="color"
                      value={hex}
                      onChange={(e) =>
                        updateColorParam(n.id, hexToRgb(e.target.value))
                      }
                    />
                  </div>
                );
              }
              const value = n.data.value ?? 0;
              const min = n.data.min ?? 0;
              const max = n.data.max ?? 1;
              const step = n.data.step ?? 0.01;
              return (
                <div key={n.id} className="control-row">
                  <div className="control-top">
                    <span className="control-label">{n.data.label}</span>
                    <span className="control-value">{value.toFixed(3)}</span>
                  </div>
                  <input
                    type="range"
                    min={min}
                    max={max}
                    step={step}
                    value={value}
                    onChange={(e) =>
                      updateSliderParam(n.id, { value: Number(e.target.value) })
                    }
                  />
                  <div className="control-range">
                    <label>
                      min
                      <input
                        type="number"
                        value={min}
                        onChange={(e) =>
                          updateSliderParam(n.id, { min: Number(e.target.value) })
                        }
                      />
                    </label>
                    <label>
                      max
                      <input
                        type="number"
                        value={max}
                        onChange={(e) =>
                          updateSliderParam(n.id, { max: Number(e.target.value) })
                        }
                      />
                    </label>
                    <label>
                      step
                      <input
                        type="number"
                        value={step}
                        onChange={(e) =>
                          updateSliderParam(n.id, {
                            step: Number(e.target.value),
                          })
                        }
                      />
                    </label>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
