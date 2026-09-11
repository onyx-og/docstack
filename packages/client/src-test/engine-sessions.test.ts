import { test as it, expect } from './fixtures';

const describe = it.describe;

/**
 * Engine sessions - ADR-0046.
 *
 * The engine is single-user by construction: one keyring, one auth session. A host
 * serving many principals from one stack needs the engine's own notion of "this
 * request is Alice's": `stack.forSession(session)` returns a view that opens only the
 * scopes the session is entitled to (whatever the stack's keyring holds), refuses
 * writes into any other scope, attributes writes to the principal, and hands the
 * session to triggers and jobs as their fourth argument. Whole-stack members throw
 * through a view. The authority half (setup/keygen) runs in the test only.
 */
describe("engine sessions", () => {
    it("narrows reads, refuses foreign-scope writes, attributes writes, and reaches triggers, jobs and the feed", async ({ docStackPage }) => {
        const result = await docStackPage.evaluate(async () => {
            const { ClientStack, Class } = (window as any).docstack;
            const abe = (window as any).docstackAbe;
            const name = `sessions-${Date.now()}`;
            const conn = `db-${name}`;
            const KEY = "0".repeat(64);
            const credentials = { username: "system", password: "system" };
            const sha256 = async (text: string) => {
                const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
                return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("");
            };
            const errorOf = async (fn: () => Promise<unknown>) => {
                try { await fn(); return null; } catch (e: any) { return { name: e?.name, scopeId: e?.scopeId ?? null, member: e?.member ?? null }; }
            };

            // AUTHORITY: two scopes, and a key that opens both - the host's "omni" key.
            const { pk, msk } = await abe.setup();
            const hrScope = await ClientStack.buildAccessScope({ scopeId: "hr", policyString: '"role:hr"', pk });
            const finScope = await ClientStack.buildAccessScope({ scopeId: "fin", policyString: '"role:fin"', pk });
            const omniKey = await abe.keygen(msk, ["role:hr", "role:fin"]);

            // The host stack holds every key.
            const stack = await ClientStack.create(conn, {
                name, documentKey: KEY, credentials, accessKeys: { attributeKey: omniKey },
            });
            await stack.db.bulkDocs([hrScope, finScope]);
            await stack.unlockScopes(omniKey);

            const salary = await Class.create(stack, "Salary", "class", "Salaries", {
                who: { name: "who", type: "string", config: { mandatory: true, primaryKey: true } },
                amount: { name: "amount", type: "string", config: { mandatory: true, encrypted: true } },
            });
            await salary.addTrigger("stamp-by", {
                name: "stamp-by", order: "before",
                run: "document.stampedBy = session ? session.principal.sub : 'nobody'; return document;",
            });
            const secret = await Class.create(stack, "Secret", "class", "Unlabelled encrypted content", {
                title: { name: "title", type: "string", config: { mandatory: true } },
                note: { name: "note", type: "string", config: { mandatory: true, encrypted: true } },
            });

            // Writes with no session: nobody is attributed.
            const alice = await salary.addCard({ who: "alice", amount: "100000", "~scope": "hr" });
            const bob = await salary.addCard({ who: "bob", amount: "200000", "~scope": "fin" });
            await secret.addCard({ title: "plain title", note: "sealed note" });

            // Carol may open hr and the document key, not fin.
            const view = stack.forSession({
                id: "req-1", principal: { sub: "carol", attributes: ["role:hr"] }, scopes: ["hr"], documentKey: true,
            });
            // Eve may open nothing sealed at all.
            const blind = stack.forSession({
                id: "req-2", principal: { sub: "eve", attributes: [] }, scopes: [], documentKey: false,
            });

            const byWho = (docs: any[]) => Object.fromEntries(docs.map((d: any) => [d.who, d]));

            // --- reads ---
            const stackRows = byWho((await stack.findDocuments({ "~class": { $eq: "Salary" } })).docs);
            const viewRows = byWho((await view.findDocuments({ "~class": { $eq: "Salary" } })).docs);
            const viewQuery = (await view.query("SELECT who, amount FROM Salary ORDER BY who")).rows;
            const viewWhereSealed = (await view.query("SELECT who FROM Salary WHERE amount = ?", "200000")).rows;
            const stackWhereSealed = (await stack.query("SELECT who FROM Salary WHERE amount = ?", "200000")).rows;
            const viewGet = await view.getDocument(bob._id);
            const viewDbGet = await view.db.get(bob._id);
            const stackDbGet = await stack.db.get(bob._id);
            const blindSecret = (await blind.findDocuments({ "~class": { $eq: "Secret" } })).docs[0];
            const viewSecret = (await view.findDocuments({ "~class": { $eq: "Secret" } })).docs[0];
            const streamed: any[] = [];
            for await (const row of view.queryStream("SELECT who, amount FROM Salary")) streamed.push(row);

            // --- writes ---
            const foreignScopeWrite = await errorOf(() => view.createDoc(null, "Salary", salary, { who: "dave", amount: "1", "~scope": "fin" }));
            const erin = await view.createDoc(null, "Salary", salary, { who: "erin", amount: "2", "~scope": "hr" });
            const erinStored = (await stack.findDocuments({ "~class": { $eq: "Salary" }, who: { $eq: "erin" } })).docs[0];
            const dan = stack.forSession({ id: "req-3", principal: { sub: "dan" }, scopes: ["hr"], documentKey: true });
            await dan.createDoc(erin._id, "Salary", salary, { ...erinStored, amount: "3" });
            const erinUpdated = (await stack.findDocuments({ "~class": { $eq: "Salary" }, who: { $eq: "erin" } })).docs[0];
            const blindDocKeyWrite = await errorOf(() => blind.createDoc(null, "Secret", secret, { title: "t", note: "n" }));
            const foreignScopeDelete = await errorOf(() => view.deleteDocument(bob._id));
            const ownScopeDelete = await view.deleteDocument(alice._id);
            const aliceAfterDelete = await stack.db.get(alice._id) as any;

            // A Class built from the view routes through it.
            const viewSalary = await view.getClass("Salary");
            const classForeignWrite = await errorOf(() => viewSalary.addCard({ who: "frank", amount: "3", "~scope": "fin" }));
            const classCards = byWho(await viewSalary.getCards());
            const isStackClass = viewSalary === (await stack.getClass("Salary"));

            // --- the feed ---
            const target = new EventTarget();
            const events: any[] = [];
            target.addEventListener("doc", (e: any) => events.push(e.detail.doc));
            const subscription = view.subscribeClassDocs("Salary", target);
            await salary.addCard({ who: "gina", amount: "4", "~scope": "fin" });
            await salary.addCard({ who: "hank", amount: "5", "~scope": "hr" });
            await new Promise(resolve => setTimeout(resolve, 800));
            view.releaseListener(subscription);
            const feed = byWho(events);

            // --- jobs ---
            const content = `async function execute(stack, params, job, session) {
                return { metadata: { by: session ? session.principal.sub : "nobody" } };
            }`;
            await stack.db.bulkDocs([{
                _id: "Job-WhoRanMe", "~class": "~Job", name: "Who ran me", type: "user", workerPlatform: "client",
                isEnabled: true, isSingleton: false, content, hash: await sha256(content),
            }]);
            const runWithSession = await stack.jobEngine.executeJob("Job-WhoRanMe", {}, "manual", view.session);
            const runWithout = await stack.jobEngine.executeJob("Job-WhoRanMe", {}, "manual");

            // --- whole-stack members are closed doors ---
            const closedUnlock = await errorOf(() => view.unlockScopes("x"));
            const closedDestroy = await errorOf(async () => view.db.destroy());
            const closedTransaction = await errorOf(async () => view.beginTransaction());
            let frozenScopes = false;
            try { (view.session.scopes as any).push("fin"); } catch { frozenScopes = true; }
            const viewIsStack = view instanceof ClientStack;

            stack.close();
            await stack.db.destroy();

            return {
                stackAlice: stackRows.alice?.amount, stackBob: stackRows.bob?.amount,
                viewAlice: viewRows.alice?.amount, viewBob: viewRows.bob?.amount, viewBobWho: viewRows.bob?.who,
                viewQuery, viewWhereSealed: viewWhereSealed.length, stackWhereSealed: stackWhereSealed.length,
                viewGetAmount: viewGet?.amount, viewDbGetAmount: (viewDbGet as any)?.amount, stackDbGetAmount: (stackDbGet as any)?.amount,
                blindSecretNote: blindSecret?.note, blindSecretTitle: blindSecret?.title, viewSecretNote: viewSecret?.note,
                streamed,
                foreignScopeWrite, blindDocKeyWrite, foreignScopeDelete, ownScopeDelete,
                aliceDeletedBy: aliceAfterDelete?.["~updatedBy"], aliceActive: aliceAfterDelete?.active,
                erinCreatedBy: erinStored?.["~createdBy"], erinUpdatedBy: erinStored?.["~updatedBy"], erinStampedBy: erinStored?.stampedBy,
                erinAfterCreatedBy: erinUpdated?.["~createdBy"], erinAfterUpdatedBy: erinUpdated?.["~updatedBy"], erinAfterAmount: erinUpdated?.amount,
                aliceStampedBy: stackRows.alice?.stampedBy, aliceCreatedBy: stackRows.alice?.["~createdBy"] ?? null,
                classForeignWrite, classErin: classCards.erin?.amount, classBob: classCards.bob?.amount, isStackClass,
                feedGina: feed.gina?.amount, feedHank: feed.hank?.amount, feedCount: events.length,
                jobWith: runWithSession.finalMetadata?.by, jobWithout: runWithout.finalMetadata?.by, jobStatus: runWithSession.status,
                closedUnlock, closedDestroy, closedTransaction, frozenScopes, viewIsStack,
            };
        });

        // The stack opens both scopes; the view opens only hr.
        expect(result.stackAlice).toBe("100000");
        expect(result.stackBob).toBe("200000");
        expect(result.viewAlice).toBe("100000");
        expect(result.viewBob).toBeNull();
        expect(result.viewBobWho).toBe("bob");
        expect(result.viewQuery).toEqual([{ who: "alice", amount: "100000" }, { who: "bob", amount: null }]);
        expect(result.streamed).toEqual(expect.arrayContaining([{ who: "alice", amount: "100000" }, { who: "bob", amount: null }]));
        // A predicate on a sealed attribute sees null, never plaintext.
        expect(result.viewWhereSealed).toBe(0);
        expect(result.stackWhereSealed).toBe(1);
        // Single-document reads, through the view and through its db handle.
        expect(result.viewGetAmount).toBeNull();
        expect(result.viewDbGetAmount).toBeNull();
        expect(result.stackDbGetAmount).toBe("200000");
        // Document-key content follows the documentKey grant.
        expect(result.blindSecretNote).toBeNull();
        expect(result.blindSecretTitle).toBe("plain title");
        expect(result.viewSecretNote).toBe("sealed note");

        // Writes into a scope the session does not open refuse, with the client's own error.
        expect(result.foreignScopeWrite).toEqual({ name: "StackLockedError", scopeId: "fin", member: null });
        expect(result.blindDocKeyWrite).toEqual({ name: "StackLockedError", scopeId: null, member: null });
        expect(result.foreignScopeDelete?.name).toBe("StackLockedError");
        expect(result.ownScopeDelete).toBe(true);
        expect(result.aliceActive).toBe(false);
        expect(result.aliceDeletedBy).toBe("carol");
        // Attribution lands inside the pipeline; the trigger saw the session.
        expect(result.erinCreatedBy).toBe("carol");
        expect(result.erinUpdatedBy).toBe("carol");
        expect(result.erinStampedBy).toBe("carol");
        expect(result.erinAfterCreatedBy).toBe("carol");
        expect(result.erinAfterUpdatedBy).toBe("dan");
        expect(result.erinAfterAmount).toBe("3");
        // No session, no attribution.
        expect(result.aliceStampedBy).toBe("nobody");
        expect(result.aliceCreatedBy).toBeNull();

        // A Class built from the view is bound to it.
        expect(result.isStackClass).toBe(false);
        expect(result.classForeignWrite?.name).toBe("StackLockedError");
        // (alice was soft-deleted above and drops out of `getCards`; erin is hr, updated to "3".)
        expect(result.classErin).toBe("3");
        expect(result.classBob).toBeNull();

        // The feed is narrowed like a read.
        expect(result.feedGina).toBeNull();
        expect(result.feedHank).toBe("5");

        // Jobs receive the session as their fourth argument.
        expect(result.jobStatus).toBe("SUCCESS");
        expect(result.jobWith).toBe("carol");
        expect(result.jobWithout).toBe("nobody");

        // Whole-stack members are closed through a view; the session is frozen; the view is a stack.
        expect(result.closedUnlock).toEqual({ name: "StackSessionError", scopeId: null, member: "unlockScopes" });
        expect(result.closedDestroy?.name).toBe("StackSessionError");
        expect(result.closedTransaction?.name).toBe("StackSessionError");
        expect(result.frozenScopes).toBe(true);
        expect(result.viewIsStack).toBe(true);
    });
});
