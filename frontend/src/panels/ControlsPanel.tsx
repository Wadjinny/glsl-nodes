import { useGraph } from '../store';

export function ControlsPanel() {
  const nodes = useGraph((s) => s.nodes);
  const updateSliderParam = useGraph((s) => s.updateSliderParam);
  const setSelected = useGraph((s) => s.setSelected);

  const sliders = nodes.filter((n) => n.data.isSlider);

  return (
    <div className="panel">
      <div className="panel-header">Controls</div>
      <div className="panel-body" style={{ overflow: 'auto' }}>
        {sliders.length === 0 ? (
          <div className="empty-hint">
            Add a Slider node to create a live float control here.
          </div>
        ) : (
          <div className="controls-list">
            {sliders.map((n) => {
              const value = n.data.value ?? 0;
              const min = n.data.min ?? 0;
              const max = n.data.max ?? 1;
              const step = n.data.step ?? 0.01;
              return (
                <div
                  key={n.id}
                  className="control-row"
                  onPointerDown={() => setSelected(n.id)}
                >
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
