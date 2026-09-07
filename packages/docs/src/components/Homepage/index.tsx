import type { ReactNode } from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import useBaseUrl from '@docusaurus/useBaseUrl';
import CodeBlock from '@theme/CodeBlock';
import Heading from '@theme/Heading';
import styles from './styles.module.css';

const CLIENT_SAMPLE = `import { ClientStack, Class, Attribute } from '@docstack/client';

// A local database, with named transactions enabled.
const stack = await ClientStack.create('my-app', { transactions: true });

// A class is a schema, and a document.
const taskClass = await Class.create(stack, 'Task', 'class', 'User tasks');
await Attribute.create(taskClass, 'title', 'string', 'Title', { mandatory: true });
await Attribute.create(taskClass, 'priority', 'string', 'Priority');
await Attribute.create(taskClass, 'isComplete', 'boolean', 'Done?', { defaultValue: false });

await taskClass.add({ title: 'Install DocStack', priority: 'high' });

// SQL, against the browser's own storage.
const { rows } = await stack.query(
    \`SELECT title FROM Task WHERE priority = ? AND isComplete = false ORDER BY title\`,
    'high'
);`;

const REACT_SAMPLE = `import { StackProvider, useClassDocs } from '@docstack/react';

const App = () => (
    <StackProvider config={[{ name: 'my-app', patches: SCHEMA }]}>
        <TaskList />
    </StackProvider>
);

const TaskList = () => {
    // Re-renders whenever a Task changes, locally or arriving over sync.
    const { docs, loading } = useClassDocs('my-app', 'Task');
    if (loading) return <p>Loading…</p>;
    return <ul>{docs.map(t => <li key={t._id}>{t.title}</li>)}</ul>;
};`;

type IconName = 'offline' | 'sql' | 'logic' | 'lock' | 'scope' | 'sync' | 'patch' | 'transaction' | 'react';

function Icon({ name }: { name: IconName }): ReactNode {
  const common = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (name) {
    case 'offline':
      return <svg {...common}><path d="M5 12.5a7 7 0 0 1 14 0" /><path d="M8.5 15.5a3.5 3.5 0 0 1 7 0" /><circle cx="12" cy="19" r="1" /><path d="M3 3l18 18" /></svg>;
    case 'sql':
      return <svg {...common}><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5" /><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" /></svg>;
    case 'logic':
      return <svg {...common}><path d="M8 4v16" /><path d="M8 8h5a3 3 0 0 1 0 6H8" /><circle cx="17" cy="11" r="2" /><circle cx="8" cy="4" r="1.5" /><circle cx="8" cy="20" r="1.5" /></svg>;
    case 'lock':
      return <svg {...common}><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /><circle cx="12" cy="15.5" r="1" /></svg>;
    case 'scope':
      return <svg {...common}><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /><path d="M12 4v3M12 17v3M4 12h3M17 12h3" /></svg>;
    case 'sync':
      return <svg {...common}><path d="M4 12a8 8 0 0 1 13.7-5.7L20 8" /><path d="M20 4v4h-4" /><path d="M20 12a8 8 0 0 1-13.7 5.7L4 16" /><path d="M4 20v-4h4" /></svg>;
    case 'patch':
      return <svg {...common}><path d="M6 4h9l5 5v11a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" /><path d="M14 4v5h5" /><path d="M9 14h6M9 17h4" /></svg>;
    case 'transaction':
      return <svg {...common}><rect x="4" y="5" width="16" height="14" rx="2" /><path d="M8 12l3 3 5-6" /></svg>;
    case 'react':
      return <svg {...common}><circle cx="12" cy="12" r="1.6" /><ellipse cx="12" cy="12" rx="9" ry="3.5" /><ellipse cx="12" cy="12" rx="9" ry="3.5" transform="rotate(60 12 12)" /><ellipse cx="12" cy="12" rx="9" ry="3.5" transform="rotate(120 12 12)" /></svg>;
  }
}

