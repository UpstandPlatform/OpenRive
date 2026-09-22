---
name: riv-debug
description: Investigate a .riv file that fails to import, doesn't round-trip byte-identically, or renders differently in OpenRive than in rive.app. Use when a bug report includes a .riv file.
---

# Debug a .riv file

1. **Round-trip check:**
   ```bash
   bun run cli validate path/to/file.riv
   ```
   It reports "byte-identical" or the first differing offset.
2. **Dump the object stream** to see types, properties and indices:
   ```bash
   bun scripts/dump.ts path/to/file.riv > before.txt
   bun run cli import path/to/file.riv --name debug && bun run cli export debug after.riv
   bun scripts/dump.ts after.riv > after.txt
   diff before.txt after.txt
   ```
3. **Classify the difference:**
   - unknown type or property: update `core-defs.json` (`bun scripts/generate-core-defs.js <rive-runtime>/dev/defs`)
   - a wrong index after export: a reference property is missing from `REF_SPACES` in `document.ts`, or `isIndexable`
     slot counting is off
   - reordered objects: an insert or move ignored hierarchy or draw order (`ops.ts`)
   - property order or defaults changed: `keyOrder` / ToC handling in `riv-format.ts`
4. **Rendering differences** with identical bytes are runtime-side. Compare with Preview (same runtime) and check
   view model binding (`engine.ts` `bindViewModel`) and the chosen artboard or state machine.
5. **Fix and add a regression test** to `scripts/roundtrip.test.ts`, with a minimal reproduction built with the API,
   or the file under `scripts/fixtures/` if its license allows.
6. Clean up the `debug` project: `bun run cli delete debug`.
