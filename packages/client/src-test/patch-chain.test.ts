import { test as it, expect } from './fixtures';

const describe = it.describe;

/**
 * The patch chain protocol - ADR-0042.
 *
 * A class-model patch chain stages through one internal transaction: patch N+1
 * hydrates against the classes patch N staged, propagation is validated dry with
 * nothing kept, and a single commit lands every class doc as one batch through the
 * unchanged pipeline. The ledger (ADR-0041) arms only after that commit.
 */
describe("patch chain", () => {
    it("a chain composes through the overlay and lands in one commit", async ({ docStackPage }) => {
        const result = await docStackPage.evaluate(async () => {
            const { DocStack } = (window as any).docstack;
            const stackName = `chain-compose-${Date.now()}`;
            const patches = [
                {
                    "~class": "patch", version: "1.0.0", target: "app", changelog: "class arrives",
                    docs: [{
                        _id: "ChainTask", "~class": "class", active: true, name: "ChainTask", description: "tasks",
                        schema: {
                            title: { name: "title", type: "string", config: { mandatory: true, primaryKey: true } },
                            note: { name: "note", type: "string", config: {} },
                        },
                    }],
                },
                {
                    "~class": "patch", version: "1.1.0", target: "app", changelog: "extra arrives",
                    docs: [{
                        _id: "ChainTask", "~class": "class", _rev: "auto",
                        schema: { extra: { name: "extra", type: "string", config: {} } },
                    }],
                },
            ];

            const docStack = new DocStack({ name: stackName, patches });
            await new Promise<void>((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error("DocStack initialization timeout")), 10000);
                docStack.addEventListener("ready", () => { clearTimeout(timeout); resolve(); });
            });
            const stack = docStack.getStack(stackName)!;

            const classDoc: any = await stack.db.get("ChainTask");
            const ledger = (await (stack as any).db.find({
                selector: { "~class": "patch", target: "app" }, limit: 100,
            })).docs;

            stack.close();
            await stack.db.destroy();
            return {
                attributes: Object.keys(classDoc.schema ?? {}).sort(),
                // The chain's signature: two patches, ONE write - the merge composed
                // in the overlay, so the class doc's first stored revision carries
                // the full chain.
                revGeneration: String(classDoc._rev).split("-")[0],
                ledger: ledger.map((entry: any) => `${entry.version}:${entry.active}`).sort(),
            };
        });

        expect(result.attributes).toEqual(["extra", "note", "title"]);
        expect(result.revGeneration).toBe("1");
        // Both entries armed, only after the one commit.
        expect(result.ledger).toEqual(["1.0.0:true", "1.1.0:true"]);
    });

    it("a dry-run refusal names the patch, persists nothing, records nothing", async ({ docStackPage }) => {
        const result = await docStackPage.evaluate(async () => {
            const { ClientStack, Class } = (window as any).docstack;
            const name = `chain-refuse-${Date.now()}`;
            const conn = `db-${name}`;
            const KEY = "0".repeat(64);
            const credentials = { username: "system", password: "system" };

            // Committed world: a class and a document that lacks the optional `nick`.
            const first = await ClientStack.create(conn, { name, documentKey: KEY, credentials });
            const cls = await Class.create(first, "ChainTight", "class", "x", {
                title: { name: "title", type: "string", config: { mandatory: true, primaryKey: true } },
                nick: { name: "nick", type: "string", config: {} },
            });
            const card = await cls.addCard({ title: "one" });
            const classId = cls.getId();
            const cardRevBefore = (await first.db.get(card._id))._rev;
            first.close();

            // The chain carries a patch the committed data cannot satisfy.
            const tighten = {
                "~class": "patch", version: "7.0.0", target: "app", changelog: "tighten nick",
                docs: [{
                    _id: classId, "~class": "class", _rev: "auto",
                    schema: { nick: { name: "nick", type: "string", config: { mandatory: true } } },
                }],
            };
            let failure: string | null = null;
            try {
                await ClientStack.create(conn, { name, documentKey: KEY, patches: [tighten], credentials });
            } catch (error: any) {
                failure = error?.message ?? String(error);
            }

            // A clean reopen shows what the refusal left behind: everything.
            const third = await ClientStack.create(conn, { name, documentKey: KEY, credentials });
            const model: any = await third.db.get(classId);
            const cardAfter: any = await third.db.get(card._id);
            const ledger = (await (third as any).db.find({
                selector: { "~class": "patch", version: "7.0.0" }, limit: 10,
            })).docs;
            third.close();
            await third.db.destroy();

            return {
                failure,
                stillOptional: model.schema?.nick?.config?.mandatory !== true,
                cardUntouched: cardAfter._rev === cardRevBefore,
                recorded: ledger.length,
            };
        });

        // The fault taxonomy's staging/dry-run class: named patch, named class.
        expect(result.failure).toContain("7.0.0");
        expect(result.failure).toContain("ChainTight");
        // Zero persisted, nothing recorded - the chain retries on the next open.
        expect(result.stillOptional).toBe(true);
        expect(result.cardUntouched).toBe(true);
        expect(result.recorded).toBe(0);
    });
});