const FEATURES: { icon: IconName; title: string; body: string; to: string }[] = [
  { icon: 'offline', title: 'Offline-first by default', body: 'The database is embedded. No round trip for a read, a write, a validation or a join. Works on a plane, in a basement, on a train.', to: '/docs/concepts/offline-first-and-sync' },
  { icon: 'sql', title: 'SQL in the browser', body: 'SELECT, JOIN, GROUP BY, subqueries, ORDER BY … LIMIT, with index pushdown and streaming scans. No hand-written map/reduce.', to: '/docs/guides/query-with-sql' },
  { icon: 'logic', title: 'Logic as data', body: 'Triggers and jobs live in the database as documents. Update behaviour at runtime; it replicates with the rest.', to: '/docs/guides/triggers' },
  { icon: 'lock', title: 'Field-level encryption', body: 'Mark an attribute encrypted and it is ciphertext on disk and on the remote. Your sync target holds data it cannot read.', to: '/docs/guides/encrypt-fields' },
  { icon: 'scope', title: 'Access by scope', body: 'Content is sealed under an attribute formula. A session that does not satisfy it cannot produce the plaintext. Denial is decryption failure, not a check.', to: '/docs/concepts/access-control/' },
  { icon: 'sync', title: 'Bring-your-own-remote sync', body: 'stack.sync({ remote }) against any PouchDB-compatible database, including the user\'s own Google Drive. DocStack never learns about your provider.', to: '/docs/guides/sync' },
  { icon: 'patch', title: 'Versioned schema patches', body: 'Migrations as declarative documents with a semver ledger: applied once, all-or-nothing, gated across devices so a trailing client cannot corrupt a leading one.', to: '/docs/guides/patches' },
  { icon: 'transaction', title: 'Named write transactions', body: 'Stage a multi-document change, read your own staged state, commit as one batch through the full pipeline, or discard it. Atomicity is reported, not assumed.', to: '/docs/guides/transactions' },
  { icon: 'react', title: 'Live React bindings', body: 'Every hook subscribes to the local database. No refetching, no cache invalidation, no staleness story to own.', to: '/docs/guides/react' },
];

const AUDIENCE = [
  ['Offline-first field and mobile apps', 'Data collection, point-of-sale, inspections, note-taking. Validation and business logic run without connectivity, and reconcile later.'],
  ['Serverless personal apps with user-owned backup', 'Sync to the user\'s own Drive. Multi-device sync and real backup with no server, no storage bill, and no custody of anyone\'s data.'],
  ['Privacy-sensitive and regulated data', 'Health notes, financial records, journals. Encrypted attributes are unreadable to the storage operator and to the sync remote.'],
  ['Multi-tenant products and internal tools', 'Each tenant gets a scope sealed under its attribute; one deployment serves many tenants while one tenant\'s devices can hold, but never read, another\'s data.'],
  ['Analytics and reporting surfaces', 'The SQL engine lets support staff and analysts query joined, filtered data without a bespoke reporting API.'],
];

export function Hero(): ReactNode {
  const logo = useBaseUrl('/img/logo.svg');
  return (
    <header className={styles.hero}>
      <div className="container">
        <div className={styles.heroInner}>
          <div>
            <div className={styles.brand}>
              <img src={logo} alt="" width={64} height={64} />
              <Heading as="h1">DocStack</Heading>
            </div>
            <p className={styles.tagline}>One does not simply stack documents.</p>
            <p className={styles.lede}>
              A document data layer for storing, managing and consuming application data.
              Offline-friendly by construction, sync-friendly by design. Schemas, SQL, triggers,
              background jobs, field-level encryption, versioned migrations and named transactions,
              all inside your application, with a remote that can be anything from CouchDB to the
              user's own Google Drive.
            </p>
            <div className={styles.ctas}>
              <Link className={clsx('button button--lg', styles.ctaPrimary)} to="/docs/get-started/installation">
                Get started
              </Link>
              <Link className={clsx('button button--outline button--lg', styles.ctaSecondary)} href="pathname:///app/index.html">
                Open the workbench
              </Link>
            </div>
            <div className={styles.badges}>
              <a href="https://www.npmjs.com/package/@docstack/client"><img alt="@docstack/client on npm" src="https://img.shields.io/npm/v/@docstack/client?label=%40docstack%2Fclient&color=6200EE" /></a>
              <a href="https://www.npmjs.com/package/@docstack/react"><img alt="@docstack/react on npm" src="https://img.shields.io/npm/v/@docstack/react?label=%40docstack%2Freact&color=00674F" /></a>
              <a href="https://github.com/onyx-og/docstack/blob/main/LICENSE.md"><img alt="License CC-BY-SA-4.0" src="https://img.shields.io/badge/license-CC--BY--SA--4.0-lightgrey" /></a>
            </div>
          </div>
          <div className={clsx(styles.install, styles.taste, 'docstack-glow')}>
            <CodeBlock language="bash" title="Install">{`npm install @docstack/client \\\n  pouchdb-browser pouchdb-find\n\n# React bindings, optional\nnpm install @docstack/react`}</CodeBlock>
          </div>
        </div>
      </div>
    </header>
  );
}

