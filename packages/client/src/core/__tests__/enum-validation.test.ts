import { Class } from "../index.js";
import { createTestDocStack } from "../test-utils/docstack";

jest.setTimeout(20000);

describe("enum attribute validation", () => {
    it("validates enum fields using class schemas", async () => {
        const { stack, cleanup } = await createTestDocStack("enum-validate");
        try {
            const enumClass = await Class.create(stack, "EnumDoc", "class", "Enum doc", {
                status: {
                    name: "status",
                    type: "enum",
                    config: { mandatory: true, values: [{ value: "OPEN" }, { value: "CLOSED" }] },
                },
            });

            expect(await enumClass.validate({ status: "OPEN" })).toBe(true);
            expect(await enumClass.validate({ status: "CLOSED" })).toBe(true);
            expect(await enumClass.validate({ status: "INVALID" })).toBe(false);
        } finally {
            await cleanup();
        }
    });

    it("exposes enum-backed system schemas for jobs", async () => {
        const { stack, cleanup } = await createTestDocStack("enum-job");
        try {
            const jobModel = await stack.getClassModel("~Job");
            const runModel = await stack.getClassModel("~JobRun");
            const policyModel = await stack.getClassModel("~Policy");
            const userModel = await stack.getClassModel("~User");

            expect(jobModel?.schema?.type?.type).toBe("enum");
            expect(jobModel?.schema?.workerPlatform?.type).toBe("enum");
            expect(runModel?.schema?.status?.type).toBe("enum");
            expect(runModel?.schema?.triggerType?.type).toBe("enum");
            expect(runModel?.schema?.jobId?.type).toBe("foreign_key");
            expect(policyModel?.schema?.userId?.type).toBe("foreign_key");
            expect(userModel?.schema?.authMethod?.type).toBe("foreign_key");
        } finally {
            await cleanup();
        }
    });
});
