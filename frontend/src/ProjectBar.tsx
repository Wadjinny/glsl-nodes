import { useEffect, useRef, useState } from 'react';
import { useGraph } from './store';
import {
  deleteProjectFromLocal,
  hydrateProject,
  listSavedProjects,
  openProjectFromLocal,
  parseProject,
  saveProjectToLocal,
  serializeProject,
} from './project';

export function ProjectBar() {
  const projectName = useGraph((s) => s.projectName);
  const setProjectName = useGraph((s) => s.setProjectName);
  const loadProject = useGraph((s) => s.loadProject);
  const newProject = useGraph((s) => s.newProject);

  const [menuOpen, setMenuOpen] = useState(false);
  const [savedList, setSavedList] = useState(listSavedProjects);
  const [status, setStatus] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const statusTimer = useRef(0);

  const flash = (msg: string) => {
    setStatus(msg);
    window.clearTimeout(statusTimer.current);
    statusTimer.current = window.setTimeout(() => setStatus(null), 2000);
  };

  // Close the Open menu on any pointer press outside of it.
  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [menuOpen]);

  const handleNew = () => {
    if (!window.confirm('Start a new project? Unsaved changes will be lost.')) return;
    newProject();
  };

  const handleSave = () => {
    const name = window
      .prompt('Save project as:', projectName ?? 'untitled')
      ?.trim();
    if (!name) return;
    const { nodes, edges } = useGraph.getState();
    saveProjectToLocal(serializeProject(name, nodes, edges));
    setProjectName(name);
    setSavedList(listSavedProjects());
    flash('Saved');
  };

  const handleOpen = (name: string) => {
    setMenuOpen(false);
    const file = openProjectFromLocal(name);
    if (!file) {
      setSavedList(listSavedProjects());
      flash('Project not found');
      return;
    }
    if (!window.confirm(`Open "${name}"? Unsaved changes will be lost.`)) return;
    try {
      const { nodes, edges } = hydrateProject(file);
      loadProject(name, nodes, edges);
    } catch (e) {
      window.alert(
        `Could not open project: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  };

  const handleDelete = (name: string) => {
    if (!window.confirm(`Delete saved project "${name}"?`)) return;
    deleteProjectFromLocal(name);
    setSavedList(listSavedProjects());
  };

  const handleExport = () => {
    const { nodes, edges } = useGraph.getState();
    const file = serializeProject(projectName ?? 'untitled', nodes, edges);
    const blob = new Blob([JSON.stringify(file, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${file.name}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // Note: no confirm() before opening the picker — it would consume the
  // click's user activation and Chrome then blocks the file chooser.
  const handleImportClick = () => {
    fileRef.current?.click();
  };

  const handleImportFile = async (f: File | undefined) => {
    if (!f) return;
    if (!window.confirm('Importing replaces the current graph. Continue?')) return;
    try {
      const { name, nodes, edges } = parseProject(await f.text());
      loadProject(name, nodes, edges);
      flash('Imported');
    } catch (e) {
      window.alert(
        `Import failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  };

  return (
    <div className="project-bar">
      <span className="project-title">GLSL Nodes</span>
      <span className="project-name">
        {projectName ?? 'untitled'}
        {status ? ` — ${status}` : ''}
      </span>
      <div className="toolbar">
        <button onClick={handleNew}>New</button>
        <div className="project-open" ref={menuRef}>
          <button
            onClick={() => {
              setSavedList(listSavedProjects());
              setMenuOpen((open) => !open);
            }}
          >
            Open ▾
          </button>
          {menuOpen && (
            <div className="project-menu">
              {savedList.length === 0 && (
                <div className="project-menu-empty">No saved projects</div>
              )}
              {savedList.map((p) => (
                <div key={p.name} className="project-menu-row">
                  <button
                    className="project-menu-open"
                    onClick={() => handleOpen(p.name)}
                  >
                    {p.name}
                  </button>
                  <button
                    className="project-menu-delete"
                    title={`Delete "${p.name}"`}
                    onClick={() => handleDelete(p.name)}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        <button onClick={handleSave}>Save</button>
        <button onClick={handleImportClick}>Import</button>
        <button onClick={handleExport}>Export</button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        style={{ display: 'none' }}
        onChange={(e) => {
          void handleImportFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
    </div>
  );
}
