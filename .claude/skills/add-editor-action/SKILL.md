---
name: add-editor-action
description: Add a new command to the OpenRive editor (action registry entry, default shortcut, context menu entry, docs). Use when adding any user-invokable editor operation.
---

# Add an editor action

1. **Implement the operation** as a pure function on the document in `src/lib/rive/ops.ts` (structural) or
   `src/lib/rive/api.ts` (user-facing, name-addressable). Keep it DOM-free.
2. **Register the action** in `src/components/editor/actions.ts` inside the `ACTIONS` array, near related ones:
   ```ts
   { id: 'object.myThing', label: 'My thing', category: 'Object', keys: ['Alt+M'], edits: true,
     enabled: hasSelection, run: () => st().commit((doc) => myThing(doc, st().selection)) },
   ```
   - `category`: one of File, Edit, Object, Arrange, Tools, View, Animate
   - `when: 'animate'` or `'design'` if it only applies in one mode
   - Pick keys that don't clash: search `keys: [` in the file. Users can rebind anything.
3. **Add it to menus** in `src/components/editor/menus.ts` with `act('object.myThing')` where it belongs (object,
   canvas or layer menus).
4. **Check** with `npx tsc --noEmit`. Then, in the browser: run it via the shortcut, the context menu and the
   shortcuts dialog (`?`), undo it, and make sure it's disabled for Viewers.
5. **Document** the shortcut in `docs/shortcuts.md`, and in `docs/user-guide.md` if it's a notable feature.
