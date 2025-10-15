import styles from '../styles/DocsPage.module.css';
import codePreview from '../assets/code-preview.ts?raw';

const quickLinks = [
  { title: 'Getting started', anchor: '#getting-started' },
  { title: 'Core concepts', anchor: '#core-concepts' },
  { title: 'Node templates', anchor: '#node-templates' },
  { title: 'Connection rules', anchor: '#connection-rules' },
  { title: 'Node forms & IO', anchor: '#node-forms' },
  { title: 'Template builder', anchor: '#template-builder' },
  { title: 'Renderer options', anchor: '#renderer-options' },
  { title: 'Theme tokens', anchor: '#theme-tokens' },
  { title: 'Navigator helpers', anchor: '#navigator' },
  { title: 'React bindings', anchor: '#react-bindings' },
  { title: 'Embedding', anchor: '#embedding' },
  { title: 'Playground', anchor: '#playground' },
  { title: 'Roadmap', anchor: '#roadmap' },
];

const rendererOptionDocs = [
  {
    name: 'width',
    type: 'number',
    defaultValue: 'undefined',
    description: 'Fix the SVG canvas width in pixels. When omitted the renderer stretches to its container.',
  },
  {
    name: 'height',
    type: 'number',
    defaultValue: 'undefined',
    description: 'Fix the SVG canvas height in pixels. Defaults to 100% of the host element.',
  },
  {
    name: 'background',
    type: 'string',
    defaultValue: 'undefined',
    description: 'Legacy shortcut that maps to `theme.background`. Prefer supplying a theme override.',
  },
  {
    name: 'nodeSize',
    type: '{ width: number; height: number }',
    defaultValue: '{ width: 220, height: 160 }',
    description: 'Control the default geometry used for layout and connection anchors.',
  },
  {
    name: 'nodeCornerRadius',
    type: 'number',
    defaultValue: '16',
    description: 'Rounded corner radius applied to node rectangles.',
  },
  {
    name: 'portSpacing',
    type: 'number',
    defaultValue: '28',
    description: 'Vertical spacing between consecutive ports of the same direction.',
  },
  {
    name: 'portRegionPadding',
    type: 'number',
    defaultValue: '52',
    description: 'Offset of the first port from the top edge of the node body.',
  },
  {
    name: 'connectionMinControlDistance',
    type: 'number',
    defaultValue: '80',
    description: 'Lower bound applied when bezier curves are auto-routed between ports.',
  },
  {
    name: 'interactive',
    type: 'boolean',
    defaultValue: 'true',
    description: 'Master toggle for pointer interactions. Set to false for a purely observational canvas.',
  },
  {
    name: 'allowZoom',
    type: 'boolean',
    defaultValue: 'true',
    description: 'Enable wheel / trackpad zooming and double-click zoom gestures.',
  },
  {
    name: 'allowPan',
    type: 'boolean',
    defaultValue: 'true',
    description: 'Allow dragging the canvas background to pan the viewport.',
  },
  {
    name: 'allowNodeDrag',
    type: 'boolean',
    defaultValue: 'true',
    description: 'Permit moving nodes directly in the canvas.',
  },
  {
    name: 'syncViewport',
    type: 'boolean',
    defaultValue: 'true',
    description: 'When false, pan / zoom gestures no longer call FlowGraph.setViewport.',
  },
  {
    name: 'showGrid',
    type: 'boolean',
    defaultValue: 'false',
    description: 'Render a world-space grid overlay behind the graph.',
  },
  {
    name: 'gridSize',
    type: 'number',
    defaultValue: '32',
    description: 'Size of each grid cell in pixels when the grid is enabled.',
  },
  {
    name: 'snapToGrid',
    type: 'boolean',
    defaultValue: 'false',
    description: 'Snap dragged nodes to the nearest grid intersection.',
  },
  {
    name: 'showMiniMap',
    type: 'boolean',
    defaultValue: 'true',
    description: 'Toggle the live minimap overlay. The minimap automatically adapts to graph bounds.',
  },
  {
    name: 'miniMapPosition',
    type: `'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'`,
    defaultValue: `'top-right'`,
    description: 'Place the minimap in any corner. Width / height are controlled via `miniMapSize`.',
  },
  {
    name: 'miniMapSize',
    type: '{ width: number; height: number }',
    defaultValue: '{ width: 200, height: 140 }',
    description: 'Override the minimap footprint for dashboards or embeddable layouts.',
  },
  {
    name: 'connectionArrow',
    type: `'arrow' | 'circle' | 'none'`,
    defaultValue: `'arrow'`,
    description: 'Choose the marker rendered at the end of each connection.',
  },
  {
    name: 'zoomExtent',
    type: '[number, number]',
    defaultValue: '[0.3, 2.5]',
    description: 'Clamp the viewport zoom factor to a custom range.',
  },
  {
    name: 'theme',
    type: 'Partial<FlowgraphRendererTheme>',
    defaultValue: 'see defaults',
    description: 'Override colors for nodes, ports, draft edges, selection states, and the minimap.',
  },
  {
    name: 'validateConnection',
    type: '(source, target, graph) => boolean | string',
    defaultValue: 'undefined',
    description:
      'Custom validation hook executed before creating an edge. Return `false` or a string message to veto the edge.',
  },
  {
    name: 'onNodeSelect',
    type: '(node) => void',
    defaultValue: 'undefined',
    description: 'Receive a callback when a node becomes the active selection.',
  },
  {
    name: 'onConnectionSelect',
    type: '(connection) => void',
    defaultValue: 'undefined',
    description: 'Receive a callback when a connection becomes the active selection.',
  },
  {
    name: 'onConnectionCreate',
    type: '(connection) => void',
    defaultValue: 'undefined',
    description: 'Called after a new connection is committed through the renderer UI.',
  },
  {
    name: 'onConnectionError',
    type: '(error) => void',
    defaultValue: 'undefined',
    description: 'Surface connection failures, including validation errors, in your own UI.',
  },
  {
    name: 'onViewportChange',
    type: '(viewport) => void',
    defaultValue: 'undefined',
    description: 'Subscribe to pan / zoom changes. Useful for syncing with external UI or persistence.',
  },
  {
    name: 'initialSelection',
    type: 'FlowgraphRendererSelection | null',
    defaultValue: 'null',
    description: 'Provide a node or connection to highlight immediately after the renderer mounts.',
  },
];

