import type { Edge } from '@xyflow/react';
import type { RFNode } from './nodes/library';

const MAX_HISTORY = 80;

export interface HistorySnapshot {
  nodes: RFNode[];
  edges: Edge[];
  glslPreamble: string;
}

let past: HistorySnapshot[] = [];
let future: HistorySnapshot[] = [];
/** When true, mutations must not push (undo/redo apply). */
let paused = false;
/** Coalesce window: first edit pushes once; further edits until idle share it. */
let coalesceOpen = false;
let coalesceTimer: ReturnType<typeof setTimeout> | undefined;
/** Node-drag session: push once on drag start. */
let nodeDragSession = false;

export function historyPaused(): boolean {
  return paused;
}

export function canUndo(): boolean {
  return past.length > 0;
}

export function canRedo(): boolean {
  return future.length > 0;
}

export function historyCounts(): { past: number; future: number } {
  return { past: past.length, future: future.length };
}

export function clearHistory(): void {
  past = [];
  future = [];
  coalesceOpen = false;
  nodeDragSession = false;
  if (coalesceTimer !== undefined) clearTimeout(coalesceTimer);
  coalesceTimer = undefined;
}

function cloneSnapshot(s: HistorySnapshot): HistorySnapshot {
  return {
    nodes: structuredClone(s.nodes),
    edges: structuredClone(s.edges),
    glslPreamble: s.glslPreamble,
  };
}

function endCoalesce(): void {
  coalesceOpen = false;
  if (coalesceTimer !== undefined) {
    clearTimeout(coalesceTimer);
    coalesceTimer = undefined;
  }
}

/**
 * Record the current graph so it can be restored later.
 * `coalesce: true` batches rapid edits (sliders, typing) into one undo step.
 */
export function pushHistory(
  s: HistorySnapshot,
  opts?: { coalesce?: boolean },
): void {
  if (paused) return;

  if (opts?.coalesce) {
    if (!coalesceOpen) {
      past.push(cloneSnapshot(s));
      if (past.length > MAX_HISTORY) past.shift();
      future = [];
      coalesceOpen = true;
    }
    if (coalesceTimer !== undefined) clearTimeout(coalesceTimer);
    coalesceTimer = setTimeout(() => {
      coalesceOpen = false;
      coalesceTimer = undefined;
    }, 450);
    return;
  }

  endCoalesce();
  past.push(cloneSnapshot(s));
  if (past.length > MAX_HISTORY) past.shift();
  future = [];
}

/** Call before applying node position changes that start a drag. */
export function noteNodeDragStart(s: HistorySnapshot): void {
  if (paused || nodeDragSession) return;
  nodeDragSession = true;
  pushHistory(s);
}

export function noteNodeDragEnd(): void {
  nodeDragSession = false;
}

export function isNodeDragSession(): boolean {
  return nodeDragSession;
}

/**
 * Pop past, push current onto future, return snapshot to restore.
 * Returns null if nothing to undo.
 */
export function undoHistory(current: HistorySnapshot): HistorySnapshot | null {
  if (!past.length) return null;
  endCoalesce();
  nodeDragSession = false;
  future.push(cloneSnapshot(current));
  return past.pop()!;
}

/**
 * Pop future, push current onto past, return snapshot to restore.
 */
export function redoHistory(current: HistorySnapshot): HistorySnapshot | null {
  if (!future.length) return null;
  endCoalesce();
  nodeDragSession = false;
  past.push(cloneSnapshot(current));
  return future.pop()!;
}

export function withHistoryPaused<T>(fn: () => T): T {
  paused = true;
  try {
    return fn();
  } finally {
    paused = false;
  }
}
