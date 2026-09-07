# @docstack/docs

The DocStack documentation site, built with [Docusaurus](https://docusaurus.io/) and published at [onyx-og.github.io/docstack](https://onyx-og.github.io/docstack/).

## Running it

From the repository root:

```bash
npm install            # once; links the workspaces
npm run start:docs     # dev server with polling (WSL and network drives)
npm run build:docs     # writes the static site to the repository's root docs/ folder
```

The root `docs/` folder is committed: GitHub Pages serves it from the `main` branch, and the `Deploy Docs` workflow rebuilds and commits it when docs sources or package sources change. `npm run serve` in this package previews that folder.

The API reference under `docs/api/` is generated at build time by TypeDoc from `packages/client`, `packages/react` and `packages/server`; the directory is gitignored. `npm run clean:api` removes it.

## What goes where

The docs follow the [Diátaxis](https://diataxis.fr/) split:

| Folder | Kind | Ask before adding a page |
| :--- | :--- | :--- |
| `docs/get-started/` | Tutorials | Does a newcomer follow this end to end and end up with something working? |
| `docs/guides/` | How-to | Is this a task someone comes with, and does the page get them through it with real, runnable code? |
| `docs/concepts/` | Explanation | Does this explain how or why an engine works, without being the place someone looks up an option? |
| `docs/reference/` | Reference | Is every value on the page verifiable against `packages/*/src`? |
| `docs/contributing/` | For contributors | Is this about the repository rather than the product? |
| `blog/` | Release notes | One post per published package version, derived from the package changelog and the ADRs. |

`docs/concepts/access-control/` is the one section written in the present tense about an accepted design (ADR-0045) whose integration is scheduled; the rest of the site is aligned to its vocabulary.

Rules the site holds itself to: no placeholders, no claim without the source file that implements it, no adapter or package that is not published, tables never carry a bare `|` in a cell, and every page has `title`, `description` and `sidebar_position` frontmatter. Descriptions feed the search index, the social cards and `llms.txt`.

### Adding a page

1. Create the file with frontmatter:

   ```markdown
   ---
   title: "Encrypt fields"
   description: "One sentence, quoted, that stands alone in a search result."
   sidebar_position: 5
   ---
   ```

2. Add its id to `sidebars.ts`. Ids are explicit so a missing file fails the build.
3. Link with relative `.md` paths. Broken links, anchors and images fail the build.
4. `npm run build:docs`.

### Adding a release post

Create `blog/YYYY-MM-DD-<package>-<version>.md` with `slug`, `title`, `description`, `authors: [onyx]`, `tags` from `blog/tags.yml`, a `date`, and a `<!-- truncate -->` marker after the lead paragraph. Untruncated posts, unknown tags and inline authors fail the build.

## Publishing to onyx.ac

The same pages are mirrored to the WordPress site at [onyx.ac](https://onyx.ac), which indexes better than GitHub Pages. The mirror is one-way: this repository is the source of truth, WordPress is rendered output, and anything edited on the site is overwritten on the next run.

```bash
npm run sync:docs:wp -- --dry-run    # from the repository root
```

With no credentials the run is offline: it renders every page under `.wp-sync/pages/`, writes `.wp-sync/plan.json` describing what it would change, and makes no request. That output is the thing to read when checking the conversion.

To publish, copy `.env.example` to `.env` and fill in `WP_USER` and `WP_APP_PASSWORD` with a WordPress Application Password (Users → Profile → Application Passwords), then:

```bash
npm run sync:docs:wp                 # create and update
npm run sync:docs:wp -- --prune      # also trash pages whose document is gone
npm run sync:docs:wp -- --only guides
npm run -w packages/docs wp:sync:test
```

### How the mirror is shaped

Pages mirror the file layout, so a WordPress URL matches the Docusaurus one: `docs/guides/sync.md` becomes `/docstack/docs/guides/sync/`. A directory becomes a page of its own, titled by its sidebar category, holding its `index.md` if it has one and a generated list of its children if it does not. The document with `slug: /` becomes the documentation root. `sidebars.ts` supplies the ordering, the `menu_order` values and the previous/next links; the generated API reference under `docs/api/` is not published, and links into it point back at the Docusaurus site.

Each page is a two-column block layout: a core page list rooted at the docs page on the left, and the document on the right between a breadcrumb and previous/next links. Nothing is hard-coded into the navigation, so WordPress renders it from its own page tree. The theme can style `docstack-docs`, `docstack-docs-nav`, `docstack-docs-breadcrumb`, `docstack-docs-index`, `docstack-docs-pagination`, `docstack-admonition-<type>`, `pre.wp-block-code.language-*` and `pre.mermaid`; the last two need highlighting and a mermaid script from the theme to look like they do here.

`WP_ROOT_PATH` decides where the tree hangs, so moving the docs from `/docstack` to `/products/docstack` is a configuration change. Missing pages along that path are created as empty navigation stubs; pages that already exist, such as the DocStack product page, are used as the parent and never edited. A page is identified by its parent and slug, so re-running only rewrites what actually differs and a second run reports everything as unchanged.

Pushing to `main` runs the `Sync Docs to WordPress` workflow, which needs the repository secrets `WP_USER` and `WP_APP_PASSWORD` and the variables `WP_URL` and `WP_ROOT_PATH`. It can also be dispatched by hand with dry-run, prune and root inputs, and always uploads the plan as an artefact.

## Publishing to onyx.ac

The hand-written documentation (the `docs` sidebar, 42 pages) is mirrored to onyx.ac as native Gutenberg pages by [pterodoc](https://github.com/onyx-ac/pterodoc). Docusaurus stays the source of truth; WordPress is a mirror. Where the tree hangs and how pages are laid out is in `pterodoc.config.mjs`; credentials come from the environment only.

```bash
cp .env.example .env                        # fill in WP_USER and WP_APP_PASSWORD; .env is git-ignored
npm run wp:doctor -- --env-file .env        # config, credentials and permissions
npm run wp:render                           # render every page into .pterodoc/, contacts nothing
npm run wp:sync:dry -- --env-file .env      # plan against the live site, change nothing
npm run wp:sync -- --env-file .env          # create and update pages
```

pterodoc reads an env file only when asked (`--env-file`, or `PTERODOC_ENV_FILE=.env`), so a developer's `.env` can never leak into a scripted run; the workflow passes the variables directly. `npm run publish:docs` and `publish:docs:dry` at the repository root run the same two commands. Without credentials every command still renders and reports what it would have done, and `.pterodoc/plan.json` lists each action.

Pages mirror the documentation URLs: `/docs/guides/sync` becomes `/product/docstack/docs/guides/sync/` on WordPress, a sidebar category becomes a page of its own, and a page is identified by its parent and slug, so a second run reports everything as unchanged. The generated API reference is not mirrored; links into it point back at this site. A page that disappears from the source is left in place unless the sync runs with `--prune`.

The `Publish Docs to onyx.ac` workflow runs the same sync on every push to `main` that touches the docs, and on demand with a dry-run default. It needs the repository variable `WP_URL` and the secrets `WP_USER` and `WP_APP_PASSWORD`; `PTERODOC_WP_ROOT` and `WP_LANG` are optional variables. Until the secrets exist, a push only renders and uploads the plan.

pterodoc is not on npm yet, so it is a devDependency pinned to the commit tagged `v0.1.0` in its GitHub repository and built on install; once it is published, the pin becomes a version range.

## The workbench bundle

`static/app/` is the production build of `packages/ui`, copied in by hand and served at `/docstack/app/`. Rebuild it with `npm run build:ui` from the root and copy `packages/ui/build/*` over it when the workbench changes.

## Tooling

Docusaurus 3.10 with the Rspack-based bundler, `@docusaurus/theme-mermaid` for diagrams, `@easyops-cn/docusaurus-search-local` for offline search, `@docusaurus/plugin-client-redirects` for the pre-2026 URL layout, `docusaurus-plugin-llms` for `llms.txt` and `llms-full.txt`, and `docusaurus-plugin-typedoc` for the API reference.