const themeTokenDocs = [
  { name: 'background', description: 'Canvas background color.' },
  { name: 'nodeFill', description: 'Default fill color for node rectangles.' },
  { name: 'nodeStroke', description: 'Stroke color applied to node outlines.' },
  { name: 'nodeLabel', description: 'Label text color inside nodes.' },
  { name: 'portFill', description: 'Fill color for port handles.' },
  { name: 'connection', description: 'Primary stroke color for committed connections.' },
  { name: 'connectionSelected', description: 'Stroke color used when a connection is selected.' },
  { name: 'draft', description: 'Stroke for in-progress draft connections.' },
  { name: 'miniMapBackground', description: 'Background color for the minimap overlay.' },
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

      <section id="node-templates">
        <h2>Node templates</h2>
        <p>
          Templates are reusable blueprints for graph nodes. Register them up front, then spawn instances with
          <code>graph.addNodeFromTemplate</code>. Each template carries ports, default data, size, metadata, and optional
          form schemas so you can preconfigure inspector panels. The playground’s <strong>Templates</strong> tab mirrors
          this API—select a template, tweak port capacities or accepted colours, adjust the default payload, and spawn a
          node without mutating the original definition.
        </p>
        <ul>
          <li>
            Templates can be updated at runtime via <code>graph.updateTemplate</code> to roll out improved defaults across
            your editor.
          </li>
          <li>
            The catalog is grouped by category. Use <code>template.category</code> to power quick-pick menus or a command
            palette.
          </li>
          <li>
            The playground library includes search across labels, categories, and port names so you can jump straight to
            templates like the Feature Flag Splitter or Batch Exporter.
          </li>
          <li>
            Attach <code>template.form</code> to describe inspector controls. Forms are rendered automatically by the
            React bindings and surface in the playground for experimentation.
          </li>
        </ul>
      </section>

      <section id="connection-rules">
        <h2>Connection rules</h2>
        <p>
          Flowgraph enforces compatibility through port colours and optional validators. Define <code>acceptsColors</code>
          on ports to express which hues they can receive, or leave it empty to allow any connection. The playground
          exposes a colour matrix so you can experiment with custom policies—toggle cells to permit flows like
          <em>red → green</em> while blocking others, then observe how the renderer surfaces validation errors inline.
        </p>
        <p>
          For higher-level logic, provide <code>rendererOptions.validateConnection</code> and return a string to describe
          why an edge was rejected. The sample playground combines colour checks with a <em>prevent self-connections</em>
          guard, mirroring the APIs you will use in production.
        </p>
        <ul>
          <li>
            The colour palette now covers control, data, vector, text, analytics, and error channels—mix and match them
            to model domain-specific routing rules.
          </li>
          <li>
            Use “Allow any colours”, “Require matching colours”, or the custom matrix to see how validation feedback is
            surfaced directly on the canvas.
          </li>
        </ul>
      </section>

      <section id="node-forms">
        <h2>Node forms &amp; IO</h2>
        <p>
          Rich nodes often need configurable inputs and inspector fields. Each template in Flowgraph can define a
          <code>form</code> schema made of sections and fields (text, number, checkbox, select, JSON, code blocks, and
          more). When you spawn a node, pass <code>overrides.form</code> or <code>overrides.data</code> to prefill those
          controls. Ports are equally malleable—set <code>maxConnections</code>, allow loopback, or restrict the colours a
          port accepts before committing it to the graph.
        </p>
        <p>
          The playground’s template builder demonstrates this workflow: edit port limits, toggle colour acceptance, and
          hydrate default data with JSON before adding the node to the canvas. Use the same pattern to create guided node
          creation flows in your product.
        </p>
      </section>

      <section id="template-builder">
        <h2>Template builder</h2>
        <p>
          The playground now ships with a dedicated builder for experimenting with reusable node templates. Pick any
          template from the library (HTTP Source, Vector Embedder, Analytics Sink, Feature Flag Splitter, and more), then
          customise the instance before it hits the graph. You can:
        </p>
        <ul>
          <li>Search the catalog by label, category, or port name to quickly find the template you need.</li>
          <li>Toggle whether each port accepts any colour or a curated palette, adjust connection limits, and preview the
            results in the colour-rule matrix instantly.</li>
          <li>Inject default data with live JSON editing so your spawned nodes already contain sensible inspector values.</li>
        </ul>
        <p>
          These overrides never mutate the underlying template, making it safe to prototype new variations before baking
          them into your product’s template registry.
        </p>
      </section>

      <section id="renderer-options">
        <h2>Renderer options</h2>
        <p>
          The D3-powered renderer is highly configurable. Every option can be supplied during instantiation or via
          <code>renderer.updateOptions()</code>. Highlights are listed below; see the playground for real-time previews.
        </p>
        <div className={styles.tableWrapper}>
          <table className={styles.optionsTable}>
            <thead>
              <tr>
                <th>Option</th>
                <th>Type</th>
                <th>Default</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              {rendererOptionDocs.map(option => (
                <tr key={option.name}>
                  <td><code>{option.name}</code></td>
                  <td><code>{option.type}</code></td>
                  <td><code>{option.defaultValue}</code></td>
                  <td>{option.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section id="theme-tokens">
        <h2>Theme tokens</h2>
        <p>
          Theme overrides let you match Flowgraph to the rest of your product. Provide a full theme object or partial
          overrides. Any omitted token falls back to the defaults.
        </p>
        <div className={styles.tableWrapper}>
          <table className={styles.optionsTable}>
            <thead>
              <tr>
                <th>Token</th>
                <th>Purpose</th>
              </tr>
            </thead>
            <tbody>
              {themeTokenDocs.map(token => (
                <tr key={token.name}>
                  <td><code>{token.name}</code></td>
                  <td>{token.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section id="navigator">
        <h2>Navigator helpers</h2>
        <p>
          Generate secondary navigation, breadcrumbs, or inspector views with{' '}
          <code>buildNavigatorSummary(state)</code>. It converts a <code>FlowGraphState</code> snapshot into sections for
          nodes, connections, and groups, complete with friendly labels, subtitles, and metadata you can feed into
          tooltips or selection logic.
        </p>
        <ul>
          <li>
            Sections include totals so you can render counters or analytics alongside navigation controls.
          </li>
          <li>Items expose group membership, port counts, and path metadata for richer UIs.</li>
          <li>
            Combine the summary with <code>FlowgraphRenderer.focusNode</code> to build quick-jump panels like the
            playground’s navigator.
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
        <p>
          Enforce domain-specific rules by combining <code>graph</code> constraints (like <code>maxConnections</code>) with
          renderer-level hooks such as <code>validateConnection</code>. Return a string to surface inline errors in your UI.
        </p>
      </section>

      <section id="playground">
        <h2>Playground</h2>
        <p>
          The hosted playground is split into a controls column on the left and the canvas plus live navigator on the
          right. Tabs cover <strong>Behavior</strong>, <strong>Canvas</strong>, <strong>Connections</strong>,
          <strong>Layout</strong>, <strong>Theme</strong>, and <strong>Templates</strong>, letting you toggle interaction
          modes, tune zoom extents, define colour rules, filter the template library, and spawn reusable nodes without
          leaving the page. Use the <strong>Copy JSON</strong> action whenever you need to export the current graph state.
        </p>
        <p>
          Jump between the five presets—workflow automation, UML collaboration, RAG pipeline, streaming data mesh, and
          observability map—to see how Flowgraph adapts. Presets tweak canvas dimensions, minimap placement, zoom
          extents, connection policies, colour rules, and themes so you can explore radically different configurations in
          seconds.
        </p>
        <p>
          Looking for inspiration? Try the <strong>Aurora</strong> or <strong>Sunrise</strong> themes, enable the minimap,
          and route a few edges through the colour-matrix validator to see how custom policies surface inline errors.
          The connection panel also ships quick-start buttons for strict matching, type defaults, and control broadcast
          patterns—ideal when you want to reset the rule matrix without editing each cell.
        </p>
        <p>
          Use the toolbar’s <strong>Undo</strong> / <strong>Redo</strong> controls when iterating on a graph or tweaking
          renderer settings—the playground keeps a lightweight history so you can compare variations quickly. The
          template builder also keeps overrides local, so you can experiment with node IO without affecting your global
          catalog.
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