/**
 * Publishing the DocStack documentation to onyx.ac.
 *
 * Everything Docusaurus already knows — the site URL, the base URL, the route
 * base path, the locales, the markdown format, the admonition keywords — is
 * read from docusaurus.config.ts and is deliberately not repeated here.
 *
 * @type {import('pterodoc').PterodocConfig}
 */
export default {
  site: {
    // Only the hand-written sidebar. The generated API reference lives in the
    // apiClient, apiReact and apiServer sidebars and is not mirrored; links
    // into it point back at the Docusaurus site.
    sidebars: ['docs'],
    versions: 'last',
    locales: 'default',
  },

  target: {
    type: 'wordpress',
    // The tree hangs from /product/docstack/docs/. Pages above the documentation
    // root (/products and /products/docstack) are created once if missing and never
    // edited again, so /product/docstack is authored in WordPress as the product
    // page, with whatever layout its future siblings under /product share.
    root: '/products/docstack',
    base: 'docs',
    status: 'publish',
    // Jetpack's SEO description field.
    meta: { description: 'advanced_seo_description' },
  },

  layout: {
    kind: 'two-column',
    navWidth: '25%',
    mainWidth: '75%',
    nav: 'page-list',
    breadcrumb: true,
    pagination: true,
    childIndex: 'auto',
  },

  render: {
    // Keeps the theme CSS that already targets these class names working.
    classPrefix: 'docstack',
    unpublishedLinks: 'site',
  },

  output: { dir: '.pterodocs' },
};
