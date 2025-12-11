import { test as it, expect } from './fixtures';

const describe = it.describe;

describe("enum attribute validation", () => {
    it("validates enum fields using class schemas", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "enum-validate",
            evaluate: async ({ stack }) => {
                const { Class } = (window as any).docstack;

                const enumClass = await Class.create(stack, "EnumDoc", "class", "Enum doc", {
                    status: {
                        name: "status",
                        type: "enum",
                        config: { mandatory: true, values: [{ value: "OPEN" }, { value: "CLOSED" }] },
                    },
                });

                const validOpen = await enumClass.validate({ status: "OPEN" });
                const validClosed = await enumClass.validate({ status: "CLOSED" });
                const invalidStatus = await enumClass.validate({ status: "INVALID" });

                return { validOpen, validClosed, invalidStatus };
            },
        });

        expect(result.validOpen).toBe(true);
        expect(result.validClosed).toBe(true);
        expect(result.invalidStatus).toBe(false);
    });

    it("exposes enum-backed system schemas for jobs", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "enum-job",
            evaluate: async ({ stack }) => {
                const jobModel = await stack.getClassModel("~Job");
                const runModel = await stack.getClassModel("~JobRun");
                const policyModel = await stack.getClassModel("~Policy");
                const userModel = await stack.getClassModel("~User");

                return {
                    jobTypeType: jobModel?.schema?.type?.type,
                    jobWorkerPlatformType: jobModel?.schema?.workerPlatform?.type,
                    runStatusType: runModel?.schema?.status?.type,
                    runTriggerType: runModel?.schema?.triggerType?.type,
                    runJobIdType: runModel?.schema?.jobId?.type,
                    policyUserIdType: policyModel?.schema?.userId?.type,
                    policyGroupIdType: policyModel?.schema?.groupId?.type,
                    userGroupIdType: userModel?.schema?.groupId?.type,
                    userAuthMethodType: userModel?.schema?.authMethod?.type,
                };
            },
        });

        expect(result.jobTypeType).toBe("enum");
        expect(result.jobWorkerPlatformType).toBe("enum");
        expect(result.runStatusType).toBe("enum");
        expect(result.runTriggerType).toBe("enum");
        expect(result.runJobIdType).toBe("foreign_key");
        expect(result.policyUserIdType).toBe("foreign_key");
        expect(result.policyGroupIdType).toBe("foreign_key");
        expect(result.userGroupIdType).toBe("foreign_key");
        expect(result.userAuthMethodType).toBe("foreign_key");
    });
});
