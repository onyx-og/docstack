import { test as it, expect } from './fixtures';

const describe = it.describe;

describe("DocStack patches", () => {
    it("applies patches provided through stack configuration", async ({ docStackPage }) => {
        const result = await docStackPage.evaluate(async () => {
            const { DocStack } = (window as any).docstack;

            const stackName = `config-patch-${Date.now()}`;
            const patchDocId = `patched-doc-${Date.now()}`;
            const patchTargetClassId = "~PatchTarget";

            const customPatch = {
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

            await new Promise<void>((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error("DocStack initialization timeout")), 10000);
                docStack.addEventListener("ready", () => { clearTimeout(timeout); resolve(); });
            });

            const stack = docStack.getStack(stackName);
            if (!stack) throw new Error(`Failed to resolve stack '${stackName}'`);

            try {
                const patchedDoc = await stack.db.get<{ description: string; "~class": string }>(patchDocId);
                return {
                    description: patchedDoc.description,
                    classId: patchedDoc["~class"],
                    patchTargetClassId,
                };
            } finally {
                stack.close();
                await stack.db.destroy();
            }
        });

        expect(result.description).toBe("created from stack configuration patch");
        expect(result.classId).toBe(result.patchTargetClassId);
    });

    it("seeds the system user with the admin group through system patches", async ({ docStackPage }) => {
        const result = await docStackPage.evaluate(async () => {
            const { DocStack } = (window as any).docstack;

            const stackName = `system-user-${Date.now()}`;
            const docStack = new DocStack({ name: stackName });

            await new Promise<void>((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error("DocStack initialization timeout")), 10000);
                docStack.addEventListener("ready", () => { clearTimeout(timeout); resolve(); });
            });

            const stack = docStack.getStack(stackName);
            if (!stack) throw new Error(`Failed to resolve stack '${stackName}'`);

            try {
                const systemUser = await stack.db.get<{ "~class": string; groupId: string[] }>("system");
                return {
                    classId: systemUser["~class"],
                    isGroupIdArray: Array.isArray(systemUser.groupId),
                    hasAdminGroup: systemUser.groupId.includes("Group-Admin"),
                };
            } finally {
                stack.close();
                await stack.db.destroy();
            }
        });

        expect(result.classId).toBe("~User");
        expect(result.isGroupIdArray).toBe(true);
        expect(result.hasAdminGroup).toBe(true);
    });
});
