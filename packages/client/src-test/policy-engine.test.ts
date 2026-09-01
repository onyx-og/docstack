import { test as it, expect } from './fixtures';

const describe = it.describe;

/**
 * Policy enforcement against a live stack - ported from the three jest suites
 * `policy-engine.test.ts`, `user-policy.integration.test.ts` and
 * `group-policy.integration.test.ts`, which booted stacks under Node.
 *
 * Each test seeds extra users the way the fixture itself does: authenticate as the
 * system user, write the `~User` documents, then authenticate as whoever the scenario
 * needs - so what is under test is the real policy engine on real sessions, not forged
 * proofs.
 */
describe("policy engine", () => {
    it("filters reads and denies writes based on policy rules", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "policy-owner",
            username: "polly",
            password: "polly-pass",
            evaluate: async ({ stack }) => {
                const { Class } = (window as any).docstack;

                // The fixture leaves us authenticated as polly (Group-Tester). Build the
                // class and the policy with system privileges, and seed a second user.
                await stack.authenticate({ username: "system", password: "system" });

                const noteClass = await Class.create(stack, "Note", "class", "Note class", {
                    title: { name: "title", type: "string", config: { mandatory: true } },
                    owner: { name: "owner", type: "string", config: { mandatory: true } },
                });
                // `active: true` is required by design: a policy enforces only while
                // active, exactly as documents are visible only while active. The pin
                // for that contract is the last test in this file.
                await stack.db.bulkDocs([{
                    _id: "Policy-Note-owner",
                    "~class": "~Policy",
                    active: true,
                    groupId: "Group-Tester",
                    rule: "if (document.owner !== session.username) return false; return true;",
                    description: "Only allow owners to access notes",
                    targetClass: [noteClass.getModel()._id],
                }]);

                const userClassModel = await stack.getClassModel("~User");
                await stack.createDoc("user-bobby", "~User", userClassModel?.schema || {}, {
                    _id: "user-bobby", "~class": "~User", username: "bobby", password: "bobby-pass",
                    groupId: ["Group-Tester"], authMethod: "AuthMod-Classic",
                } as any);

                // The owner writes and reads their own note.
                stack.clearAuthSession();
                await stack.authenticate({ username: "polly", password: "polly-pass" });
                await stack.createDoc(null, noteClass.name, noteClass, { title: "visible", owner: "polly" });
                const ownerDocs = await stack.findDocuments({ "~class": { $eq: noteClass.name } });

                // Another user can neither write a note they do not own, nor read the
                // owner's.
                stack.clearAuthSession();
                await stack.authenticate({ username: "bobby", password: "bobby-pass" });
                let writeRefused = false;
                await stack.createDoc(null, noteClass.name, noteClass, { title: "blocked", owner: "polly" })
                    .catch(() => { writeRefused = true; });
                const otherDocs = await stack.findDocuments({ "~class": { $eq: noteClass.name } });

                return {
                    ownerCount: ownerDocs.docs.length,
                    writeRefused,
                    otherCount: otherDocs.docs.length,
                };
            },
        });

        expect(result.ownerCount).toBe(1);
        expect(result.writeRefused).toBe(true);
        expect(result.otherCount).toBe(0);
    });

    it("~User self-access: a session only sees its own user document", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "policy-self",
            username: "selfa",
            password: "selfa-pass",
            evaluate: async ({ stack }) => {
                await stack.authenticate({ username: "system", password: "system" });
                const userClassModel = await stack.getClassModel("~User");
                await stack.createDoc("user-selfb", "~User", userClassModel?.schema || {}, {
                    _id: "user-selfb", "~class": "~User", username: "selfb", password: "selfb-pass",
                    groupId: ["Group-Tester"], authMethod: "AuthMod-Classic",
                } as any);

                stack.clearAuthSession();
                await stack.authenticate({ username: "selfa", password: "selfa-pass" });
                const visible = await stack.findDocuments({ "~class": { $eq: "~User" } });

                return { usernames: visible.docs.map((doc: any) => doc.username) };
            },
        });

        // Not the system user, not selfb - the self-access policy admits exactly one.
        expect(result.usernames).toEqual(["selfa"]);
    });

    it("groups: the default group is assigned, and multi-group sessions carry every grant", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "policy-groups",
            username: "groupa",
            password: "groupa-pass",
            evaluate: async ({ stack }) => {
                const { Class } = (window as any).docstack;
                await stack.authenticate({ username: "system", password: "system" });

                const userClassModel = await stack.getClassModel("~User");
                const userSchema = userClassModel?.schema || {};
                const seedUser = (username: string, groupId?: string[]) =>
                    stack.createDoc(`user-${username}`, "~User", userSchema, {
                        _id: `user-${username}`, "~class": "~User", username, password: `${username}-pass`,
                        ...(groupId ? { groupId } : {}), authMethod: "AuthMod-Classic",
                    } as any);

                // A user created without groups lands in the default one.
                await seedUser("no-group");
                const stored = await stack.findDocument({
                    "~class": { $eq: "~User" }, username: { $eq: "no-group" },
                });

                // A class whose only policy grants a group the fixture user is not in.
                const groupClassModel = await stack.getClassModel("~Group");
                await stack.createDoc("Group-Extra", "~Group", groupClassModel?.schema || {}, {
                    _id: "Group-Extra", "~class": "~Group", name: "Extra",
                } as any).catch(() => undefined);
                const resourceClass = await Class.create(stack, "Resource", "class", "Resource", {
                    name: { name: "name", type: "string", config: { mandatory: true } },
                });
                await stack.db.bulkDocs([{
                    _id: "Policy-Resource-Extra",
                    "~class": "~Policy",
                    active: true,
                    groupId: "Group-Extra",
                    rule: "return true;",
                    targetClass: [resourceClass.getModel()._id],
                }]);
                await seedUser("tester-only", ["Group-Tester"]);
                await seedUser("multi", ["Group-Tester", "Group-Extra"]);

                stack.clearAuthSession();
                await stack.authenticate({ username: "tester-only", password: "tester-only-pass" });
                let denied = false;
                await stack.createDoc(null, resourceClass.name, resourceClass, { name: "denied" })
                    .catch(() => { denied = true; });

                stack.clearAuthSession();
                await stack.authenticate({ username: "multi", password: "multi-pass" });
                let allowed = true;
                await stack.createDoc(null, resourceClass.name, resourceClass, { name: "allowed" })
                    .catch(() => { allowed = false; });
                const sessionDoc = await stack.findDocument({
                    "~class": { $eq: "~UserSession" }, username: { $eq: "multi" },
                });

                return {
                    defaultGroup: (stored as any)?.groupId ?? null,
                    denied,
                    allowed,
                    sessionGroups: (sessionDoc as any)?.groupId ?? [],
                };
            },
        });

        expect(result.defaultGroup).toEqual(["Group-Default"]);
        expect(result.denied).toBe(true);
        expect(result.allowed).toBe(true);
        expect(result.sessionGroups).toEqual(expect.arrayContaining(["Group-Tester", "Group-Extra"]));
    });

    it("a policy enforces only while active - unflagged and inactive ones do not apply", async ({ useDocStack }) => {
        // The contract, pinned deliberately (ADR-0032): `active: true` is what arms a
        // policy, the same way it is what makes any document visible. A policy written
        // without the flag - or with `active: false` - does not apply, so the class
        // falls back to whatever its other policies say.
        const result = await useDocStack({
            name: "policy-active-flag",
            username: "flaguser",
            password: "flag-pass",
            evaluate: async ({ stack }) => {
                const { Class } = (window as any).docstack;
                await stack.authenticate({ username: "system", password: "system" });

                const itemClass = await Class.create(stack, "FlagItem", "class", "Flag test", {
                    name: { name: "name", type: "string", config: { mandatory: true } },
                });
                // Two dormant deny-alls: one unflagged, one explicitly inactive. If
                // either applied, every write below would be refused.
                await stack.db.bulkDocs([
                    {
                        _id: "Policy-FlagItem-unflagged", "~class": "~Policy",
                        groupId: "Group-Tester", rule: "return false;",
                        targetClass: [itemClass.getModel()._id],
                    },
                    {
                        _id: "Policy-FlagItem-inactive", "~class": "~Policy", active: false,
                        groupId: "Group-Tester", rule: "return false;",
                        targetClass: [itemClass.getModel()._id],
                    },
                ]);

                stack.clearAuthSession();
                await stack.authenticate({ username: "flaguser", password: "flag-pass" });
                let dormantAllowed = true;
                await stack.createDoc(null, itemClass.name, itemClass, { name: "written" })
                    .catch(() => { dormantAllowed = false; });

                // Arming the same rule flips the outcome.
                stack.clearAuthSession();
                await stack.authenticate({ username: "system", password: "system" });
                const dormant = await stack.db.get("Policy-FlagItem-unflagged");
                await stack.db.put({ ...(dormant as any), active: true });

                stack.clearAuthSession();
                await stack.authenticate({ username: "flaguser", password: "flag-pass" });
                let armedRefused = false;
                await stack.createDoc(null, itemClass.name, itemClass, { name: "refused" })
                    .catch(() => { armedRefused = true; });

                return { dormantAllowed, armedRefused };
            },
        });

        expect(result.dormantAllowed).toBe(true);
        expect(result.armedRefused).toBe(true);
    });
});
