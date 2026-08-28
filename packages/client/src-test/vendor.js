/**
 * Globals for the UMD test page.
 *
 * `test/index.html` loads `lib/index.umd.js` with a plain `<script>` tag, and a UMD bundle
 * resolves its externals from globals. This file supplies exactly the externals
 * `rollup.config.js` declares, and nothing else.
 *
 * It is a test fixture and must never be shipped: claiming `globalThis.PouchDB` in a
 * consumer's page would hand DocStack's copy to application code that opened its own, and
 * two PouchDB instances on one database do not share change listeners.
 */

// Database
import PouchDBBrowser from 'pouchdb-browser';
import PouchDBFind from 'pouchdb-find';
import * as shared from "@docstack/shared"

// Utilities
import * as zod from 'zod';
import * as semver from 'semver';
import * as jsondiffpatch from 'jsondiffpatch';

globalThis.PouchDB = PouchDBBrowser;
globalThis.PouchDBFind = PouchDBFind;
globalThis.shared = shared;
globalThis.z = zod;
globalThis.semver = semver;
globalThis.jsondiffpatch = jsondiffpatch;

// The channel adapter (ADR-0030), for the browser tests that put a real MessagePort
// under it - the Node suite in its own package covers semantics over a loopback, the
// tests here cover the platform. Imported by path so the bundle never depends on
// workspace symlinks.
import ChannelPlugin, * as docstackChannel from '../../pouchdb-adapter-channel/lib/index.js';

globalThis.docstackChannel = { ...docstackChannel, ChannelPlugin };
