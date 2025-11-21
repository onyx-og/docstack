import { Attribute, Class, DocStack } from "../..";
import type { Document } from "@docstack/shared";

jest.setTimeout(30000);

const waitForDocStackReady = (docStack: DocStack, timeout = 10000): Promise<void> => {
    return new Promise((resolve, reject) => {
        const onReady = (event: Event) => {
            clearTimeout(timer);
            docStack.removeEventListener("ready", onReady as EventListener);
            resolve();
        };

        const timer = setTimeout(() => {
            docStack.removeEventListener("ready", onReady as EventListener);
            reject(new Error("DocStack did not become ready within the expected time"));
        }, timeout);

        docStack.addEventListener("ready", onReady as EventListener);
    });
};

const createDocStack = async (name?: string) => {
    const stackName = name ?? `trigger-test-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const docStack = new DocStack({ name: stackName });
    await waitForDocStackReady(docStack);

    const stack = docStack.getStack(stackName);
    if (!stack) {
        throw new Error(`Failed to resolve stack '${stackName}'`);
    }

    if (typeof (stack.db as any).setMaxListeners === "function") {
        (stack.db as any).setMaxListeners(0);
    }

    const cleanup = async () => {
        const listeners = [...stack.listeners];
        for (const listener of listeners) {
            if (typeof listener.cancel === "function") {
                listener.cancel();
            }
        }
        stack.close();
        await stack.db.destroy();
    };

    return { docStack, stack, stackName, cleanup };
};

describe("Trigger integration", () => {
    it("runs before triggers when creating documents", async () => {
        const { stack, cleanup } = await createDocStack();
        try {
            const className = `BeforeTrigger-${Date.now()}`;
            const classObj = await Class.create(stack, className, "class", "before trigger test");

            await Attribute.create(classObj, "name", "string", "Name", { mandatory: true });
            await Attribute.create(classObj, "flag", "boolean", "Flag", {});

            await classObj.addTrigger("before:flag", {
                name: "beforeFlag",
                order: "before",
                run: `
                    document.flag = true;
                    document.originClass = classObj?.getName?.();
                    return document;
                `,
            });

            const createdDoc = await classObj.addCard({ name: "Triggered" });
            const storedDoc = (await stack.getDocument((createdDoc as Document)._id as string)) as Document | null;

            expect(storedDoc?.flag).toBe(true);
            expect(storedDoc?.originClass).toBe(className);
        } finally {
            await cleanup();
        }
    });

    it("runs after triggers and persists their changes", async () => {
        const { stack, cleanup } = await createDocStack();
        try {
            const className = `AfterTrigger-${Date.now()}`;
            const classObj = await Class.create(stack, className, "class", "after trigger test");

            await Attribute.create(classObj, "title", "string", "Title", { mandatory: true });
            await Attribute.create(classObj, "audit", "integer", "Audit", { mandatory: false });

            await classObj.addTrigger("after:audit", {
                name: "afterAudit",
                order: "after",
                run: `
                    const current = typeof document.audit === "number" ? document.audit : 0;
                    document.audit = current + 1;
                    document.afterRan = true;
                    return document;
                `,
            });

            const createdDoc = await classObj.addCard({ title: "After trigger" });
            const storedDoc = (await stack.getDocument((createdDoc as Document)._id as string)) as Document | null;

            expect(storedDoc?.audit).toBe(1);
            expect(storedDoc?.afterRan).toBe(true);
        } finally {
            await cleanup();
        }
    });
});
