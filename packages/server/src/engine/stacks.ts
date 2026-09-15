import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { ClientStack } from "@docstack/client";
import type { AccessScopeModel } from "@docstack/shared";
import type { ServerConfig } from "../config/schema.js";
import { STACK_NAME } from "../config/schema.js";
import type { Authority } from "../auth/authority.js";
import type { HostLogger } from "./logging.js";
import type { HostStackConfig } from "../types.js";
import { preparePouchDB } from "./pouchdb.js";

/** The stack's `~AccessScope` documents as last read, with a generation that changes when any of them does. */
export interface ScopeRegistry {
    /** The highest active version of every scope, one per `scopeId`. */
    current: AccessScopeModel[];
    /** Every active scope document, older versions included. */
    all: AccessScopeModel[];
    /** A digest of ids and revisions; entitlement caches key on it. */
    generation: string;
}

/**
 * One stack on the host: the engine's `ClientStack`, its scope registry, and whether
 * the node can open sealed content on it at all (spec 03 §4, §7).
 */
export class HostStack {
    private scopeCache: { at: number; registry: ScopeRegistry } | null = null;
    private omniGeneration = "";
    private omniPending: Promise<void> | null = null;

    constructor(
        readonly name: string,
        readonly stack: ClientStack,
        /** No document key and no authority: sealed content stays sealed to every session. */
        readonly blind: boolean,
        private readonly authority: Authority | null,
        private readonly logger: HostLogger,
        private readonly scopeTtlMs: number,
    ) {}

    /**
     * The scope registry, re-read after `scopeTtlMs`. Reading also keeps the node's own
     * omni key current: a scope minted or rotated since the last read is unlocked for
     * the stack before any session asks about it.
     */
    async scopes(force = false): Promise<ScopeRegistry> {
        const now = Date.now();
        if (!force && this.scopeCache && now - this.scopeCache.at < this.scopeTtlMs) return this.scopeCache.registry;
        const found = await this.stack.findDocuments<AccessScopeModel>({ "~class": { $eq: "~AccessScope" } });
        const all = found.docs.filter((doc) => typeof doc.scopeId === "string" && typeof doc.abeWrappedCek === "string");
        const byId = new Map<string, AccessScopeModel>();
        for (const doc of all) {
            const held = byId.get(doc.scopeId);
            if (!held || (doc.version ?? 0) > (held.version ?? 0)) byId.set(doc.scopeId, doc);
        }
        const generation = createHash("sha1")
            .update(all.map((doc) => `${doc._id}@${doc._rev ?? ""}`).sort().join("|"))
            .digest("hex");
        const registry: ScopeRegistry = { current: [...byId.values()], all, generation };
        this.scopeCache = { at: now, registry };
        await this.ensureOmni(registry);
        return registry;
    }

    /** Opens every scope for the node itself with an authority-minted omni key, once per registry generation. */
    private async ensureOmni(registry: ScopeRegistry): Promise<void> {
        if (!this.authority || this.blind || registry.generation === this.omniGeneration) return;
        if (!this.omniPending) {
            this.omniPending = (async () => {
                const key = this.authority!.omniKey(registry.all);
                if (key) {
                    const result = await this.stack.unlockScopes(await key);
                    this.logger.info("omni key applied", { stack: this.name, unlocked: result.unlocked, locked: result.locked });
                }
                this.omniGeneration = registry.generation;
            })().finally(() => { this.omniPending = null; });
        }
        await this.omniPending;
    }

    /** Forces the next `scopes()` to re-read: call after minting or rotating a scope. */
    invalidateScopes(): void {
        this.scopeCache = null;
    }

    status() {
        return {
            name: this.name,
            schemaVersion: this.stack.schemaVersion ?? null,
            consumerSchemaVersion: this.stack.getConsumerSchemaVersion?.() ?? null,
            blind: this.blind,
            locked: this.stack.isLocked(),
        };
    }

