import styles from '../styles/WhyFlowgraphPage.module.css';

const comparisons = [
  {
    heading: 'State engine first',
    copy: 'Flowgraph stores its world as serialisable JSON. Bring your own renderer, run headless in Node, or stream updates to collaborators.',
  },
  {
    heading: 'D3 without the boilerplate',
    copy: 'The canvas handles zoom, pan, hit testing, and connection routing. You focus on the experience, not the math.',
  },
  {
    heading: 'React-native ergonomics',
    copy: 'Hooks, context providers, and headless components make it trivial to embed Flowgraph in existing design systems.',
  },
];

const WhyFlowgraphPage = (): JSX.Element => (
  <div className={styles.wrapper}>
    <section className={styles.intro}>
      <h1>Why Flowgraph?</h1>
      <p>
        Visual builders deserve the same ergonomics as web apps. Flowgraph combines a reliable graph engine with a
        modern rendering layer so teams can build editors, sandboxes, and documentation from a single source of truth.
      </p>
    </section>

    <section className={styles.grid}>
      {comparisons.map(item => (
        <article key={item.heading}>
          <h2>{item.heading}</h2>
          <p>{item.copy}</p>
        </article>
      ))}
    </section>

    <section className={styles.metrics}>
      <div>
        <strong>100%</strong>
        <span>typed TypeScript API</span>
      </div>
      <div>
        <strong>&lt;35kb</strong>
        <span>core renderer gzipped</span>
      </div>
      <div>
        <strong>0</strong>
        <span>framework lock-in</span>
      </div>
    </section>
  </div>
);

export default WhyFlowgraphPage;