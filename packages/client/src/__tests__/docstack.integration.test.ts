import { DocStack, Class, Attribute, Domain } from "..";
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

    it("creates domains and lists them", async () => {
        const { stack, cleanup } = await createDocStack();
        try {
            const sourceClassName = `Source-${Date.now()}-${Math.random().toString(16).slice(2)}`;
            const targetClassName = `Target-${Date.now()}-${Math.random().toString(16).slice(2)}`;
            const sourceClass = await Class.create(stack, sourceClassName, "class", "Source class");
            const targetClass = await Class.create(stack, targetClassName, "class", "Target class");

            await Attribute.create(sourceClass, "label", "string", "Label", { mandatory: true });
            await Attribute.create(targetClass, "label", "string", "Label", { mandatory: true });

            const domainName = `Domain-${Date.now()}-${Math.random().toString(16).slice(2)}`;
            const domain = await Domain.create(
                stack,
                domainName,
                "domain",
                "N:N",
                sourceClassName,
                targetClassName,
                "Links sources and targets"
            );

            expect(domain.getModel().name).toBe(domainName);

            const retrieved = await stack.getDomain(domainName);
            expect(retrieved).toBeInstanceOf(Domain);

            const domainList = await stack.getDomains({});
            const domainNames = domainList.map(d => d.getModel().name);
            expect(domainNames).toContain(domainName);
        } finally {
            await cleanup();
        }
    });

    it("creates, validates and deletes domain relations", async () => {
        const { stack, cleanup } = await createDocStack();
        try {
            const sourceClass = await Class.create(stack, `Source-${Date.now()}`, "class", "Sources");
            const targetClass = await Class.create(stack, `Target-${Date.now()}`, "class", "Targets");
            await Attribute.create(sourceClass, "name", "string", "Name", { mandatory: true });
            await Attribute.create(targetClass, "name", "string", "Name", { mandatory: true });

            const domainName = `Rel-${Date.now()}`;
            const domain = await Domain.create(stack, domainName, "domain", "1:1", sourceClass.getName(), targetClass.getName());

            const sourceDoc = await sourceClass.addCard({ name: "alpha" }) as Document;
            const targetDoc = await targetClass.addCard({ name: "omega" }) as Document;
            expect(sourceDoc).not.toBeNull();
            expect(targetDoc).not.toBeNull();

            const relationDoc = await domain.addRelation(sourceDoc, targetDoc._id as string);
            expect(relationDoc).not.toBeNull();
            expect(relationDoc?.type).toBe(domainName);

            const duplicateTarget = await targetClass.addCard({ name: "beta" }) as Document;
            await expect(domain.addRelation(sourceDoc, duplicateTarget._id as string)).rejects.toThrow("Relation validation failed");

            const otherSource = await sourceClass.addCard({ name: "gamma" }) as Document;
            await expect(domain.addRelation(otherSource, targetDoc._id as string)).rejects.toThrow("Relation validation failed");

            const deletionResult = await domain.deleteRelation((relationDoc as Document)._id as string);
            expect(deletionResult).toBe(true);
            const storedRelation = await stack.getDocument((relationDoc as Document)._id as string) as Document | null;
            expect(storedRelation?.active).toBe(false);
        } finally {
            await cleanup();
        }
    });

    it("validates relation attributes during document creation", async () => {
        const { stack, cleanup } = await createDocStack();
        try {
            const customerClass = await Class.create(stack, `Customer-${Date.now()}`, "class", "Customers");
            const accountClass = await Class.create(stack, `Account-${Date.now()}`, "class", "Accounts");
            await Attribute.create(customerClass, "name", "string", "Name", { mandatory: true });
            await Attribute.create(accountClass, "name", "string", "Name", { mandatory: true });

            const relationDomain = await Domain.create(
                stack,
                `CustomerAccount-${Date.now()}`,
                "domain",
                "N:N",
                customerClass.getName(),
                accountClass.getName(),
            );

            const customer = await customerClass.addCard({ name: "Alice" }) as Document;
            const account = await accountClass.addCard({ name: "Checking" }) as Document;

            const relationDoc = await relationDomain.addRelation(customer, account._id as string);
            const relationId = (relationDoc as Document)._id as string;

            const invoiceClass = await Class.create(stack, `Invoice-${Date.now()}`, "class", "Invoices");
            await Attribute.create(invoiceClass, "title", "string", "Title", { mandatory: true });
            await Attribute.create(invoiceClass, "customerRelation", "relation", "Customer Relation", { mandatory: true, domain: relationDomain.name });

            const invoiceDoc = await invoiceClass.addCard({ title: "Invoice A", customerRelation: relationId }) as Document;
            expect(invoiceDoc).not.toBeNull();
            expect(invoiceDoc?.customerRelation).toBe(relationId);

            await expect(
                invoiceClass.addCard({ title: "Invoice B", customerRelation: "non-existent" })
            ).rejects.toThrow("Validation failed for class");
        } finally {
            await cleanup();
        }
    });
});
