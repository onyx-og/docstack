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

// The ABE AUTHORITY functions (setup/keygen), for tests that mint attribute
// keys. Deliberately test-only: the authority runs where the application
// controls it (ADR-0045), never in the client's public API. buildAccessScope
// and unlockScopes reach the same @docstack/abe through the client bundle.
import * as docstackAbe from "@docstack/abe";

// Utilities
import * as zod from 'zod';
import * as semver from 'semver';
import * as jsondiffpatch from 'jsondiffpatch';

globalThis.PouchDB = PouchDBBrowser;
globalThis.PouchDBFind = PouchDBFind;
globalThis.shared = shared;
globalThis.docstackAbe = docstackAbe;
globalThis.z = zod;
globalThis.semver = semver;
globalThis.jsondiffpatch = jsondiffpatch;

// The channel adapter (ADR-0030), for the browser tests that put a real MessagePort
// under it - the Node suite in its own package covers semantics over a loopback, the
// tests here cover the platform. Imported by path so the bundle never depends on
// workspace symlinks.
import ChannelPlugin, * as docstackChannel from '../../pouchdb-adapter-channel/lib/index.js';

globalThis.docstackChannel = { ...docstackChannel, ChannelPlugin };
