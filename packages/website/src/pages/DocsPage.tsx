import styles from '../styles/DocsPage.module.css';
import codePreview from '../assets/code-preview.ts?raw';

const quickLinks = [
  { title: 'Getting started', anchor: '#getting-started' },
  { title: 'Core concepts', anchor: '#core-concepts' },
  { title: 'React bindings', anchor: '#react-bindings' },
  { title: 'Embedding', anchor: '#embedding' },
  { title: 'Roadmap', anchor: '#roadmap' },
];

const DocsPage = (): JSX.Element => (
  <div className={styles.docs}>
    <aside className={styles.sidebar}>
      <h2>Docs</h2>
      <nav>
        <ul>
          {quickLinks.map(link => (
            <li key={link.anchor}>
              <a href={link.anchor}>{link.title}</a>
            </li>
          ))}
        </ul>
      </nav>
    </aside>

    <article className={styles.content}>
      <section id="getting-started">
        <h1>Getting started</h1>
        <p>
          Install the core engine and, optionally, the React bindings. The renderer can run in any environment that
          supports SVG.
        </p>
<pre><code>{`npm install @flowtomic/flowgraph @flowtomic/flowgraph-react`}</code></pre>
      </section>

      <section id="core-concepts">
        <h2>Core concepts</h2>
        <ul>
          <li>
            <strong>FlowGraph</strong>: manages nodes, ports, connections, groups, viewport, and metadata.
          </li>
          <li>
            <strong>GraphNode</strong>: typed ports, optional form schemas, metadata.
          </li>
          <li>
            <strong>GraphConnection</strong>: directed edges with optional routing hints. Use <code>addConnection</code>,
            <code>updateConnection</code>, and <code>removeConnection</code> to manage their lifecycle.
          </li>
          <li>
            <strong>FlowgraphRenderer</strong>: D3-based canvas with zoom, pan, and interactions.
          </li>
        </ul>
      </section>

      <section id="react-bindings">
        <h2>React bindings</h2>
        <p>
          Use the <code>useFlowgraph</code> hook to wire state to React, then mount a <code>&lt;FlowCanvas /&gt;</code> for the
          interactive canvas.
        </p>
        <pre><code>{codePreview}</code></pre>
      </section>

      <section id="embedding">
        <h2>Embedding</h2>
        <p>
          Flowgraph snapshots are plain JSON. Store them in your database, hydrate them in clients, or stream them to
          remote collaborators. The renderer consumes snapshots, not bespoke internal state. Use <code>graph.getState()</code>
          to serialise and <code>graph.importState(...)</code> to hydrate.
        </p>
      </section>

      <section id="roadmap">
        <h2>Roadmap</h2>
        <ul>
          <li>Plugin API for custom validation and routing strategies.</li>
          <li>History helpers for undo/redo.</li>
          <li>SSR-friendly renderer for Next.js / Remix.</li>
          <li>Embeddable mini-map and inspector components.</li>
        </ul>
      </section>
    </article>
  </div>
);

export default DocsPage;