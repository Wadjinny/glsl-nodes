import { useEffect } from 'react';
import { useGraph } from '../../store';

/**
 * Ctrl/Cmd+C / X / V for the selected graph nodes. Only preventDefault when
 * we actually acted, so native copy/paste keeps working everywhere else.
 */
export function useClipboardShortcuts() {
  const copySelection = useGraph((s) => s.copySelection);
  const cutSelection = useGraph((s) => s.cutSelection);
  const pasteClipboard = useGraph((s) => s.pasteClipboard);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key !== 'c' && key !== 'x' && key !== 'v') return;
      // Never hijack the clipboard from text fields or the Monaco editor.
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, [contenteditable="true"], .monaco-editor')) return;
      // Copying selected page text wins over copying nodes.
      if (key !== 'v' && !window.getSelection()?.isCollapsed) return;

      const acted =
        key === 'c' ? copySelection() : key === 'x' ? cutSelection() : pasteClipboard();
      if (acted) e.preventDefault();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [copySelection, cutSelection, pasteClipboard]);
}
