# react-todo

A checklist, as small as it can be while still showing how a DocStack application is put
together: the data model is declared in TypeScript, the patch that installs it is
generated from that declaration, and both reads and writes are typed by it.

## Run it

```bash
npm install
npm run dev
```

The database is created in the browser on first load, and the two patches in
`src/patches` bring it up: `1.0.0.ts` installs the `Todo` class, `1.0.1.ts` seeds three
tasks. Clearing the site data starts over.

## What to look at

**`src/model.ts`** declares the class. One declaration produces three things: the
TypeScript types (`TodoDoc`, `TodoInput`), the class document the engine stores, and the
input to the patch generator. Nothing is generated into your source tree, so the types
cannot be stale.

It imports from `@docstack/client/model` rather than `@docstack/client`, because the CLI
loads this file in Node and the model entry carries no engine.

**`src/patches/1.0.0.ts`** was written by `npm run revision`, not by hand:

```bash
npm run revision -- -m "what changed"   # writes the next patch and the index
npm run revision:check                  # fails when the model and the chain disagree
```

`revision:check` is the one to put in CI. It catches the mistake that otherwise reaches a
device: editing the model, forgetting the patch, and shipping an app whose code expects a
schema the database never installed.

**`src/patches/1.0.1.ts`** was written by hand, because it seeds content rather than
schema. Both kinds live in the same chain. Note that its third task omits `completed` and
`priority`: both declare a `defaultValue`, which the engine writes on a document's first
write, so the stored document has them anyway.

**`src/App.tsx`** does the typed reads and writes.

- `useClassDocs(DB_NAME, Todo)` - passing the declared class rather than the string
  `'Todo'` - types `docs` as `TodoDoc[]`.
- `typedClass(stack, Todo)` gives the write surface. `addCard({ title })` compiles;
  omitting `title`, or passing a priority outside the enum, does not.
- The priority picker reads its options off `Todo.attributes.priority.config.values`, so
  adding a member to the model adds it to the UI.

There is no `any` in this application's source. That is the point of the exercise: the
model is declared once, and everything above it follows.

## Notes

`npm run build` runs `tsc -b` and then Vite. The typecheck is the part that proves the
model is doing its job.
