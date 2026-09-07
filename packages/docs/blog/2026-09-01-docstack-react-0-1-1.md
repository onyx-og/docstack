---
slug: docstack-react-0-1-1
title: "@docstack/react 0.1.1: lists can become empty again"
description: "The 0.1.1 fix to useFind, and what the 0.1.x line brought to the React bindings."
authors: [onyx]
tags: [release, react]
date: 2026-09-01
---

`@docstack/react` 0.1.1 is on npm. It is a one-fix release on top of 0.1.0, which was the first publish of the rewritten bindings a week earlier. This post covers the fix and, for anyone still on 0.0.9, what the 0.1 line changed.

<!-- truncate -->

## The fix: `useFind` applies empty results

`useFind` guarded its state update on `result.docs.length`, so a live list could gain rows but never lose its last one. Deleting the last task shown for a day left it on screen, clickable and pointing at a document that no longer existed, until the component remounted.

The guard was standing in for a staleness concern: a slow earlier query must not overwrite a fast later one. That concern is now owned by a run counter, the same discipline `useQuerySQL` already used, and every result is applied, including an empty one. Consumers that worked around the bug by intersecting the hook's result with their own set can drop the workaround on upgrade. See [ADR-0035](https://github.com/onyx-og/docstack/blob/main/specs/adr/0035-react-usefind-never-applies-an-empty-result.md).

## Paired client release

0.1.1 shipped alongside `@docstack/client` 0.1.8. One client change is visible from the hooks: a stack added after `sync()` now joins the running replication, so `useSyncStatus` reports workspaces mounted later instead of silently omitting them, and `DocStack.getSyncCoverage()` tells an idle stack apart from an unbound one. See [ADR-0034](https://github.com/onyx-og/docstack/blob/main/specs/adr/0034-late-stacks-join-a-running-sync.md).

## What 0.1.0 changed

Published 2026-08-27, 0.1.0 rewrote the hooks around one idea: a query is a subscription.

- **`useQuerySQL` is live by default.** It derives which classes to watch from the query's own AST, so a `JOIN` across three classes re-runs when any of the three changes. Bursts coalesce into one re-run (150 ms by default). Pass `{ live: false }` for a deliberate snapshot. The signature became `useQuerySQL(stack, sql, params?, options?)` with `params` as an array, and the hook returns a `refetch` function. See [ADR-0025](https://github.com/onyx-og/docstack/blob/main/specs/adr/0025-live-usequerysql.md) and [ADR-0026](https://github.com/onyx-og/docstack/blob/main/specs/adr/0026-live-queries-and-subqueries.md).
- **`StackProvider` reconciles its `config` prop.** A stack that appears in the array is opened, one that disappears is closed, and the rest keep running. Reconciliations are serialized, which also removed a race under React's double-invoked effects that produced `409` conflicts on the system document. See [ADR-0022](https://github.com/onyx-og/docstack/blob/main/specs/adr/0022-react-0.0.9.md).
- **The pre-ready window is startup, not an error.** The context publishes `null` until the provider's `ready` event, and every hook keeps `loading: true` through that window rather than reporting "loaded and empty".
- **`useSyncStatus` subscribes to stacks, not to replication handles**, so it survives a `restart()` after a refreshed credential and works whether it mounts before or after `sync()` was called.
- **Types come from `@docstack/client`.** `Patch`, `ClassModel`, `Document`, `SyncStatus`, `StackConfig` and the rest are re-exported from the client so an application using both packages holds one copy of each type.

## Installing

```bash
npm install @docstack/react @docstack/client pouchdb-browser pouchdb-find
```

React 19 is a peer dependency. The [React bindings guide](/docs/guides/react) walks through the provider and every hook; the generated [API reference](/docs/api/react/) lists their signatures.
