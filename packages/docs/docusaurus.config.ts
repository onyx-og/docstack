import { themes as prismThemes } from 'prism-react-renderer';
import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

// This file runs in Node.js: no browser APIs, no JSX.

const SITE_DESCRIPTION =
  'DocStack is an offline-first embedded document database for the browser: ' +
  'schemas and validation, SQL, triggers, background jobs, field-level encryption, ' +
  'versioned migrations, named transactions, and sync to any PouchDB-compatible remote, ' +
  'including the user\'s own Google Drive.';

const typedocInstance = (id: string, extra: Record<string, unknown> = {}) => [
  'docusaurus-plugin-typedoc',
  {
    id,
    entryPoints: [`../${id}/src/index.ts`],
    tsconfig: `../${id}/tsconfig.json`,
    out: `docs/api/${id}`,
    readme: 'none',
    entryFileName: 'index.md',
    excludeExternals: true,
    excludeInternal: true,
    excludePrivate: true,
    excludeProtected: true,
    sidebar: { autoConfiguration: true, pretty: true },
    parametersFormat: 'table',
    propertiesFormat: 'table',
    enumMembersFormat: 'table',
    typeDeclarationFormat: 'table',
    indexFormat: 'table',
    useCodeBlocks: true,
    sourceLinkTemplate: 'https://github.com/onyx-og/docstack/blob/main/{path}#L{line}',
    ...extra,
  },
];

// Old URLs (linked from the READMEs and npm) → their new homes.
const REDIRECTS: { from: string; to: string }[] = [
  { from: '/docs/get-started/intro', to: '/docs/' },
  { from: '/docs/get-started/applications', to: '/docs/' },
  { from: '/docs/get-started/goals', to: '/docs/contributing/roadmap' },
  { from: '/docs/architecture/core-concepts', to: '/docs/concepts/core-concepts' },
  { from: '/docs/architecture/under-the-hood', to: '/docs/concepts/under-the-hood' },
  { from: '/docs/architecture/infrastructure', to: '/docs/contributing/monorepo-and-builds' },
  { from: '/docs/architecture/communication', to: '/docs/concepts/offline-first-and-sync' },
  { from: '/docs/architecture/security', to: '/docs/concepts/security' },
  { from: '/docs/architecture/android-permetic', to: '/docs/contributing/monorepo-and-builds' },
  { from: '/docs/architecture/data-model-schema', to: '/docs/concepts/schema-engine' },
  { from: '/docs/architecture/data-model-propagation', to: '/docs/contributing/schema-propagation-internals' },
  { from: '/docs/architecture/data-model-triggers', to: '/docs/guides/triggers' },
  { from: '/docs/architecture/data-model-patches', to: '/docs/concepts/patches' },
  { from: '/docs/architecture/core-crypto', to: '/docs/concepts/crypto-engine' },
  { from: '/docs/architecture/core-jobs', to: '/docs/guides/jobs' },
  { from: '/docs/architecture/core-query-engine', to: '/docs/guides/query-with-sql' },
  { from: '/docs/architecture/core-triggers-and-jobs', to: '/docs/guides/triggers' },
  { from: '/docs/architecture/policy-engine/index', to: '/docs/concepts/access-control/' },
  { from: '/docs/architecture/policy-engine/policy-model', to: '/docs/concepts/access-control/policy-model' },
  { from: '/docs/architecture/policy-engine/crypto-access', to: '/docs/concepts/access-control/crypto-access' },
  { from: '/docs/architecture/policy-engine/architectures', to: '/docs/concepts/access-control/architectures' },
  { from: '/docs/architecture/policy-engine/threat-model', to: '/docs/concepts/access-control/threat-model' },
  { from: '/docs/architecture/policy-engine/recipes', to: '/docs/concepts/access-control/recipes' },
  { from: '/docs/sync/overview', to: '/docs/guides/sync' },
  { from: '/docs/sync/google-drive', to: '/docs/guides/google-drive' },
  { from: '/docs/sync/filtering', to: '/docs/guides/filtering' },
];

