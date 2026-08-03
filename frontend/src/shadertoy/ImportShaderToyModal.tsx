import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Editor, { type Monaco } from '@monaco-editor/react';
import { registerGLSL } from '../monaco/glsl-language';
import { useGraph } from '../store';
import { importShaderToyGraph } from './importGraph';

interface Props {
  open: boolean;
  onClose: () => void;
  onImported: (warningCount: number) => void;
}

export function ImportShaderToyModal({ open, onClose, onImported }: Props) {
  const loadProject = useGraph((s) => s.loadProject);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setText('');
    setError(null);
  }, [open]);

  const handleMount = useCallback((editor: { layout: () => void }, monaco: Monaco) => {
    registerGLSL(monaco);
    // Layout after the portal/dialog has real dimensions.
    requestAnimationFrame(() => editor.layout());
  }, []);

  if (!open) return null;

  const handleImport = () => {
    if (
      !window.confirm(
        'Importing ShaderToy code replaces the current graph. Continue?',
      )
    ) {
      return;
    }
    try {
      const result = importShaderToyGraph(text);
      loadProject(result.name, result.nodes, result.edges, result.preamble);
      if (result.warnings.length) {
        window.alert(
          `Imported with ${result.warnings.length} warning(s):\n\n` +
            result.warnings.slice(0, 12).join('\n') +
            (result.warnings.length > 12 ? '\n…' : ''),
        );
      }
      onImported(result.warnings.length);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return createPortal(
    <div
      className="st-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="st-modal" role="dialog" aria-labelledby="st-import-title">
        <div className="st-modal-header">
          <span id="st-import-title">Import ShaderToy</span>
          <button type="button" className="st-modal-close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="st-modal-body">
          <p className="st-modal-hint">
            Paste a ShaderToy fragment (mainImage + helpers). Helpers become
            func nodes; calls are wired as func inputs. Void helpers with a
            single inout/out param are rewritten to return that value. Defines
            and globals go in a shared preamble. Replaces the current graph.
          </p>
          <div className="st-modal-editor">
            <Editor
              height="100%"
              defaultLanguage="glsl"
              language="glsl"
              theme="vs-dark"
              value={text}
              onMount={handleMount}
              onChange={(v) => setText(v ?? '')}
              options={{
                fontSize: 12,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                automaticLayout: true,
                tabSize: 2,
                wordWrap: 'on',
                padding: { top: 8, bottom: 8 },
              }}
            />
          </div>
          {error && <div className="st-modal-error">{error}</div>}
        </div>
        <div className="st-modal-footer">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="st-modal-primary"
            onClick={handleImport}
            disabled={!text.trim()}
          >
            Import
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
