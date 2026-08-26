import { test as it, expect } from './fixtures';

const describe = it.describe;

/**
 * A `Domain` is supposed to emit `doc` when one of its relation documents changes, the
 * way a `Class` does for its documents.
 *
 * It did not. `Domain.get` subscribed through `subscribeClassDocs`, which matches on
 * `~class`, but a relation document carries `~domain` and no `~class` at all
 * (`RelationDocument` types it as `"~class"?: never`). So the filter could never match and
 * the event never fired.
 */
describe("domain change events", () => {
    it("emits doc when a relation is created", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "domain-events",
            username: "domain-user",
            password: "domain-pass",
            evaluate: async ({ stack }) => {
                const { Class, Domain } = (window as any).docstack;

                const personClass = await Class.create(stack, "DEPerson", "class", "People", {
                    name: { name: "name", type: "string", config: { mandatory: true, primaryKey: true } },
                });
                const projectClass = await Class.create(stack, "DEProject", "class", "Projects", {
                    title: { name: "title", type: "string", config: { mandatory: true, primaryKey: true } },
                });

                const person = await personClass.addCard({ name: "ada" });
                const project = await projectClass.addCard({ title: "engine" });

                const domain = await Domain.create(
                    stack, null, "DEWorksOn", "domain", "1:N",
                    personClass, projectClass, "Who works on what"
                );

                const event = new Promise<any>((resolve, reject) => {
                    const timeout = setTimeout(() => reject(new Error("Domain listener timeout")), 8000);
                    const handler = (e: Event) => {
                        clearTimeout(timeout);
                        domain.removeEventListener("doc", handler as EventListener);
                        resolve((e as CustomEvent).detail);
                    };
                    domain.addEventListener("doc", handler as EventListener);
                });

                // The public API: it derives sourceClass/targetClass from the domain's
                // Class instances, which carry the generated model ids the plugin
                // compares against - not the class names.
                const relation = await domain.addRelation(project, person._id);

                let detail: any = null;
                let timedOut = false;
                try {
                    detail = await event;
                } catch {
                    timedOut = true;
                }

                return {
                    relationWritten: relation?._id ?? null,
                    // A relation really does carry `~domain` and no `~class`.
                    relationMetaKey: relation ? Object.keys(relation).filter(k => k.startsWith("~")).sort() : [],
                    timedOut,
                    receivedId: detail?.doc?._id ?? null,
                    receivedDomain: detail?.doc?.["~domain"] ?? null,
                    hasSeq: detail?.seq !== undefined,
                };
            },
        });

        // Precondition: the relation was stored, keyed by `~domain`.
        expect(result.relationWritten).toBeTruthy();
        expect(result.relationMetaKey).toContain("~domain");
        expect(result.relationMetaKey).not.toContain("~class");

        // The finding in one line: this times out today.
        expect(result.timedOut).toBe(false);
        expect(result.receivedId).toBe(result.relationWritten);
        expect(result.receivedDomain).toBe("DEWorksOn");
        expect(result.hasSeq).toBe(true);
    });

    it("keeps class and domain documents in separate namespaces", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "domain-routing",
            username: "domain-user2",
            password: "domain-pass2",
            evaluate: async ({ stack }) => {
                const { Class, Domain } = (window as any).docstack;

                const leftClass = await Class.create(stack, "DRLeft", "class", "Left", {
                    name: { name: "name", type: "string", config: { mandatory: true, primaryKey: true } },
                });
                const rightClass = await Class.create(stack, "DRRight", "class", "Right", {
                    name: { name: "name", type: "string", config: { mandatory: true, primaryKey: true } },
                });
                const left = await leftClass.addCard({ name: "l" });
                const right = await rightClass.addCard({ name: "r" });

                const domain = await Domain.create(
                    stack, null, "DRLink", "domain", "1:N", leftClass, rightClass, "Links"
                );

                const seen: string[] = [];
                const record = (label: string) => (e: Event) =>
                    seen.push(`${label}:${(e as CustomEvent).detail.doc?._id}`);
                domain.addEventListener("doc", record("domain") as EventListener);
                leftClass.addEventListener("doc", record("left") as EventListener);
                rightClass.addEventListener("doc", record("right") as EventListener);

                const relation = await domain.addRelation(right, left._id);
                const card = await leftClass.addCard({ name: "l2" });

                await new Promise(resolve => setTimeout(resolve, 2000));

                return { seen: seen.sort(), relationId: relation?._id, cardId: card?._id };
            },
        });

        // Distinct ids, so neither assertion below can pass by collision - which is how
        // an earlier version of this test fooled itself.
        expect(result.relationId).not.toBe(result.cardId);

        // The relation reaches its domain and nothing else; the card reaches its class
        // and nothing else.
        expect(result.seen).toEqual([
            `domain:${result.relationId}`,
            `left:${result.cardId}`,
        ]);
    });
});
