import { useRef } from 'react';
import type { Connection, Edge } from '@xyflow/react';
import { useGraph } from '../../store';

/**
 * Wire breaking: drag an edge end off its socket and drop it on empty space
 * to delete it; dropping on a socket rewires instead. Double-click also cuts.
 * `reconnecting` is exposed so the node-search menu can ignore the
 * onConnectEnd fired by the same gesture.
 */
export function useWireBreaking() {
  const reconnectEdge = useGraph((s) => s.reconnectEdge);
  const deleteEdge = useGraph((s) => s.deleteEdge);
  const reconnectDone = useRef(true);
  const reconnecting = useRef(false);

  const onReconnectStart = () => {
    reconnectDone.current = false;
    reconnecting.current = true;
  };

  const onReconnect = (oldEdge: Edge, connection: Connection) => {
    reconnectDone.current = true;
    reconnectEdge(oldEdge.id, connection);
  };

  const onReconnectEnd = (_event: unknown, edge: Edge) => {
    if (!reconnectDone.current) deleteEdge(edge.id);
    reconnectDone.current = true;
    // Cleared next tick so a same-gesture onConnectEnd can't open the menu.
    setTimeout(() => {
      reconnecting.current = false;
    }, 0);
  };

  const onEdgeDoubleClick = (_event: unknown, edge: Edge) => deleteEdge(edge.id);

  return {
    onReconnectStart,
    onReconnect,
    onReconnectEnd,
    onEdgeDoubleClick,
    reconnecting,
  };
}
