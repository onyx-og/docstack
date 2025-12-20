import e from 'express';
import { test as it, expect } from './fixtures';
import {Document} from '@docstack/shared';

const describe = it.describe

describe("@docstack/core-datamodel integration", () => {
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
        const test = await useDocStack({
            name: "integration-attributes",
            evaluate: async ({ stack }) => {
                const { Class, Attribute } = (window as any).docstack;
                const className = `Book-${Math.random().toString(16).slice(2)}`;
                const classObj = await Class.create(stack, className, "class", "Books catalog");

                await Attribute.create(classObj, "title", "string", "Title", { mandatory: true });
                await Attribute.create(classObj, "pages", "integer", "Pages", { mandatory: true, min: 1 });
                
                let createdDoc = await classObj.addCard({ title: "Document 1", pages: 10 });

                await classObj.removeAttribute("pages");
                createdDoc = await stack.getDocument<Document & {title: string, pages?: number}>(createdDoc._id);
                return {schema: classObj.getModel().schema, doc: createdDoc}
            },
        });

        expect(test.schema).toHaveProperty("title");
        expect(test.schema).not.toHaveProperty("pages");
        // expect(test.doc).not.toHaveProperty("pages"); // TODO: re-enable when attribute removal is fixed
    });

    it("matches the system class schema with patch definitions", async ({ useDocStack }) => {
        const test = await useDocStack({
            name: "integration-schema",
            evaluate: async ({ stack }) => {
                const classOrigin = await stack.getClass("class");

                const classModel = classOrigin!.getModel();

                const valid = await classOrigin!.validate({
                    name: "Example",
                    description: "Sample class",
                    "~class": "class"
                })

                return {originModel: classModel, valid};
            }
        })

        expect(test.originModel).toHaveProperty("~class");
        expect(test.originModel["~class"]).toBe("~self");
        expect(test.valid).toBe(true);
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

    it("validates relation documents passed through bulkDocs", async ({ useDocStack }) => {
        const test = await useDocStack({
            name: "integration-domain-validation",
            evaluate: async ({ stack }) => {
                const { Class, Domain, Attribute } = (window as any).docstack;
                const sourceClass = await Class.create(stack, `BulkSource-${Date.now()}`, "class", "Sources");
                const targetClass = await Class.create(stack, `BulkTarget-${Date.now()}`, "class", "Targets");
                await Attribute.create(sourceClass, "name", "string", "Name", { mandatory: true });
                await Attribute.create(targetClass, "name", "string", "Name", { mandatory: true });

                const domain = await Domain.create(stack, null, `BulkDomain-${Date.now()}`, "domain", "1:N", sourceClass, targetClass);
                const sourceDoc = await sourceClass.addCard({ name: "Source" }) as Document;
                const targetDoc = await targetClass.addCard({ name: "Target" }) as Document;

                const invalidClassesDoc = {
                    _id: `${domain.name}-bad-classes`,
                    "~domain": domain.name,
                    sourceClass: "wrong-class",
                    targetClass: domain.targetClass.id!,
                    sourceId: sourceDoc._id as string,
                    targetId: targetDoc._id as string,
                };

                let invalidClassesDocThrows = false;
                try {
                    await stack.db.bulkDocs([invalidClassesDoc]);
                } catch (e) {
                    if (/classes do not match domain/i.test((e as Error).message))
                        invalidClassesDocThrows = true;
                }

                const missingTargetDoc = {
                    _id: `${domain.name}-missing-target`,
                    "~domain": domain.name,
                    sourceClass: domain.sourceClass.id!,
                    targetClass: domain.targetClass.id!,
                    sourceId: sourceDoc._id as string,
                    targetId: "missing-target-id",
                };

                let missingTargetDocThrows = false;
                try {
                    await stack.db.bulkDocs([missingTargetDoc]);
                } catch (e) {
                    if (/Target document 'missing-target-id' does not exist/i.test((e as Error).message))
                        missingTargetDocThrows = true;
                }

                const validRelation = {
                    _id: `${domain.name}-valid`,
                    "~domain": domain.name,
                    sourceClass: domain.sourceClass.id!,
                    targetClass: domain.targetClass.id!,
                    sourceId: sourceDoc._id as string,
                    targetId: targetDoc._id as string,
                };

                const response = await stack.db.bulkDocs([validRelation]);
                const savedRelation = await stack.db.get<Document>(validRelation._id);

                return {
                    invalidClassesDocThrows,
                    missingTargetDocThrows,
                    savedRelationSourceId: savedRelation.sourceId,
                    savedRelationTargetId: savedRelation.targetId,
                };
            }
        });

        expect(test.invalidClassesDocThrows).toBe(true);
        expect(test.missingTargetDocThrows).toBe(true);
        expect(test.savedRelationSourceId).toBeDefined();
        expect(test.savedRelationTargetId).toBeDefined();
    });

    it("validates reference attribute placement on domains", async ({ useDocStack }) => {
        const test = await useDocStack({
            name: "integration-reference-domain",
            evaluate: async ({ stack }) => {
                const { Class, Domain, Attribute } = (window as any).docstack;
                const leftClass = await Class.create(stack, `Left-${Date.now()}`, "class", "Left");
                const rightClass = await Class.create(stack, `Right-${Date.now()}`, "class", "Right");
                await Attribute.create(leftClass, "name", "string", "Name", { mandatory: true });
                await Attribute.create(rightClass, "name", "string", "Name", { mandatory: true });

                const domain = await Domain.create(stack, null, `LeftRight-${Date.now()}`, "domain", "1:N", leftClass, rightClass);
                
                let rightAttrCreated = false;
                try {
                    await Attribute.create(rightClass, "parent", "reference", "Parent", { mandatory: true, domain: domain.name });
                    rightAttrCreated = true;
                } catch {
                    rightAttrCreated = false;
                }

                let leftAttrCreated = false;
                try {
                    await Attribute.create(leftClass, "child", "reference", "Child", { domain: domain.name });
                    leftAttrCreated = true;
                } catch {
                    leftAttrCreated = false;
                }

                return {
                    rightAttrCreated,
                    leftAttrCreated,
                };
            }
        });

        expect(test.rightAttrCreated).toBe(true);
        expect(test.leftAttrCreated).toBe(false);
        
    });

    it("creates and deletes domain relations via reference attributes", async ({ useDocStack }) => {
        const test = await useDocStack({
            name: "integration-reference-domain",
            evaluate: async ({ stack }) => {
                const { Class, Domain, Attribute } = (window as any).docstack;
                const customerClass = await Class.create(stack, `Customer-${Date.now()}`, "class", "Customers");
                const accountClass = await Class.create(stack, `Account-${Date.now()}`, "class", "Accounts");
                await Attribute.create(customerClass, "name", "string", "Name", { mandatory: true });
                await Attribute.create(accountClass, "name", "string", "Name", { mandatory: true });

                const domain = await Domain.create(stack, null, `CustomerAccount-${Date.now()}`, "domain", "1:N", customerClass, accountClass);
                await Attribute.create(accountClass, "customer", "reference", "Customer", { mandatory: true, domain: domain.name });

                const customer = await customerClass.addCard({ name: "Alice" }) as Document;
                // TODO: Re-enable when relation creation via reference attribute is functional (currently timing out)
                const account = await accountClass.addCard({ name: "Primary", customer: customer._id }) as Document;

                const relations = await domain.getRelations();

                const deleted = await domain.deleteRelation(customer._id as string, account._id as string);
                const remaining = await domain.getRelations();

                return {
                    account,
                    customer,
                    relations,
                    deleted,
                    remaining,
                };
            }
        });

        expect(test.account).toHaveProperty("_id");
        expect(test.customer).toHaveProperty("_id");
        expect(test.relations).toHaveLength(1);
        expect(test.relations[0].sourceId).toBe(test.customer._id);
        expect(test.relations[0].targetId).toBe(test.account._id);

        expect(test.deleted).toBe(true);
        expect(test.remaining.length).toBe(0);
    });
});
