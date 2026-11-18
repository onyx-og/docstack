import type {
    ClassDefinition, Document, InferDoc, InferInput, ModelDefinition, Stack,
} from "@docstack/shared";
import type Class from "./class.js";

/**
 * A class's read and write surface, typed by its code definition.
 *
 * Additive by construction: every method here forwards to the same `Class` the untyped
 * API returns, which stays reachable as {@link TypedClass.untyped} for anything this
 * wrapper does not cover.
 *
 * The returned shapes are **assertions about what the engine stores**, not runtime
 * re-validation: the engine already validated the write, and `InferDoc` is derived from
 * the same declaration it validated against. A class whose stored model has drifted
 * from the code model - by a runtime `addAttribute`, say - makes those assertions
 * unsound, which is what `proposal.md` §7 warns about and the model hash is for.
 */
export type TypedClass<C extends ClassDefinition> = {
    /** The class name, as declared. */
    readonly name: C["name"];
    /**
     * The underlying untyped class.
     *
     * Resolved on demand rather than held, so a stack that gains the class later still
     * works and nothing has to be awaited before the wrapper is usable.
     */
    readonly untyped: () => Promise<Class>;
    /**
     * Creates a document.
     *
     * @param input - The attributes to write. Required only where the engine will not
     * fill them: see `InferInput`.
     * @returns The stored document, or `null` when the write produced none.
     */
    readonly addCard: (input: InferInput<C>) => Promise<InferDoc<C> | null>;
    /**
     * Updates a document.
     *
     * @param id - The document id.
     * @param patch - The attributes to change. `null` clears one.
     * @returns The stored document, or `null`.
     */
    readonly updateCard: (
        id: string,
        patch: Partial<InferInput<C>>
    ) => Promise<InferDoc<C> | null>;
    /**
     * Fetches one document by id.
     *
     * @param id - The document id.
     * @returns The document, or `null` when there is none.
     */
    readonly get: (id: string) => Promise<InferDoc<C> | null>;
    /**
     * Queries the class's documents.
     *
     * @param selector - A Mango selector; the class constraint is added for you.
     * @param fields - Projection. Note that a projected read returns a partial
     * document, which is why the result widens to `Partial<InferDoc<C>>[]` there.
     * @param skip - Documents to skip.
     * @param limit - Maximum documents to return.
     * @param sort - Sort order.
     * @returns The matching documents.
     */
    readonly getCards: {
        (selector?: { [key: string]: any }): Promise<InferDoc<C>[]>;
        (
            selector: { [key: string]: any } | undefined,
            fields: string[],
            skip?: number,
            limit?: number,
            sort?: { [field: string]: "asc" | "desc" }[]
        ): Promise<Partial<InferDoc<C>>[]>;
    };
    /**
     * Validates a candidate document against the stored model.
     *
     * @param candidate - The document to check.
     * @returns Whether it satisfies the class.
     */
    readonly validate: (candidate: InferInput<C> | Document) => Promise<boolean>;
};

/**
 * Wraps one declared class as a typed surface over the stack's own class.
 *
 * Pattern: Adapter.
 *
 * @param stack - The stack holding the class. A remote stack works too: everything
 * here goes through the same `Class`, whose writes run on the host.
 * @param declared - The class as declared with `defineClass`.
 * @returns The typed surface; see {@link TypedClass}.
 *
 * @example
 * ```typescript
 * const todos = typedClass(stack, Todo);
 * const created = await todos.addCard({ title: "Ship" });
 * created?.title.toUpperCase(); // string, not any
 * ```
 */
export const typedClass = <C extends ClassDefinition>(
    stack: Stack,
    declared: C
): TypedClass<C> => {
    const resolve = async (): Promise<Class> => {
        const classObj = await stack.getClass(declared.name);
        if (!classObj) {
            throw new Error(
                `typedClass - this stack has no class '${declared.name}'. ` +
                "Its patch chain may not declare it yet: run `docstack revision --check`."
            );
        }
        // The read/write surface lives on the client's concrete class, not on the
        // abstract one in `@docstack/shared`, so the cast is to the implementation this
        // package owns rather than across a contract.
        return classObj as unknown as Class;
    };

    /**
     * Types what a write returned.
     *
     * This used to read the document back, because `createDoc` returned a draft the
     * pipeline had never touched - `pouchdb-core`'s `put` clones, so filled defaults and
     * the `~createdBy` / `~updatedBy` attribution landed on a copy the caller never saw.
     * The write path returns the stored document now, so the extra read is gone and this
     * is a cast rather than a round trip.
     *
     * @param written - Whatever the untyped write returned.
     * @returns The stored document, or `null` when the write produced none.
     */
    const asStored = (written: Document | null): InferDoc<C> | null =>
        written ? written as unknown as InferDoc<C> : null;

    const getCards = (async (
        selector?: { [key: string]: any },
        fields?: string[],
        skip?: number,
        limit?: number,
        sort?: { [field: string]: "asc" | "desc" }[]
    ) => {
        const classObj = await resolve();
        return await classObj.getCards(selector, fields, skip, limit, sort);
    }) as TypedClass<C>["getCards"];

    return Object.freeze({
        name: declared.name,
        untyped: resolve,
        addCard: async (input: InferInput<C>) => {
            const classObj = await resolve();
            return asStored(await classObj.addCard(input as { [key: string]: any }));
        },
        updateCard: async (id: string, patch: Partial<InferInput<C>>) => {
            const classObj = await resolve();
            return asStored(await classObj.updateCard(id, patch as { [key: string]: any }));
        },
        get: async (id: string) => {
            const classObj = await resolve();
            return await classObj.get(id) as InferDoc<C> | null;
        },
        getCards,
        validate: async (candidate: InferInput<C> | Document) => {
            const classObj = await resolve();
            return await classObj.validate(candidate as { [key: string]: any });
        },
    });
};

/** Every class of a model, keyed by its declared name. */
export type TypedStack<M extends ModelDefinition> = {
    [C in M["classes"][number] as C["name"]]: TypedClass<C>;
};

/**
 * Wraps a whole model as typed surfaces over a stack's classes.
 *
 * Synchronous, and nothing is resolved until a method is called, so this can sit beside
 * the model definition at module scope.
 *
 * @param stack - The stack holding the classes.
 * @param model - The model, from `defineModel`.
 * @returns One {@link TypedClass} per declared class, keyed by name.
 *
 * @example
 * ```typescript
 * const db = typed(stack, model);
 * const todos = await db.Todo.getCards({ completed: { $eq: false } });
 * ```
 */
export const typed = <M extends ModelDefinition>(stack: Stack, model: M): TypedStack<M> => {
    const wrapped: Record<string, TypedClass<ClassDefinition>> = {};
    for (const declared of model.classes) {
        wrapped[declared.name] = typedClass(stack, declared);
    }
    // Through `unknown`: the record is built by name at runtime, which is exactly the
    // mapping `TypedStack` describes, but TypeScript cannot see that a loop over a tuple
    // produces its keys.
    return Object.freeze(wrapped) as unknown as TypedStack<M>;
};
