import { useEffect, useRef, useState } from 'react';
import { Renderer } from '../webgl/renderer';
import { exportVideo } from '../webgl/exportVideo';
import { useGraph } from '../store';
import { uniformName } from '../compiler/compile';
import {
  controlUniformValue,
  isControlNode,
  type UniformValue,
} from '../types';

const RESOLUTIONS: Record<string, [number, number] | null> = {
  Current: null,
  '512²': [512, 512],
  '720p': [1280, 720],
  '1080p': [1920, 1080],
};

export function PreviewPanel() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const fragSource = useGraph((s) => s.fragSource);
  const compileError = useGraph((s) => s.compileError);
  const glslError = useGraph((s) => s.glslError);
  const setGlslError = useGraph((s) => s.setGlslError);

  const [seconds, setSeconds] = useState(5);
  const [fps, setFps] = useState(30);
  const [res, setRes] = useState('Current');
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [exportErr, setExportErr] = useState<string | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    try {
      const renderer = new Renderer(canvasRef.current);
      renderer.setUniformSource(() => {
        const map: Record<string, UniformValue> = {};
        for (const n of useGraph.getState().nodes) {
          if (isControlNode(n.data)) {
            map[uniformName(n.id)] = controlUniformValue(n.data);
          }
        }
        return map;
      });
      rendererRef.current = renderer;
    } catch (e) {
      setGlslError(String(e));
    }
    return () => {
      rendererRef.current?.dispose();
      rendererRef.current = null;
    };
  }, [setGlslError]);

  useEffect(() => {
    if (!rendererRef.current || !fragSource) return;
    const err = rendererRef.current.setShader(fragSource);
    setGlslError(err);
  }, [fragSource, setGlslError]);

  const handleExport = async () => {
    const renderer = rendererRef.current;
    const canvas = canvasRef.current;
    if (!renderer || !canvas || exporting) return;

    const dims = RESOLUTIONS[res];
    const width = dims ? dims[0] : canvas.width;
    const height = dims ? dims[1] : canvas.height;

    setExportErr(null);
    setExporting(true);
    setProgress(0);
    try {
      const { blob, ext } = await exportVideo(renderer, {
        durationSec: seconds,
        fps,
        width,
        height,
        onProgress: setProgress,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `shader-${Date.now()}.${ext}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setExportErr(e instanceof Error ? e.message : String(e));
    } finally {
      setExporting(false);
    }
  };

  const error = exportErr ?? compileError ?? glslError;

  return (
    <div className="panel">
      <div className="panel-header">
        <span>Preview</span>
        <div className="export-bar">
          <input
            type="number"
            min={1}
            max={120}
            value={seconds}
            disabled={exporting}
            onChange={(e) => setSeconds(Number(e.target.value))}
            title="Duration (seconds)"
          />
          <span className="export-unit">s</span>
          <select
            value={fps}
            disabled={exporting}
            onChange={(e) => setFps(Number(e.target.value))}
            title="Frames per second"
          >
            <option value={24}>24fps</option>
            <option value={30}>30fps</option>
            <option value={60}>60fps</option>
          </select>
          <select
            value={res}
            disabled={exporting}
            onChange={(e) => setRes(e.target.value)}
            title="Resolution"
          >
            {Object.keys(RESOLUTIONS).map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
          <button onClick={handleExport} disabled={exporting}>
            {exporting ? `Exporting ${Math.round(progress * 100)}%` : 'Export MP4'}
          </button>
        </div>
      </div>
      <div className="panel-body">
        <canvas ref={canvasRef} className="preview-canvas" />
      </div>
      {error && <div className="error-bar">{error}</div>}
    </div>
  );
}
