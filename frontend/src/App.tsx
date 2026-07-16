import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { PreviewPanel } from './panels/PreviewPanel';
import { GraphPanel } from './panels/GraphPanel';
import { CodePanel } from './panels/CodePanel';
import { ControlsPanel } from './panels/ControlsPanel';

export default function App() {
  return (
    <div className="app">
      <PanelGroup direction="horizontal">
        {/* Left column: preview on top, code editor below. */}
        <Panel defaultSize={40} minSize={20}>
          <PanelGroup direction="vertical">
            <Panel defaultSize={50} minSize={15}>
              <PreviewPanel />
            </Panel>
            <PanelResizeHandle className="resize-handle vertical" />
            <Panel defaultSize={50} minSize={15}>
              <CodePanel />
            </Panel>
          </PanelGroup>
        </Panel>

        <PanelResizeHandle className="resize-handle horizontal" />

        {/* Right column: node graph on top, slider controls below. */}
        <Panel defaultSize={60} minSize={30}>
          <PanelGroup direction="vertical">
            <Panel defaultSize={68} minSize={25}>
              <GraphPanel />
            </Panel>
            <PanelResizeHandle className="resize-handle vertical" />
            <Panel defaultSize={32} minSize={12}>
              <ControlsPanel />
            </Panel>
          </PanelGroup>
        </Panel>
      </PanelGroup>
    </div>
  );
}