    close(): void {
        this.stack.close();
    }
}

/**
 * Every stack the node serves (spec 03 §7): the configured ones opened at boot, the
 * template instances opened on first reach, all through the engine unchanged.
 */
export class StackRegistry {
    private readonly opening = new Map<string, Promise<HostStack>>();
    private readonly open = new Map<string, HostStack>();
    private readonly templates: Array<{ test: RegExp; config: HostStackConfig }>;
    private ready = false;

    constructor(
        private readonly config: ServerConfig,
        private readonly authority: Authority | null,
        private readonly logger: HostLogger,
        private readonly scopeTtlMs = 5000,
    ) {
        this.templates = Object.entries(config.stackTemplates).map(([pattern, templateConfig]) => ({
            test: new RegExp(`^${pattern.split("*").map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`),
            config: templateConfig,
        }));
    }

    /** Whether every configured stack has opened. `/health` answers 503 until then. */
    get isReady(): boolean {
        return this.ready;
    }

    /** The configuration a stack name resolves to: an exact entry, else the first matching template, else `null`. */
    configFor(name: string): HostStackConfig | null {
        if (Object.prototype.hasOwnProperty.call(this.config.stacks, name)) return this.config.stacks[name];
        const template = this.templates.find((entry) => entry.test.test(name));
        return template ? template.config : null;
    }

    /** Opens every configured stack and every warm template instance. */
    async openAll(): Promise<void> {
        preparePouchDB();
        if (this.config.storage.adapter === "leveldb") await mkdir(resolve(this.config.storage.dir), { recursive: true });
        const names = [...Object.keys(this.config.stacks), ...this.config.warm];
        await Promise.all(names.map((name) => this.resolve(name)));
        this.ready = true;
    }

    /** An open stack by name, or `null` when the name resolves to no configuration. Opens on demand. */
    async resolve(name: string): Promise<HostStack | null> {
        if (!STACK_NAME.test(name)) return null;
        const held = this.open.get(name);
        if (held) return held;
        const stackConfig = this.configFor(name);
        if (!stackConfig) return null;
        let pending = this.opening.get(name);
        if (!pending) {
            pending = this.openStack(name, stackConfig).finally(() => this.opening.delete(name));
            this.opening.set(name, pending);
        }
        return pending;
    }

    /** An already-open stack, or `undefined`. */
    get(name: string): HostStack | undefined {
        return this.open.get(name);
    }

    names(): string[] {
        return [...this.open.keys()];
    }

    private async openStack(name: string, stackConfig: HostStackConfig): Promise<HostStack> {
        const { jobs: _jobs, documentKey: ownKey, ...options } = stackConfig;
        const documentKey = ownKey ?? (await this.config.keys.load?.(name)) ?? this.config.keys.documentKey;
        const storage = this.config.storage.adapter === "memory"
            ? { adapter: "memory" }
            : { prefix: `${resolve(this.config.storage.dir)}/` };
        const started = Date.now();
        const stack = await ClientStack.create(`db-${name}`, {
            ...options,
            ...storage,
            name,
            logLevel: options.logLevel ?? this.config.engineLogLevel,
            ...(documentKey ? { documentKey } : {}),
        } as any);
        const host = new HostStack(name, stack, !documentKey && !this.authority, this.authority, this.logger, this.scopeTtlMs);
        this.open.set(name, host);
        await host.scopes(true);
        this.logger.info("stack open", { stack: name, ms: Date.now() - started, blind: host.blind, schemaVersion: stack.schemaVersion });
        return host;
    }

    status() {
        return Object.fromEntries([...this.open.values()].map((host) => [host.name, host.status()]));
    }

    async close(): Promise<void> {
        await Promise.all([...this.opening.values()].map((pending) => pending.catch(() => undefined)));
        for (const host of this.open.values()) host.close();
        this.open.clear();
        this.ready = false;
    }
}
