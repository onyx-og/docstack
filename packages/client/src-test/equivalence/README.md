# The generated-patch equivalence fixture

What `proposal.md` §11 asks for: *a generated patch adding an attribute behaves
identically to a hand-written ADR-0038 delta patch, including on a locked stack with
deferral and replay.* The claim the whole generator rests on, so the fixture is built so
that nothing in it can be quietly hand-adjusted to make the test pass.

| File | What it is | Who writes it |
| --- | --- | --- |
| `model.ts` | The declared model: `Vault` with a mandatory title and an encrypted body | a person |
| `baseline.ts` | The chain both sides start from (version 1.0.0), stating `Vault` without the body | a person |
| `generated.ts` | **Verbatim `docstack revision --autogenerate` output** (version 1.1.0) | the generator |
| `hand-written.ts` | The same change in the shape the patch guide documents | a person |
| `hand-written-no-id.ts` | The same again with the patch's own `_id` left off, as this suite's patches are written | a person |

`generated.ts` is committed output rather than something produced at test time,
because the two tests that need it run in different places: the behaviour is only
observable against a real stack in a browser (`../generated-patch-equivalence.test.ts`),
and the generator only runs in Node. Two things keep the committed copy honest:

- `@docstack/cli`'s suite regenerates it from `model.ts` and `baseline.ts` and compares, so
  a generator change that alters the output fails there and names this file.
- The browser test re-derives the delta from the bundle's own `diffModel` and compares it
  with this file's documents, so the committed copy cannot drift from what the shipping
  client would compute either.
- `npm run -w packages/client test:types` compiles this directory under
  `compilerOptions.types: []`, so the patches have to satisfy `Patch` and the model the
  builders, the way an application's own source would. That is what caught `Patch`
  requiring `_id` while these fixtures had been written without one.

The version is the file's name in a real project, not here: the patch states its own
version, and these are named for their role so the test that imports them reads clearly.
To regenerate by hand, from a project holding `model.ts` as `src/model.ts` and
`baseline.ts` as `src/patches/1.0.0.ts`:

```bash
docstack revision --autogenerate --target equivalence-app --version 1.1.0 -m "seal the note body"
```
