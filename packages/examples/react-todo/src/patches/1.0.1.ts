import type { Patch } from "@docstack/client/model";

/**
 * The starting checklist.
 *
 * Hand-written, unlike `1.0.0.ts`: `docstack revision` generates *schema* patches, and a
 * patch that seeds content is one a person decides on. It sits in the same chain and is
 * picked up by the generated index, so the only difference is who wrote it.
 *
 * `docstack revision --check` stays quiet about this file because it carries no class
 * documents: the fold replays the whole chain, and the diff only looks at the classes it
 * produces.
 */
const patch_1_0_1: Patch = {
    _id: "react-todo-1.0.1",
    "~class": "patch",
    target: "react-todo",
    version: "1.0.1",
    changelog: "the starting checklist",
    docs: [
        {
            _id: "task-1",
            "~class": "Todo",
            active: true,
            title: "Declare the model in code",
            completed: true,
            priority: "high",
        },
        {
            _id: "task-2",
            "~class": "Todo",
            active: true,
            title: "Generate the patch that installs it",
            completed: true,
            priority: "high",
        },
        {
            // No `completed` and no `priority`: both declare a `defaultValue`, which the
            // engine writes on a document's first write. This one is stored with
            // `completed: false` and `priority: "normal"` without saying so.
            _id: "task-3",
            "~class": "Todo",
            active: true,
            title: "Read documents that are typed",
            dueOn: "2026-12-01",
        },
    ],
};

export default patch_1_0_1;
