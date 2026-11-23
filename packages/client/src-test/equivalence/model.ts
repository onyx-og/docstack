/**
 * The declared model the equivalence fixture is generated from.
 *
 * This file is the **generator's input**, not test code: `@docstack/cli`'s suite copies
 * it into a throwaway project, runs `docstack revision --autogenerate` against
 * `./1.0.0.ts`, and compares the result with `./generated-1.1.0.ts`. That is what keeps
 * the committed generator output from going stale while the browser suite drives it
 * through a real stack (`generated-patch-equivalence.test.ts`).
 *
 * `body` is encrypted *and* has a default, which is what makes the locked path
 * observable: the attribute cannot be propagated without the document key, so the patch
 * that adds it defers (ADR-0041), and its replay has a value to write and seal rather
 * than a `null` that would prove nothing.
 *
 * The same declaration is restated inside the browser test, which cannot import this
 * module - `defineClass` has to run against the bundle under test. The restatement is
 * self-checking: the test re-derives the diff from it and compares with the committed
 * patch, so a model that drifted from this one fails there.
 */
import { defineClass, defineModel, a, type InferDoc } from "@docstack/client/model";

export const Vault = defineClass("Vault", {
    description: "Notes",
    attributes: {
        title: a.string({ mandatory: true, primaryKey: true, maxLength: 120 }),
        body: a.string({ encrypted: true, defaultValue: "redacted" }),
    },
});

/** The document type the declaration infers, as an application would use it. */
export type VaultDoc = InferDoc<typeof Vault>;

export const model = defineModel({ classes: [Vault] });

export default model;
