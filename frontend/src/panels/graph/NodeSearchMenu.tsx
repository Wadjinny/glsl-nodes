import {
  useEffect,
  useMemo,
  useState,
  type RefObject,
} from 'react';
import { useReactFlow, type OnConnectEnd } from '@xyflow/react';
import { NODE_TEMPLATES } from '../../nodes/library';
import { outputTypeOf } from '../../compiler/compile';
import { chooseInputSocket, isControlNode } from '../../types';
import { useGraph } from '../../store';

/** State for the drop-on-empty node search menu. */
export interface SearchMenuState {
  /** Popup position, relative to the panel body. */
  x: number;
  y: number;
  /** Where the new node goes, in graph coordinates. */
  flow: { x: number; y: number };
  /** Socket the connection was dragged from. */
  from: { nodeId: string; handleId: string; handleType: 'source' | 'target' };
}

/**
 * Drop a new connection on empty space -> searchable "add node" menu that
 * wires the picked node to the socket the drag started from. The hook owns
 * the open/closed state and the onConnectEnd trigger; <NodeSearchMenu> is the
 * popup itself.
 */
export function useNodeSearchMenu(
  bodyRef: RefObject<HTMLDivElement | null>,
  suppress: RefObject<boolean>,
) {
  const [menu, setMenu] = useState<SearchMenuState | null>(null);
  const { screenToFlowPosition } = useReactFlow();

  const onConnectEnd: OnConnectEnd = (event, connectionState) => {
    if (suppress.current) return;
    if (connectionState.isValid) return; // landed on a socket -> normal connect
    const fromNode = connectionState.fromNode;
    const fromHandle = connectionState.fromHandle;
    if (!fromNode || !fromHandle?.type) return;
    const p = 'changedTouches' in event ? event.changedTouches[0] : event;
    if (!p) return;

    const rect = bodyRef.current?.getBoundingClientRect();
    const local = rect
      ? { x: p.clientX - rect.left, y: p.clientY - rect.top }
      : { x: p.clientX, y: p.clientY };
    setMenu({
      x: Math.max(4, Math.min(local.x, (rect?.width ?? Infinity) - 230)),
      y: Math.max(4, Math.min(local.y, (rect?.height ?? Infinity) - 270)),
      flow: screenToFlowPosition({ x: p.clientX, y: p.clientY }),
      from: {
        nodeId: fromNode.id,
        handleId: fromHandle.id ?? '',
        handleType: fromHandle.type,
      },
    });
  };

  return { menu, onConnectEnd, closeMenu: () => setMenu(null) };
}

// Template sockets, probed once (a made node's data describes its sockets).
const TEMPLATE_INFO = NODE_TEMPLATES.map((t) => ({
  kind: t.kind,
  label: t.label,
  data: t.make('__probe', 0, 0).data,
}));

export function NodeSearchMenu({
  menu,
  onClose,
}: {
  menu: SearchMenuState;
  onClose: () => void;
}) {
  const addNodeAt = useGraph((s) => s.addNodeAt);
  const onConnect = useGraph((s) => s.onConnect);
  const setSelected = useGraph((s) => s.setSelected);
  const renameNode = useGraph((s) => s.renameNode);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);

  // Fresh search whenever the menu is (re)opened somewhere else.
  useEffect(() => {
    setQuery('');
    setHighlight(0);
  }, [menu]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return TEMPLATE_INFO.filter((t) => {
      // Dragging from an output needs a node with inputs, and vice versa.
      const fits =
        menu.from.handleType === 'source'
          ? t.data.inputs.length > 0
          : t.data.outputs.length > 0;
      if (!fits) return false;
      return !q || t.label.toLowerCase().includes(q) || t.kind.toLowerCase().includes(q);
    });
  }, [menu, query]);

  const activeIndex = Math.min(highlight, Math.max(0, matches.length - 1));

  const pickNode = (kind: string) => {
    const id = addNodeAt(kind, menu.flow.x - 75, menu.flow.y - 15);
    onClose();
    if (!id) return;

    const state = useGraph.getState();
    const newNode = state.nodes.find((n) => n.id === id);
    const fromNode = state.nodes.find((n) => n.id === menu.from.nodeId);
    if (!newNode || !fromNode) return;

    if (menu.from.handleType === 'source') {
      // Dragged from an output: the new node receives the wire.
      const srcType = outputTypeOf(fromNode, menu.from.handleId);
      const chosen = chooseInputSocket(newNode.data.inputs, srcType);
      if (chosen) {
        onConnect({
          source: fromNode.id,
          sourceHandle: menu.from.handleId,
          target: id,
          targetHandle: chosen.id,
        });
      }
    } else {
      // Dragged from an input: the new node feeds it.
      const input = fromNode.data.inputs.find(
        (s) => s.id === menu.from.handleId,
      );
      const outputs = newNode.data.outputs;
      const chosen =
        outputs.find((s) => s.type === input?.type) ?? outputs[0];
      if (chosen) {
        onConnect({
          source: id,
          sourceHandle: chosen.id,
          target: fromNode.id,
          targetHandle: menu.from.handleId,
        });
      }
      // Control nodes inherit the socket name (shows in Controls panel / node title).
      if (input?.name && isControlNode(newNode.data)) {
        renameNode(id, input.name);
      }
    }
    setSelected(id);
  };

  // Close on any pointer press outside the menu.
  useEffect(() => {
    const close = (e: PointerEvent) => {
      if (!(e.target as Element | null)?.closest?.('.node-search')) onClose();
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [onClose]);

  return (
    <div className="node-search" style={{ left: menu.x, top: menu.y }}>
      <input
        autoFocus
        placeholder="Search nodes…"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setHighlight(0);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlight((h) => Math.min(h + 1, matches.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlight((h) => Math.max(h - 1, 0));
          } else if (e.key === 'Enter') {
            const m = matches[activeIndex];
            if (m) pickNode(m.kind);
          } else if (e.key === 'Escape') {
            onClose();
          }
        }}
      />
      <div className="node-search__list">
        {matches.map((t, i) => (
          <button
            key={t.kind}
            className={i === activeIndex ? 'active' : ''}
            onMouseEnter={() => setHighlight(i)}
            onClick={() => pickNode(t.kind)}
          >
            {t.label}
          </button>
        ))}
        {matches.length === 0 && (
          <div className="node-search__empty">No matching nodes</div>
        )}
      </div>
    </div>
  );
}
