import { DocStack, Class, Attribute } from "..";
import { getAllSystemPatches } from "../core/datamodel";
import type { ClassModel, Document } from "@docstack/shared";

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
    const stackName = name ?? `test-${Date.now()}-${Math.random().toString(16).slice(2)}`;
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

describe("@docstack/client integration", () => {
    it("initializes DocStack and exposes the configured stack", async () => {
        const { docStack, stack, stackName, cleanup } = await createDocStack();
        try {
            expect(docStack.getReadyState()).toBe(true);
            expect(stack.getDbName()).toContain(stackName);
        } finally {
            await cleanup();
        }
    });

    it("fetches the initial class list", async () => {
        const { stack, cleanup } = await createDocStack();
        try {
            const classList = await stack.getClasses({});
            const classNames = classList.map(cls => cls.getName());

            expect(classNames.length).toBeGreaterThan(0);
            expect(classNames).toEqual(expect.arrayContaining(["User", "UserSession"]));
        } finally {
            await cleanup();
        }
    });

    it("instantiates existing classes from the stack", async () => {
        const { stack, cleanup } = await createDocStack();
        try {
            const classOrigin = await stack.getClass("class");
            expect(classOrigin).toBeInstanceOf(Class);
            expect(classOrigin?.getName()).toBe("class");
        } finally {
            await cleanup();
        }
    });

    it("creates classes and manages attributes", async () => {
        const { stack, cleanup } = await createDocStack();
        try {
            const className = `Book-${Math.random().toString(16).slice(2)}`;
            const classObj = await Class.create(stack, className, "class", "Books catalog");

            await Attribute.create(classObj, "title", "string", "Title", { mandatory: true });
            await Attribute.create(classObj, "pages", "integer", "Pages", { mandatory: true, min: 1 });

            let schema = classObj.getModel().schema;
            expect(schema).toHaveProperty("title");
            expect(schema).toHaveProperty("pages");

            await classObj.removeAttribute("pages");
            schema = classObj.getModel().schema;
            expect(schema).not.toHaveProperty("pages");
        } finally {
            await cleanup();
        }
    });

    it("matches the system class schema with patch definitions", async () => {
        const { stack, cleanup } = await createDocStack();
        try {
            const classOrigin = await stack.getClass("class");
            expect(classOrigin).not.toBeNull();

            const classModel = classOrigin!.getModel();
            const expectedClassDoc = getAllSystemPatches()
                .flatMap(patch => patch.docs)
                .find(doc => doc._id === "class") as { schema: ClassModel["schema"] } | undefined;

            expect(expectedClassDoc).toBeDefined();
            if (!expectedClassDoc) {
                throw new Error("Expected system patch for 'class' not found");
            }

            expect(classModel.schema).toEqual(expectedClassDoc.schema);
            await expect(classOrigin!.validate({
                name: "Example",
                description: "Sample class",
                type: "class"
            })).resolves.toBe(true);
        } finally {
            await cleanup();
        }
    });

    it("creates, updates, deletes and validates documents for a class", async () => {
        const { stack, cleanup } = await createDocStack();
        try {
            const className = `Card-${Math.random().toString(16).slice(2)}`;
            const classObj = await Class.create(stack, className, "class", "Cards");

            await Attribute.create(classObj, "title", "string", "Title", { mandatory: true });
            await Attribute.create(classObj, "pages", "integer", "Pages", { mandatory: true, min: 1 });

            const createdDoc = await classObj.addCard({ title: "Document 1", pages: 10 });
            expect(createdDoc).not.toBeNull();
            const docId = (createdDoc as Document)._id as string;
            expect(docId).toContain(className);

            const updatedDoc = await classObj.updateCard(docId, { title: "Document 1", pages: 25 });
            expect(updatedDoc).not.toBeNull();

            const storedDoc = await stack.getDocument(docId) as Document | null;
            expect(storedDoc?.pages).toBe(25);

            await expect(classObj.validate({ title: "Valid", pages: 2 })).resolves.toBe(true);
            await expect(classObj.validate({ title: "Invalid", pages: "two" })).resolves.toBe(false);

            const deletionResult = await classObj.deleteCard(docId);
            expect(deletionResult).toBe(true);

            const deletedDoc = await stack.getDocument(docId) as Document | null;
            expect(deletedDoc?.active).toBe(false);
        } finally {
            await cleanup();
        }
    });

    it("notifies class listeners when documents change", async () => {
        const { stack, cleanup } = await createDocStack();
        try {
            const className = `Listener-${Math.random().toString(16).slice(2)}`;
            const classObj = await Class.create(stack, className, "class", "Listeners");
            await Attribute.create(classObj, "title", "string", "Title", { mandatory: true });

            const eventPromise = new Promise<CustomEvent>((resolve, reject) => {
                const timeout = setTimeout(() => {
                    classObj.removeEventListener("doc", handler as EventListener);
                    reject(new Error("Listener did not receive document change"));
                }, 5000);

                const handler = (event: Event) => {
                    clearTimeout(timeout);
                    classObj.removeEventListener("doc", handler as EventListener);
                    resolve(event as CustomEvent);
                };

                classObj.addEventListener("doc", handler as EventListener);
            });

            const createdDoc = await classObj.addCard({ title: "Event driven" });
            expect(createdDoc).not.toBeNull();

            const changeEvent = await eventPromise;
            expect(changeEvent.detail).toHaveProperty("id");
        } finally {
            await cleanup();
        }
    });
});
