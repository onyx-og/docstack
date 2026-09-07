import type { ReactNode } from 'react';
import Layout from '@theme/Layout';
import { Hero, Taste, Features, Audience, Packages, Status } from '@site/src/components/Homepage';

export default function Home(): ReactNode {
  return (
    <Layout
      title="DocStack"
      description="An offline-first embedded document database for the browser: schemas and validation, SQL, triggers, background jobs, field-level encryption, versioned migrations, named transactions, and sync to any PouchDB-compatible remote.">
      <Hero />
      <main>
        <Taste />
        <Features />
        <Audience />
        <Packages />
        <Status />
      </main>
    </Layout>
  );
}
