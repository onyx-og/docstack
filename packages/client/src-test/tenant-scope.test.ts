import { test as it, expect } from './fixtures';

const describe = it.describe;

/**
 * Cover for ADR-0030 items 1 and 2.
 *
 * A tenant is a stack. `Class.tenants` declares which tenant spaces a class belongs to;
 * `deriveTenantScope` compiles a channel's entitlement into which stacks are served at
 * all - withheld structurally, not filtered - and which classes travel over a stack
 * holding a mix of declarations. A class with no declaration is tenant-neutral and
 * follows its stack, which is what keeps an undeclared datamodel at today's behavior.
 */
describe("tenant scope", () => {
    it("ADR-0030: a tenants declaration survives the authoring path and the projection", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "tenant-declare",
            username: "tenant-user",
            password: "tenant-pass",
            evaluate: async ({ stack }) => {
                const { Class } = (window as any).docstack;

                await Class.create(stack, "Tab", "class", "Workspace tabs", {});
                const model = await stack.getClassModel("Tab");
                // The same pattern a consumer uses for `ephemeral`/`simple`: the class
                // schema gained the attribute in sys_016, so the write validates.
                await stack.db.put({ ...model, tenants: ["workspace"] } as any);

                const { list } = await stack.getClassModels();
                const projected = list.find((m: any) => m.name === "Tab");
                const neutral = list.find((m: any) => m.name === "~Log");

                return {
                    // The projection trap named in ADR-0030 §7: a fixed field list that
                    // does not carry `tenants` strips it, and every class reads neutral.
                    projectedTenants: (projected as any)?.tenants ?? null,
                    neutralTenants: (neutral as any)?.tenants ?? null,
                };
            },
        });

        expect(result.projectedTenants).toEqual(["workspace"]);
        // Undeclared stays undeclared - not defaulted to anything.
        expect(result.neutralTenants).toBeNull();
    });

    it("ADR-0030: an entitlement compiles to served stacks plus class rules", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "workspace",
            username: "tenant-user2",
            password: "tenant-pass2",
            evaluate: async ({ docStack, stack }) => {
                const { Class, deriveTenantScope, createClassFilter } = (window as any).docstack;

                // The hub picture in miniature. Stack "workspace" is the shared tenant:
                // it holds a class declared for itself, a tenant-neutral class, and one
                // class declared for the "note" tenant (the mixed-stack case).
                await Class.create(stack, "Tab", "class", "Tabs", {});
                await stack.db.put({ ...(await stack.getClassModel("Tab")), tenants: ["workspace"] } as any);
                await Class.create(stack, "Recent", "class", "Recents", {});
                await Class.create(stack, "NoteMeta", "class", "Note-only metadata", {});
                await stack.db.put({ ...(await stack.getClassModel("NoteMeta")), tenants: ["note"] } as any);

                // Stack "sheet" is another tenant entirely.
                const sheet = await docStack.addStack({ name: "sheet" });
                await Class.create(sheet, "Cell", "class", "Cells", {});
                await sheet.db.put({ ...(await sheet.getClassModel("Cell")), tenants: ["sheet"] } as any);

                const scope = await deriveTenantScope([stack, sheet], ["workspace"]);

                // The mixed-stack rule, applied: does the compiled filter actually hold
                // NoteMeta documents back while letting the rest through?
                const rules = scope.classes["workspace"];
                const filter = rules ? createClassFilter(rules) : null;

                return {
                    stacks: scope.stacks,
                    workspaceRules: rules ?? null,
                    sheetReached: scope.stacks.includes("sheet"),
                    tabTravels: filter ? filter({ _id: "Tab-1", "~class": "Tab", active: true }) : null,
                    recentTravels: filter ? filter({ _id: "Recent-1", "~class": "Recent", active: true }) : null,
                    noteMetaHeld: filter ? filter({ _id: "NoteMeta-1", "~class": "NoteMeta", active: true }) : null,
                };
            },
        });

        // The entitled tenant's stack is served; the foreign tenant's stack is not in
        // the scope at all - unreachable, not filtered.
        expect(result.stacks).toEqual(["workspace"]);
        expect(result.sheetReached).toBe(false);

        // Within the shared stack: declared-for-me and neutral travel, declared-for-
        // someone-else is excluded.
        expect(result.workspaceRules).toEqual({ exclude: ["NoteMeta"] });
        expect(result.tabTravels).toBe(true);
        expect(result.recentTravels).toBe(true);
        expect(result.noteMetaHeld).toBe(false);
    });

    it("ADR-0030: a stack serving another tenant's classes is included, narrowed to them", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "host-mixed",
            username: "tenant-user3",
            password: "tenant-pass3",
            evaluate: async ({ stack }) => {
                const { Class, deriveTenantScope, createClassFilter } = (window as any).docstack;

                // A stack that is not itself the entitled tenant, but holds one class
                // declared for it: served with an include, so nothing else travels.
                await Class.create(stack, "NoteDoc", "class", "Notes", {});
                await stack.db.put({ ...(await stack.getClassModel("NoteDoc")), tenants: ["note"] } as any);
                await Class.create(stack, "Private", "class", "Not note's", {});

                const scope = await deriveTenantScope([stack], ["note"]);
                const rules = scope.classes["host-mixed"];
                const filter = rules ? createClassFilter(rules) : null;

                return {
                    stacks: scope.stacks,
                    rules: rules ?? null,
                    noteTravels: filter ? filter({ _id: "NoteDoc-1", "~class": "NoteDoc", active: true }) : null,
                    privateHeld: filter ? filter({ _id: "Private-1", "~class": "Private", active: true }) : null,
                    // The include keeps the data model, so the replica stays readable.
                    classModelTravels: filter ? filter({ _id: "NoteDoc", "~class": "class", name: "NoteDoc" }) : null,
                };
            },
        });

        expect(result.stacks).toEqual(["host-mixed"]);
        expect(result.rules).toEqual({ include: ["NoteDoc"] });
        expect(result.noteTravels).toBe(true);
        expect(result.privateHeld).toBe(false);
        expect(result.classModelTravels).toBe(true);
    });

    it("ADR-0030: docstack.sync({tenants}) starts replication only for served stacks", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "workspace2",
            username: "tenant-user4",
            password: "tenant-pass4",
            evaluate: async ({ docStack, stack }) => {
                const { Class } = (window as any).docstack;

                await Class.create(stack, "Tab2", "class", "Tabs", {});
                await stack.db.put({ ...(await stack.getClassModel("Tab2")), tenants: ["workspace2"] } as any);
                const sheet = await docStack.addStack({ name: "sheet2" });
                await Class.create(sheet, "Cell2", "class", "Cells", {});
                await sheet.db.put({ ...(await sheet.getClassModel("Cell2")), tenants: ["sheet2"] } as any);

                // A throwaway local database per stack stands in for the channel.
                const PouchCtor = (stack.db as any).constructor;
                const handle = await docStack.sync({
                    tenants: ["workspace2"],
                    remote: (s: any) => new PouchCtor(`tenant-remote-${s.name}`),
                    live: false,
                });

                let combinationError: string | null = null;
                try {
                    await docStack.sync({
                        tenants: ["workspace2"],
                        classes: { include: ["Tab2"] },
                        remote: (s: any) => new PouchCtor(`tenant-remote2-${s.name}`),
                        live: false,
                    });
                } catch (error: any) {
                    combinationError = String(error?.message || error);
                }

                const served = [...handle.handles.keys()].sort();
                handle.cancel();

                return { served, combinationError };
            },
        });

        // The structural grant at the lifecycle level: no handle exists for the
        // unentitled stack, so its namespace is unreachable rather than filtered.
        expect(result.served).toEqual(["workspace2"]);
        expect(result.combinationError).toContain("`tenants` and `classes`");
    });
});
