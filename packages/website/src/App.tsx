import { NavLink, Route, Routes } from 'react-router-dom';
import { clsx } from 'clsx';
import LandingPage from './pages/LandingPage';
import WhyFlowgraphPage from './pages/WhyFlowgraphPage';
import DocsPage from './pages/DocsPage';
import PlaygroundPage from './pages/PlaygroundPage';
import styles from './styles/App.module.css';

const routes = [
  { path: '/', label: 'Home', element: <LandingPage /> },
  { path: '/why', label: 'Why Flowgraph', element: <WhyFlowgraphPage /> },
  { path: '/docs', label: 'Docs', element: <DocsPage /> },
  { path: '/playground', label: 'Playground', element: <PlaygroundPage /> },
];

const App = (): JSX.Element => (
  <div className={styles.appShell}>
    <header className={styles.header}>
      <div className={styles.brand}>Flowgraph</div>
      <nav className={styles.nav}>
        {routes.map(route => (
          <NavLink
            key={route.path}
            to={route.path}
            className={({ isActive }) => clsx(styles.navLink, isActive && styles.activeNavLink)}
            end={route.path === '/'}
          >
            {route.label}
          </NavLink>
        ))}
        <a
          className={clsx(styles.navLink, styles.ctaLink)}
          href="https://github.com/flowtomic/flowgraph"
          target="_blank"
          rel="noopener noreferrer"
        >
          GitHub
        </a>
      </nav>
    </header>

    <main className={styles.main}>
      <Routes>
        {routes.map(route => (
          <Route key={route.path} path={route.path} element={route.element} />
        ))}
        <Route path="*" element={<LandingPage />} />
      </Routes>
    </main>

    <footer className={styles.footer}>
      <span>© {new Date().getFullYear()} Flowgraph. Built by Flowtomic.</span>
      <span className={styles.footerLinks}>
        <a href="mailto:hello@flowtomic.ai">Contact</a>
        <a href="/docs#roadmap">Roadmap</a>
      </span>
    </footer>
  </div>
);

export default App;