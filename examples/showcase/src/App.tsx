import { useMemo, useState } from 'react';
import MinimalApp from '../../react-minimal/src/App';
import FlowtomicLiteApp from '../../flowtomic-lite/src/App';
import ReactDemoApp from '../../react-demo/src/App';

interface ExampleEntry {
  id: string;
  label: string;
  description: string;
  render: () => JSX.Element;
}

const App = (): JSX.Element => {
  const examples = useMemo<ExampleEntry[]>(
    () => [
      {
        id: 'minimal',
        label: 'Minimal playground',
        description: 'Canvas theming, pan/zoom, navigator overlay and connection management.',
        render: () => <MinimalApp />,
      },
      {
        id: 'flowtomic-lite',
        label: 'Flowtomic Lite',
        description: 'Template palette, inspector with form editing, and navigator integration.',
        render: () => <FlowtomicLiteApp />,
      },
      {
        id: 'react-demo',
        label: 'State inspector',
        description: 'Original inspector-style demo with realtime graphs and quick actions.',
        render: () => <ReactDemoApp />,
      },
    ],
    [],
  );

  const [activeId, setActiveId] = useState(examples[0]?.id ?? 'minimal');
  const activeExample = examples.find(example => example.id === activeId) ?? examples[0];

  return (
    <div className="showcase-shell">
      <header className="showcase-header">
        <div>
          <h1>FlowGraph showcase</h1>
          <p>Explore multiple experiences built on top of <code>@flowtomic/flowgraph</code>.</p>
        </div>
        <nav>
          <ul>
            {examples.map(example => (
              <li key={example.id}>
                <button
                  type="button"
                  className={activeId === example.id ? 'active' : ''}
                  onClick={() => setActiveId(example.id)}
                >
                  {example.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <section className="showcase-description">
        <p>{activeExample?.description}</p>
      </section>

      <main className="showcase-stage">
        <div className="showcase-embed">
          {activeExample?.render()}
        </div>
      </main>
    </div>
  );
};

export default App;