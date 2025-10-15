import styles from '../styles/LandingPage.module.css';
import gradient from '../assets/gradient-lines.svg?url';

const features = [
  {
    title: 'Framework-friendly core',
    description: 'Use Flowgraph with React today, ship to vanilla JS tomorrow. The core runs anywhere D3 can render.',
  },
  {
    title: 'Composable building blocks',
    description: 'Plug in your own node renderers, controls, and validation rules. Flowgraph scales from toy demos to production editors.',
  },
  {
    title: 'Powered by Flowtomic',
    description: 'The same primitives that drive Flowtomic’s workflow editor packaged for your team and your customers.',
  },
];

const LandingPage = (): JSX.Element => (
  <div className={styles.landing}>
    <section className={styles.hero}>
      <div className={styles.heroCopy}>
        <p className={styles.label}>Flowgraph</p>
        <h1>Design, compose, and embed visual flows in minutes.</h1>
        <p>
          Flowgraph is a D3-powered canvas with first-class React bindings. Model your graph once and render it anywhere —
          from embeddable chat workflows to full-blown AI orchestration editors.
        </p>
        <div className={styles.actions}>
          <a className={styles.primary} href="/playground">
            Try the playground
          </a>
          <a className={styles.secondary} href="/docs">
            Explore the docs
          </a>
        </div>
      </div>
      <div className={styles.heroVisual}>
        <img src={gradient} alt="Decorative gradient" />
        <div className={styles.previewCard}>
          <header>
            <span className={styles.previewTitle}>Webhook Trigger</span>
            <span className={styles.previewStatus}>Ready</span>
          </header>
          <p>Start workflows with HTTP requests and route payloads to downstream actions.</p>
          <ul>
            <li>Configurable input/output ports</li>
            <li>Customizable forms</li>
            <li>Realtime graph events</li>
          </ul>
        </div>
      </div>
    </section>

    <section className={styles.features}>
      {features.map(feature => (
        <article key={feature.title}>
          <h3>{feature.title}</h3>
          <p>{feature.description}</p>
        </article>
      ))}
    </section>

    <section className={styles.callout}>
      <div>
        <h2>Build once, render anywhere.</h2>
        <p>
          The Flowgraph runtime ships as tiny ES modules. Compose flows via API, store them as JSON, deliver them to
          React, and rehydrate the same state in other runtimes.
        </p>
      </div>
      <a href="/why" className={styles.calloutLink}>
        Why Flowgraph →
      </a>
    </section>
  </div>
);

export default LandingPage;