export function Taste(): ReactNode {
  return (
    <section className={styles.section}>
      <div className="container">
        <Heading as="h2" className={styles.sectionTitle}>A 60-second taste</Heading>
        <p className={styles.sectionLede}>Define a model and query it, all locally, no server. Then wire it into React and the list stays live.</p>
        <div className={clsx(styles.tasteGrid, styles.taste)}>
          <div>
            <Heading as="h3">@docstack/client</Heading>
            <CodeBlock language="typescript">{CLIENT_SAMPLE}</CodeBlock>
          </div>
          <div>
            <Heading as="h3">@docstack/react</Heading>
            <CodeBlock language="tsx">{REACT_SAMPLE}</CodeBlock>
          </div>
        </div>
      </div>
    </section>
  );
}

export function Features(): ReactNode {
  return (
    <section className={clsx(styles.section, styles.sectionAlt)}>
      <div className="container">
        <Heading as="h2" className={styles.sectionTitle}>Why DocStack</Heading>
        <p className={styles.sectionLede}>
          A document store with the things applications actually need, without giving up the
          offline-first, replication-friendly nature that made document stores worth using.
        </p>
        <div className={styles.grid}>
          {FEATURES.map(f => (
            <Link key={f.title} className={styles.card} to={f.to}>
              <span className={styles.cardIcon}><Icon name={f.icon} /></span>
              <Heading as="h3">{f.title}</Heading>
              <p>{f.body}</p>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

export function Audience(): ReactNode {
  return (
    <section className={styles.section}>
      <div className="container">
        <Heading as="h2" className={styles.sectionTitle}>Who it's for</Heading>
        <ul className={styles.audience}>
          {AUDIENCE.map(([title, body]) => (
            <li key={title}><strong>{title}.</strong> {body}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function Packages(): ReactNode {
  return (
    <section className={clsx(styles.section, styles.sectionAlt)}>
      <div className="container">
        <Heading as="h2" className={styles.sectionTitle}>Packages</Heading>
        <div className={styles.packages}>
          <div className={styles.package}>
            <Heading as="h3">@docstack/client</Heading>
            <p>The engine: schema, SQL, triggers, jobs, encryption, patches, transactions, sync. Runs in the browser.</p>
            <a href="https://www.npmjs.com/package/@docstack/client"><img alt="npm" src="https://img.shields.io/npm/v/@docstack/client" /></a>
          </div>
          <div className={styles.package}>
            <Heading as="h3">@docstack/react</Heading>
            <p>Provider and live hooks over the client. Every query is a subscription.</p>
            <a href="https://www.npmjs.com/package/@docstack/react"><img alt="npm" src="https://img.shields.io/npm/v/@docstack/react" /></a>
          </div>
          <div className={styles.package}>
            <Heading as="h3">@docstack/pouchdb-adapter-googledrive</Heading>
            <p>The user's own Google Drive folder as a PouchDB remote. Append-only log, lazy loading, multi-writer safe.</p>
            <a href="https://www.npmjs.com/package/@docstack/pouchdb-adapter-googledrive"><img alt="npm" src="https://img.shields.io/npm/v/@docstack/pouchdb-adapter-googledrive" /></a>
          </div>
          <div className={styles.package}>
            <Heading as="h3">Workbench</Heading>
            <p>Browse a database, edit its schema, run queries, view the entity-relation diagram. In the browser, no install.</p>
            <Link href="pathname:///app/index.html">Open the workbench</Link>
          </div>
          <div className={styles.package}>
            <Heading as="h3">@docstack/server</Heading>
            <p>The same engine deployed server-side: a sync hub, shared workspaces, server-side jobs. Preview, not published.</p>
            <Link to="/docs/reference/server">What it is for</Link>
          </div>
        </div>
      </div>
    </section>
  );
}

export function Status(): ReactNode {
  return (
    <section className={styles.section}>
      <div className="container">
        <p className={styles.status}>
          <strong>Pre-1.0 and moving.</strong> <code>@docstack/client</code> and <code>@docstack/react</code> are
          published and in production use; the workbench is an application you visit rather than install;{' '}
          <code>@docstack/server</code> is a preview of the same engine deployed server-side. Every decision behind the
          engine is recorded as an <Link to="/docs/contributing/decision-records">architecture decision record</Link>.
        </p>
      </div>
    </section>
  );
}
