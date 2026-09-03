# Finding — `applySchemaDelta` returns from inside its loop, so at most one attribute ever propagates

Status: fixed (ADR-0038) · Date: 2026-09-03

**For dispatch to the DocStack repository** (`packages/client`, the class-model propagation
path). Found while establishing what a consumer's mis-written patch would have done to its
documents — the answer turned out to be *nothing*, for the wrong reason.

**A class-model change propagates to at most one attribute per document, chosen by object
key order.** A patch that adds two attributes stamps the first. A patch that drops two
deletes the first. A patch whose first delta entry is not an array does nothing at all.

---

## The code

```js
const applySchemaDelta = async (doc, schemaDelta, classObj) => {
    let updatedDoc = Object.assign({}, doc);
    const t = Object.entries(schemaDelta);
    for (const e of t) {
        if (Array.isArray(e[1])) {
            // addition
            if (e[1].length === 1) {
                const attrModel = e[1][0];
                updatedDoc = await attributeEffect("add", attrModel, classObj, updatedDoc);
            }
            // "edit"
            if (e[1].length === 1) {                    // ← same condition as the add
                const attrModel = e[1][0];
                updatedDoc = await attributeEffect("change", attrModel, classObj, updatedDoc);
            }
            // removal
            if (e[1].length === 3) {
                const attrModel = e[1][0];
                updatedDoc = await attributeEffect("delete", attrModel, classObj, updatedDoc);
            }
            return updatedDoc;                           // ← inside the loop
        }
    }
    return updatedDoc;
};
```

Three defects in fourteen lines, and they interact:

1. **`return updatedDoc` is inside the `for`.** The first entry whose value is an array
   ends the function. Every later attribute in the delta is skipped.
2. **The `change` branch tests `e[1].length === 1`, which is the `add` branch's condition.**
   So an addition is applied twice — once as `add`, immediately again as `change` — and an
   edit (`[oldValue, newValue]`, length 2) is never applied at all. The comment above it
   says "it's an edit when it has 2 elements", which is what the condition was meant to be.
3. **A non-array entry is skipped silently** rather than being an error. If the delta format
   ever nests (a config object changing inside an attribute), those changes vanish with no
   log line.

## Why it has not been noticed

Because its most common outcome is *doing nothing*, and doing nothing looks exactly like a
schema change that did not need to touch any documents — which is the usual case. A patch
that adds one optional attribute to a class produces documents that are missing that key,
and everything downstream treats a missing optional key as absent, correctly.

It surfaces the moment a patch is wrong. In the consumer that found this, a patch
accidentally removed two foreign keys (`board`, `bucket`) from a class carrying twenty
attributes. Correct propagation would have deleted both from every task document — a
silent, replicating loss of every board membership in the workspace. What actually happened
was nothing, because whichever delta entry came first was not one of those two, and the
function returned before reaching them.

**That is not a mitigation.** It is a coin flip that happened to land well, and the same
coin decides whether the next correct patch stamps its new attribute onto documents or
leaves them without it — which is the difference between a mandatory attribute arriving
populated and a class whose documents all fail validation on next write.

## Suggested fix

```js
const applySchemaDelta = async (doc, schemaDelta, classObj) => {
    let updatedDoc = Object.assign({}, doc);
    for (const [name, delta] of Object.entries(schemaDelta)) {
        if (!Array.isArray(delta)) {
            logger.warn("applySchemaDelta - unhandled delta shape", { name, delta });
            continue;
        }
        if (delta.length === 1) {
            updatedDoc = await attributeEffect("add", delta[0], classObj, updatedDoc);
        } else if (delta.length === 2) {
            updatedDoc = await attributeEffect("change", delta[1], classObj, updatedDoc);
        } else if (delta.length === 3) {
            updatedDoc = await attributeEffect("delete", delta[0], classObj, updatedDoc);
        }
    }
    return updatedDoc;
};
```

Three notes on the change rather than on the bug:

- **`change` should take the new model (`delta[1]`), not the old.** The current code passes
  `delta[0]` on a branch that can never run today; when the condition is fixed, passing the
  old model would validate every document against the definition being replaced.
- **Fixing this makes propagation real**, which means the next patch anybody applies will
  do what it says for the first time. That is the right outcome and it is not a small one:
  a repository that has been shipping patches against this function has been shipping them
  against a no-op, and at least one of them may be carrying a delete it never performed.
  Worth a release note rather than a patch version.
- **`attributeEffect("add")` overwrites an existing value** with `getEmpty()` — `{ x: null }`
  — rather than filling in a missing one. Harmless while propagation does not run; the first
  thing to bite once it does, and the reason the companion proposal on merge semantics asks
  for `add` to leave a present value alone.

## Reproduction

Apply a patch restating a class with two new optional attributes over a database holding
documents of that class. Read one back: it carries the first attribute's empty value and
not the second's. Swap the two in the patch's `schema` object and the other one arrives.

## Resolution (upstream)

Valid, and applied - with one correction to the suggested fix itself. The delta comes
from **jsondiffpatch**, which recurses into object values rather than emitting
`[old, new]` for them: an attribute model edited in place (one config flag, a
description) arrives as a *nested object delta*, i.e. the non-array branch the
suggestion only logs on. The `length === 2` branch this finding repairs is therefore
nearly dead code for attribute models - the live edit path is the nested one. The
landed fix handles it: a nested delta validates every document against the full new
model, taken from the schema being written (the fragment in the delta is not enough
to validate against). The three notes were all taken: `change` passes the new model,
`attributeEffect("add")` no longer overwrites a held value, and the behavior change
is recorded as a release-note-worthy decision, not a patch - see ADR-0038, which also
answers the companion proposal.
