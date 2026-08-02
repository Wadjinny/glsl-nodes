import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Editor, { type Monaco, type OnMount } from '@monaco-editor/react';
import { useGraph } from '../store';
import { formatGlsl } from '../glsl/formatGlsl';
import { registerGLSL } from '../monaco/glsl-language';
import { isControlNode } from '../types';

type CodeView = 'node' | 'preamble';
type CodeEditor = Parameters<OnMount>[0];

const NODE_HINT = [
  'Built-ins available in every node body:',
  'uv, fragCoord, resolution, time, mouse',
  '',
  '// @in <type> <name> — graph input socket',
  '// @out <type> [name] — graph output type (value nodes)',
  '// @type func — callable function (graph out is func)',
  '// @fin <type> <name> — GLSL param (func nodes)',
  '// @fin func <name> — function binding wire',
  '// @fout <type> — GLSL return type (func nodes)',
  '',
  'On func nodes, @in value sockets are closed-over (wire to',
  'controls / builtins). They are not call parameters.',
  '',
  'Types: float, vec2, vec3, vec4, mat2, mat3, func',
].join('\n');

const PREAMBLE_HINT = [
  'Shared GLSL inserted once before node functions.',
  '#define macros and file-level globals from ShaderToy import live here.',
  'All node bodies can reference these names.',
].join('\n');

function HintPopover({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLPreElement>(null);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || !btnRef.current) {
      setPos(null);
      return;
    }
    const r = btnRef.current.getBoundingClientRect();
    setPos({
      top: r.bottom + 6,
      right: window.innerWidth - r.right,
    });
  }, [open, text]);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || popRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={`panel-hint-icon${open ? ' active' : ''}`}
        aria-label="Syntax help"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        ?
      </button>
      {open &&
        pos &&
        createPortal(
          <pre
            ref={popRef}
            className="panel-hint-pop"
            role="tooltip"
            style={{ top: pos.top, right: pos.right }}
          >
            {text}
          </pre>,
          document.body,
        )}
    </>
  );
}

export function CodePanel() {
  const selectedNodeId = useGraph((s) => s.selectedNodeId);
  const nodes = useGraph((s) => s.nodes);
  const glslPreamble = useGraph((s) => s.glslPreamble);
  const graphRevision = useGraph((s) => s.graphRevision);
  const updateNodeGlsl = useGraph((s) => s.updateNodeGlsl);
  const setGlslPreamble = useGraph((s) => s.setGlslPreamble);
  const debounceRef = useRef<number | undefined>(undefined);
  const editorRef = useRef<CodeEditor | null>(null);
  const [view, setView] = useState<CodeView>('node');
  /** Bumped when entering Preamble so Monaco remounts with latest store text. */
  const [preambleEpoch, setPreambleEpoch] = useState(0);
  /** Bumped after Format so Monaco picks up rewritten defaultValue. */
  const [nodeEpoch, setNodeEpoch] = useState(0);

  const node = nodes.find((n) => n.id === selectedNodeId);

  const applyFormatted = useCallback(
    (raw: string) => {
      const formatted = formatGlsl(raw);
      if (formatted === raw) return;

      if (view === 'preamble') {
        if (formatted !== glslPreamble) setGlslPreamble(formatted);
        setPreambleEpoch((n) => n + 1);
        return;
      }
      if (!selectedNodeId || !node) return;
      if (formatted !== node.data.glsl) updateNodeGlsl(selectedNodeId, formatted);
      setNodeEpoch((n) => n + 1);
    },
    [
      view,
      glslPreamble,
      setGlslPreamble,
      selectedNodeId,
      node,
      updateNodeGlsl,
    ],
  );

  const formatCurrent = useCallback(() => {
    window.clearTimeout(debounceRef.current);
    const raw =
      editorRef.current?.getValue() ??
      (view === 'preamble' ? glslPreamble : node?.data.glsl);
    if (raw === undefined) return;
    applyFormatted(raw);
  }, [view, glslPreamble, node, applyFormatted]);

  const handleMount = useCallback<OnMount>(
    (ed, monaco: Monaco) => {
      editorRef.current = ed;
      registerGLSL(monaco);
      ed.addAction({
        id: 'glsl-format-document',
        label: 'Format Document',
        keybindings: [
          monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KeyF,
        ],
        run: (editor) => {
          window.clearTimeout(debounceRef.current);
          applyFormatted(editor.getValue());
        },
      });
    },
    [applyFormatted],
  );

  const handleNodeChange = useCallback(
    (value: string | undefined) => {
      if (!selectedNodeId || value === undefined) return;
      window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => {
        updateNodeGlsl(selectedNodeId, value);
      }, 250);
    },
    [selectedNodeId, updateNodeGlsl],
  );

  const handlePreambleChange = useCallback(
    (value: string | undefined) => {
      if (value === undefined) return;
      window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => {
        setGlslPreamble(value);
      }, 250);
    },
    [setGlslPreamble],
  );

  const nodeEditable =
    node && !node.data.isInput && !node.data.isOutput && !isControlNode(node.data);

  const showingPreamble = view === 'preamble';
  const canFormat = showingPreamble || Boolean(nodeEditable);

  const showPreamble = () => {
    setPreambleEpoch((n) => n + 1);
    setView('preamble');
  };

  return (
    <div className="panel">
      <div className="panel-header">
        <span>
          {showingPreamble
            ? 'Preamble'
            : `Shader Code${node ? ` — ${node.data.label}` : ''}`}
        </span>
        <div className="panel-header-actions">
          <div className="code-view-toggle" role="group" aria-label="Code view">
            <button
              type="button"
              className={view === 'node' ? 'active' : undefined}
              onClick={() => setView('node')}
              title="Selected node GLSL"
            >
              Node
            </button>
            <button
              type="button"
              className={view === 'preamble' ? 'active' : undefined}
              onClick={showPreamble}
              title="Shared #defines and globals"
            >
              Preamble
            </button>
          </div>
          <button
            type="button"
            className="panel-action-btn"
            disabled={!canFormat}
            title="Format GLSL (Shift+Alt+F)"
            onClick={formatCurrent}
          >
            Format
          </button>
          <HintPopover
            text={showingPreamble ? PREAMBLE_HINT : NODE_HINT}
          />
        </div>
      </div>
      <div className="panel-body">
        {showingPreamble ? (
          <Editor
            key={`preamble-${graphRevision}-${preambleEpoch}`}
            language="glsl"
            theme="vs-dark"
            defaultValue={glslPreamble}
            onMount={handleMount}
            onChange={handlePreambleChange}
            options={{
              fontSize: 13,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              automaticLayout: true,
              tabSize: 2,
            }}
          />
        ) : nodeEditable ? (
          <Editor
            key={`${node.id}-${nodeEpoch}`}
            language="glsl"
            theme="vs-dark"
            defaultValue={node.data.glsl}
            onMount={handleMount}
            onChange={handleNodeChange}
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
