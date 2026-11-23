import type { Patch } from "@docstack/client/model";

/**
 * The baseline every chain starts from, written by hand.
 *
 * Deliberately *not* generated: an application reaching 2.0 has a hand-written chain and
 * generates the next patch on top of it (`docs/upgrade-to-2.0.md`), so this is the real
 * starting state. It states `Vault` with one attribute; the model in `./model.ts` adds a
 * second, which is the delta under test.
 *
 * `_id` is `<target>-<version>`, the convention the patch guide uses throughout and the
 * one the generator emits.
 */
const patch_1_0_0: Patch = {
    _id: "equivalence-app-1.0.0",
    "~class": "patch",
    target: "equivalence-app",
    version: "1.0.0",
    changelog: "the Vault class",
    docs: [{
        _id: "Vault",
        "~class": "class",
        active: true,
        name: "Vault",
        description: "Notes",
        schema: {
            title: {
                name: "title",
                type: "string",
                config: { mandatory: true, primaryKey: true, maxLength: 120 },
            },
        },
    }],
};

export default patch_1_0_0;
