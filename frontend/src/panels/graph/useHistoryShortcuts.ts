import { useEffect } from 'react';
import { useGraph } from '../../store';

/**
 * Ctrl/Cmd+Z undo, Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y redo.
 * Skips text fields and Monaco so their native undo keeps working.
 */
export function useHistoryShortcuts() {
  const undo = useGraph((s) => s.undo);
  const redo = useGraph((s) => s.redo);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key !== 'z' && key !== 'y') return;

      const target = e.target as HTMLElement | null;
      if (
        target?.closest(
          'input, textarea, [contenteditable="true"], .monaco-editor',
        )
      ) {
        return;
      }

      const isRedo = key === 'y' || (key === 'z' && e.shiftKey);
      const acted = isRedo ? redo() : undo();
      if (acted) e.preventDefault();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [undo, redo]);
}
