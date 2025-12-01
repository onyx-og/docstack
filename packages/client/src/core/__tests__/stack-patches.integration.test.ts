import type { Patch } from "@docstack/shared";
import { DocStack } from "../index.js";
import { waitForDocStackReady } from "../test-utils/docstack";

describe("DocStack patches", () => {
    it("applies patches provided through stack configuration", async () => {
        const stackName = `config-patch-${Date.now()}`;
        const patchDocId = `patched-doc-${Date.now()}`;
        const patchTargetClassId = "~PatchTarget";

        const customPatch: Patch = {
            "~class": "patch",
            version: "9.9.9",
            changelog: "Custom patch for configuration-driven stacks",
            docs: [
                {
                    _id: patchTargetClassId,
                    "~class": "class",
                    active: true,
                    name: "PatchTarget",
                    description: "A minimal class to validate config patch inserts",
                    schema: {
                        description: {
                            name: "description",
                            type: "string",
                            config: { mandatory: true },
                        },
                    },
                },
                {
                    _id: patchDocId,
                    "~class": patchTargetClassId,
                    description: "created from stack configuration patch",
                },
            ],
        };

        const docStack = new DocStack({ name: stackName, patches: [customPatch] });
        await waitForDocStackReady(docStack);

        const stack = docStack.getStack(stackName);
        expect(stack).toBeDefined();

        try {
            const patchedDoc = await stack!.db.get<{ description: string; "~class": string }>(patchDocId);
            expect(patchedDoc.description).toBe("created from stack configuration patch");
            expect(patchedDoc["~class"]).toBe(patchTargetClassId);
        } finally {
            stack?.close();
            await stack?.db.destroy();
        }
    });

    it("seeds the system user with the admin group through system patches", async () => {
        const stackName = `system-user-${Date.now()}`;
        const docStack = new DocStack({ name: stackName });
        await waitForDocStackReady(docStack);

        const stack = docStack.getStack(stackName);
        expect(stack).toBeDefined();

        try {
            const systemUser = await stack!.db.get<{ "~class": string; groupId: string[] }>("system");
            expect(systemUser["~class"]).toBe("~User");
            expect(Array.isArray(systemUser.groupId)).toBe(true);
            expect(systemUser.groupId).toContain("Group-Admin");
        } finally {
            stack?.close();
            await stack?.db.destroy();
        }
    });
});
