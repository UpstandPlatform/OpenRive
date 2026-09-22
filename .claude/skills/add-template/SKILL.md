---
name: add-template
description: Create a new OpenRive starter template end to end (build with the OpenRive API, register, round-trip test, verify in preview, document). Use when asked for a new template or beginner example.
---

# Add a template

1. Read `contribution/templates.md` and one existing template in `src/lib/rive/templates.ts` (for example
   `bouncingBall` or `toggle`).
2. Write the template object `{ id, name, description, build() }`, where `id` is kebab-case and the description says
   what it teaches. Build with `api.*` functions and name every object, timeline and input.
3. Add it to `TEMPLATES` in `src/lib/rive/templates.ts`.
4. Run:
   ```bash
   npx tsc --noEmit
   npm test                                  # must print IDENTICAL for the new template
   npm run cli -- new "Template check" --template <id>
   ```
5. Open the printed editor link. Check the stage and **Preview**, and interact with every input and listener.
6. Delete the check project (`npm run cli -- delete "Template check"`).
7. Add a row to `docs/templates.md`.
