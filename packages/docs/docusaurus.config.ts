import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

const config: Config = {
  title: 'DocStack',
  tagline: 'One does not simply stack documents',
  favicon: 'img/favicon.ico',

  // Future flags, see https://docusaurus.io/docs/api/docusaurus-config#future
  future: {
    v4: true, // Improve compatibility with the upcoming Docusaurus v4
  },

  // Set the production url of your site here
  url: 'https://onyx-og.github.io/',
  // Set the /<baseUrl>/ pathname under which your site is served
  // For GitHub pages deployment, it is often '/<projectName>/'
  baseUrl: '/docstack/',

  // GitHub pages deployment config.
  // If you aren't using GitHub pages, you don't need these.
  organizationName: 'onyx-og', // Usually your GitHub org/user name.
  projectName: 'docstack', // Usually your repo name.

  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'warn',
  plugins: [
    [
      'docusaurus-plugin-typedoc',
      {
        id: 'server',
        // TypeDoc options are passed directly here
        entryPoints: ['../server/src/index.ts'],
        tsconfig: '../server/tsconfig.json',
        out: 'docs/server',
      }
    ],
    [
      'docusaurus-plugin-typedoc',
      {
        id: 'client',
        entryPoints: ['../client/src/index.ts'],
        tsconfig: '../client/tsconfig.json',
        out: 'docs/client',
      }
    ],
    [
      'docusaurus-plugin-typedoc',
      {
        id: 'react',
        entryPoints: ['../react/src/index.ts'],
        tsconfig: '../react/tsconfig.json',
        out: 'docs/react',
      },
    ],
  ],
  // Even if you don't use internationalization, you can use this field to set
  // useful metadata like html lang. For example, if your site is Chinese, you
  // may want to replace "en" with "zh-Hans".
  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  markdown: {
    format: 'md',
  },

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          // Please change this to your repo.
          // Remove this to remove the "edit this page" links.
          editUrl:
            'https://github.com/facebook/docusaurus/tree/main/packages/create-docusaurus/templates/shared/',
        },
        // blog: {
        //   showReadingTime: true,
        //   feedOptions: {
        //     type: ['rss', 'atom'],
        //     xslt: true,
        //   },
        //   // Please change this to your repo.
        //   // Remove this to remove the "edit this page" links.
        //   editUrl:
        //     'https://github.com/facebook/docusaurus/tree/main/packages/create-docusaurus/templates/shared/',
        //   // Useful options to enforce blogging best practices
        //   onInlineTags: 'warn',
        //   onInlineAuthors: 'warn',
        //   onUntruncatedBlogPosts: 'warn',
        // },
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    // Replace with your project's social card
    image: 'img/banner-social.jpg',
    navbar: {
      title: 'DocStack',
      logo: {
        alt: 'DocStack Logo',
        src: 'img/logo.svg',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'docs',
          position: 'left',
          label: 'Docs',
        },
        {
          type: 'dropdown',
          label: 'API',
          position: 'left',
          items: [
            {
              type: 'docSidebar',
              sidebarId: 'client',
              label: 'Client',
            },
            {
              type: 'docSidebar',
              sidebarId: 'server',
              label: 'Server',
            },
            // {
            //   type: 'docSidebar',
            //   sidebarId: 'react',
            //   label: 'React',
            // },
          ],
        },
        {href: 'pathname:///app/index.html', label: 'Live', position: 'right'},
        {
          href: 'https://github.com/onyx-og/docstack',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Docs',
          items: [
            {
              label: 'Architecture',
              to: '/docs/architecture/core-concepts',
            },
          ],
        },
        {
          title: 'Community',
          items: [
            {
              label: 'X',
              href: 'https://x.com/onyx-og',
            },
          ],
        },
        {
          title: 'More',
          items: [
            {
              label: 'GitHub',
              href: 'https://github.com/onyx-og/docstack',
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} DocStack, Onyx AC, LLC`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