const config: Config = {
  title: 'DocStack',
  tagline: 'One does not simply stack documents.',
  favicon: 'img/favicon.ico',

  future: {
    v4: true,
    faster: true,
    // Per-file git lookups. The v4 default (eager) reads every git repository under the
    // worktree, submodules included, and fails on one that has no commits yet.
    experimental_vcs: 'default-v1',
  },

  url: 'https://onyx-og.github.io',
  baseUrl: '/docstack/',
  organizationName: 'onyx-og',
  projectName: 'docstack',

  onBrokenLinks: 'throw',
  // Anchors only warn: typedoc-plugin-markdown emits `#get-3`-style anchors for overloaded
  // methods in the generated API reference that Docusaurus renders under different ids.
  // Hand-written pages are still checked by the link and markdown-link hooks below.
  onBrokenAnchors: 'warn',

  markdown: {
    format: 'md',
    mermaid: true,
    hooks: {
      onBrokenMarkdownLinks: 'throw',
      onBrokenMarkdownImages: 'throw',
    },
  },

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  themes: [
    '@docusaurus/theme-mermaid',
    [
      '@easyops-cn/docusaurus-search-local',
      {
        hashed: true,
        language: ['en'],
        indexDocs: true,
        indexBlog: true,
        indexPages: true,
        docsRouteBasePath: '/docs',
        blogRouteBasePath: '/blog',
        highlightSearchTermsOnTargetPage: true,
        searchBarShortcutHint: true,
      },
    ],
  ],

  plugins: [
    typedocInstance('client'),
    typedocInstance('react'),
    // The server package is a preview and does not compile cleanly; document what it exports anyway.
    typedocInstance('server', { skipErrorChecking: true }),
    [
      '@docusaurus/plugin-client-redirects',
      {
        redirects: REDIRECTS,
        createRedirects(existingPath: string) {
          if (existingPath.startsWith('/docs/api/client')) {
            return [existingPath.replace('/docs/api/client', '/docs/client')];
          }
          if (existingPath.startsWith('/docs/api/server')) {
            return [existingPath.replace('/docs/api/server', '/docs/server')];
          }
          return undefined;
        },
      },
    ],
    [
      'docusaurus-plugin-llms',
      {
        generateLLMsTxt: true,
        generateLLMsFullTxt: true,
        docsDir: 'docs',
        ignoreFiles: ['api/**'],
        includeBlog: true,
        title: 'DocStack',
        description: SITE_DESCRIPTION,
      },
    ],
  ],

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          editUrl: 'https://github.com/onyx-og/docstack/tree/main/packages/docs/',
          showLastUpdateTime: true,
        },
        blog: {
          blogTitle: 'Release notes',
          blogDescription: 'Release notes for the @docstack packages.',
          blogSidebarTitle: 'Releases',
          blogSidebarCount: 'ALL',
          showReadingTime: false,
          postsPerPage: 10,
          authorsMapPath: 'authors.yml',
          tags: 'tags.yml',
          onInlineTags: 'throw',
          onInlineAuthors: 'throw',
          onUntruncatedBlogPosts: 'throw',
          feedOptions: {
            type: ['rss', 'atom'],
            xslt: true,
          },
          editUrl: 'https://github.com/onyx-og/docstack/tree/main/packages/docs/',
        },
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    image: 'img/social-card.png',
    metadata: [
      { name: 'description', content: SITE_DESCRIPTION },
      {
        name: 'keywords',
        content:
          'offline-first, embedded database, browser database, pouchdb, sql, encryption, sync, google drive, react, typescript',
      },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:site', content: '@onyx-og' },
      { property: 'og:type', content: 'website' },
    ],
    colorMode: {
      defaultMode: 'dark',
      respectPrefersColorScheme: true,
    },
    docs: {
      sidebar: {
        hideable: true,
        autoCollapseCategories: true,
      },
    },
    tableOfContents: {
      minHeadingLevel: 2,
      maxHeadingLevel: 4,
    },
    navbar: {
      title: 'DocStack',
      logo: {
        alt: 'DocStack',
        src: 'img/logo.svg',
      },
      items: [
        { type: 'docSidebar', sidebarId: 'docs', position: 'left', label: 'Docs' },
        {
          type: 'dropdown',
          label: 'API',
          position: 'left',
          items: [
            { type: 'docSidebar', sidebarId: 'apiClient', label: '@docstack/client' },
            { type: 'docSidebar', sidebarId: 'apiReact', label: '@docstack/react' },
            { type: 'docSidebar', sidebarId: 'apiServer', label: '@docstack/server (preview)' },
          ],
        },
        { to: '/blog', label: 'Releases', position: 'left' },
        { href: 'pathname:///app/index.html', label: 'Workbench', position: 'right' },
        { href: 'https://github.com/onyx-og/docstack', label: 'GitHub', position: 'right' },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Docs',
          items: [
            { label: 'Introduction', to: '/docs/' },
            { label: 'Quickstart', to: '/docs/get-started/quickstart' },
            { label: 'Guides', to: '/docs/guides/model-your-data' },
            { label: 'Concepts', to: '/docs/concepts/core-concepts' },
            { label: 'Reference', to: '/docs/reference/class-and-attribute-options' },
          ],
        },
        {
          title: 'Packages',
          items: [
            { label: '@docstack/client', href: 'https://www.npmjs.com/package/@docstack/client' },
            { label: '@docstack/react', href: 'https://www.npmjs.com/package/@docstack/react' },
            {
              label: '@docstack/pouchdb-adapter-googledrive',
              href: 'https://www.npmjs.com/package/@docstack/pouchdb-adapter-googledrive',
            },
            { label: 'Workbench', href: 'pathname:///app/index.html' },
          ],
        },
        {
          title: 'Community',
          items: [
            { label: 'GitHub', href: 'https://github.com/onyx-og/docstack' },
            { label: 'Release notes', to: '/blog' },
            { label: 'X', href: 'https://x.com/onyx-og' },
            { label: 'onyx.ac', href: 'https://onyx.ac' },
          ],
        },
      ],
      copyright: `© ${new Date().getFullYear()} Onyx AC, LLC · CC-BY-SA-4.0`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['sql', 'yaml', 'bash', 'json', 'toml'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
