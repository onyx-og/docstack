import type {ReactNode} from 'react';
import clsx from 'clsx';
import Heading from '@theme/Heading';
import styles from './styles.module.css';

type FeatureItem = {
  title: string;
  Svg: React.ComponentType<React.ComponentProps<'svg'>>;
  description: ReactNode;
};

const FeatureList: FeatureItem[] = [
  {
    title: 'Tame the Chaos',
    Svg: require('@site/static/img/bytedance_confusion.svg').default,
    description: (
      <>
        Stop debugging inconsistent data. Unstructured NoSQL leads to chaos and frustrating bugs. 
        DocStack’s schemas enforce order, ensuring your data is always reliable and predictable.
      </>
    ),
  },
  {
    title: 'Secure by Design',
    Svg: require('@site/static/img/bytedance_security.svg').default,
    description: (
      <>
        Fortify your application with built-in security. DocStack uses server-side 
        cryptography and client-side encryption to safeguard your data.
      </>
    ),
  },
  {
    title: 'Streamlined Development',
    Svg: require('@site/static/img/bytedance_tasks.svg').default,
    description: (
      <>
        Accelerate your development. Our framework automates common tasks and the foundational API,
        so you can dedicate your time to building core features and custom logic.
      </>
    ),
  },
  {
    title: 'Sync Without a Server',
    Svg: require('@site/static/img/sync_backup.svg').default,
    description: (
      <>
        Give users multi-device sync and real backup through their own Google Drive —
        their storage, their control, no infrastructure and no data custody for you.
        Encrypted fields stay encrypted the whole way.
      </>
    ),
  },
];

// Infima's grid is 12 columns wide; split it evenly when the feature count divides
// into it, so adding a card re-flows the row instead of wrapping one card onto its own.
const COLUMN_WIDTH = 12 % FeatureList.length === 0 ? 12 / FeatureList.length : 4;

function Feature({title, Svg, description}: FeatureItem) {
  return (
    <div className={clsx('col', `col--${COLUMN_WIDTH}`)}>
      <div className="text--center">
        <Svg className={styles.featureSvg} role="img" />
      </div>
      <div className="text--center padding-horiz--md">
        <Heading as="h3">{title}</Heading>
        <p>{description}</p>
      </div>
    </div>
  );
}

export default function HomepageFeatures(): ReactNode {
  return (
    <section className={styles.features}>
      <div className="container">
        <div className="row">
          {FeatureList.map((props, idx) => (
            <Feature key={idx} {...props} />
          ))}
        </div>
      </div>
    </section>
  );
}
