import { test as it, expect } from './fixtures';
import {Document} from '@docstack/shared';

const describe = it.describe

describe("@docstack/client integration", () => {
    it("initializes DocStack and exposes the configured stack", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "integration",
            evaluate: ({ docStack, stack, stackName }) => {
                return {
                    isReady: docStack.getReadyState(),
                    dbName: stack.getDbName(),
                    stackName,
                };
            },
        });

        expect(result.isReady).toBe(true);
        expect(result.dbName).toContain(result.stackName);
    });

    it("fetches the initial class list", async ({ useDocStack }) => {
        const classNames = await useDocStack({
            name: "integration-classes",
            evaluate: async ({ stack }) => {
                const classList = await stack.getClasses({});
                return classList.map(cls => cls.getName());
            },
        });

        expect(classNames.length).toBeGreaterThan(0);
        expect(classNames).toEqual(expect.arrayContaining(["User", "UserSession"]));
    });

    it("instantiates existing classes from the stack", async ({ useDocStack }) => {
        const className = await useDocStack({
            name: "integration-instantiation",
            evaluate: async ({ stack }) => {
                const classOrigin = await stack.getClass("class");
                return classOrigin?.getName();
            },
        });
        expect(className).toBe("class");
    });

    it("creates classes and manages attributes", async ({ useDocStack }) => {
        const schema = await useDocStack({
            name: "integration-attributes",
            evaluate: async ({ stack }) => {
                const { Class, Attribute } = (window as any).docstack;
                const className = `Book-${Math.random().toString(16).slice(2)}`;
                const classObj = await Class.create(stack, className, "class", "Books catalog");

                await Attribute.create(classObj, "title", "string", "Title", { mandatory: true });
                await Attribute.create(classObj, "pages", "integer", "Pages", { mandatory: true, min: 1 });
                
                const createdDoc = await classObj.addCard({ title: "Document 1", pages: 10 });

                await classObj.removeAttribute("pages");
                return classObj.getModel().schema;
            },
        });

        expect(schema).toHaveProperty("title");
        expect(schema).not.toHaveProperty("pages");
    });

    it("creates, updates, deletes and validates documents for a class", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "integration-listeners",
            evaluate: async ({ stack }) => {
                const { Class, Attribute } = (window as any).docstack;
                const className = `Card-${Math.random().toString(16).slice(2)}`;
                const classObj = await Class.create(stack, className, "class", "Cards");

                await Attribute.create(classObj, "title", "string", "Title", { mandatory: true });
                await Attribute.create(classObj, "pages", "integer", "Pages", { mandatory: true, min: 1 });

                const createdDoc = await classObj.addCard({ title: "Document 1", pages: 10 });
                const docId = createdDoc._id;

                await classObj.updateCard(docId, { title: "Document 1", pages: 25 });
                const storedDoc = await stack.getDocument<Document &{title: string, pages: number}>(docId);

                const valid = await classObj.validate({ title: "Valid", pages: 2 });
                const invalid = await classObj.validate({ title: "Invalid", pages: "two" });

                await classObj.deleteCard(docId);
                const deletedDoc = await stack.getDocument(docId);

                return {
                    createdId: createdDoc._id,
                    updatedPages: storedDoc?.pages,
                    valid,
                    invalid,
                    deletedIsInactive: deletedDoc?.active,
                    className,
                };
            },
        });

        expect(result.createdId).toContain(result.className);
        expect(result.updatedPages).toBe(25);
        expect(result.valid).toBe(true);
        expect(result.invalid).toBe(false);
        expect(result.deletedIsInactive).toBe(false);
    });

    it("notifies class listeners when documents change", async ({ useDocStack }) => {
        const eventDetail = await useDocStack({
            name: "integration-documents",
            evaluate: async ({ stack }) => {
                const { Class, Attribute } = (window as any).docstack;
                const className = `Listener-${Math.random().toString(16).slice(2)}`;
                const classObj = await Class.create(stack, className, "class", "Listeners");
                await Attribute.create(classObj, "title", "string", "Title", { mandatory: true });

                const eventPromise = new Promise<any>((resolve, reject) => {
                    const timeout = setTimeout(() => reject(new Error("Listener timeout")), 5000);
                    const handler = (event: Event) => {
                        clearTimeout(timeout);
                        classObj.removeEventListener("doc", handler as EventListener);
                        resolve((event as CustomEvent).detail);
                    };
                    classObj.addEventListener("doc", handler as EventListener);
                });

                await classObj.addCard({ title: "Event driven" });
                return eventPromise;
            },
        });

        expect(eventDetail).toHaveProperty("id");
    });

    it("creates domains and lists them", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "integration-domain-creation",
            evaluate: async ({ stack }) => {
                const { Class, Domain } = (window as any).docstack;
                const sourceClass = await Class.create(stack, `Source-${Date.now()}`, "class", "Sources");
                const targetClass = await Class.create(stack, `Target-${Date.now()}`, "class", "Targets");

                const domainName = `Domain-${Date.now()}`;
                const domain = await Domain.create(stack, null, domainName, "domain", "1:N", sourceClass, targetClass);
                const fetched = await stack.getDomain(domainName);
                const domains = await stack.getDomains({});

                return {
                    sourceClassId: domain.getModel().sourceClass,
                    expectedSourceId: sourceClass.id,
                    fetchedName: fetched?.getName(),
                    domainList: domains.map(d => d.getName()),
                    domainName,
                };
            },
        });

        expect(result.sourceClassId).toBe(result.expectedSourceId);
        expect(result.fetchedName).toBe(result.domainName);
        expect(result.domainList).toContain(result.domainName);
    });
});
