# Code style

The goal: code that reads like the code around it.

## General

- **TypeScript, strict.** No `any` unless unavoidable. Prefer precise types from `schema.ts` / `document.ts`.
- **Small pure functions** in `src/lib`, UI in `src/components`. The core must not import React or touch the DOM
  (except `engine.ts`/`runtime.ts`).
- **Names over comments.** Comment the *why* (format quirks, runtime behavior), not the *what*. Match the existing
  comment density: short `//` lines and `/** */` on exported functions.
- **No new dependencies** without discussing them in the issue. The runtime bundle matters.
- **Bun is the package manager and runtime**: `bun install`, `bun run <script>`, `bun x`. Don't add npm, pnpm or yarn
  lockfiles.
- Format with the existing style: 2 spaces, single quotes, semicolons, trailing commas, about 160 columns. Run
  `bun run lint`.

## React

- Function components with hooks. Read state with selectors (`useEditor((s) => s.doc)`). Use
  `useEditor.getState()` inside handlers.
- All document mutations go through `commit(recipe)`. Use transient commits plus gestures for drags.
- Styling uses Tailwind utilities plus the shared classes in `globals.css` (`btn`, `icon-btn`, `field`, `section`,
  `panel-title`, `label`, `menu`, `menu-item`). Colors come from CSS variables (`bg-bg1`, `text-t1`, `border-line`,
  `accent`).
- Icons come from `lucide-react`, at 12–15 px in panels.
- Popovers that can overflow a panel render in a portal (see `ColorSwatch` in `controls.tsx`).

## Naming

| Thing | Style | Example |
| --- | --- | --- |
| Files (components) | PascalCase | `AssetsPanel.tsx` |
| Files (lib) | kebab/lower | `storage-core.ts`, `svg.ts` |
| Action ids | `area.verb` | `object.group`, `view.codePanel` |
| MCP tools | `snake_case` verbs | `add_keyframes` |
| Template ids | kebab-case | `loading-spinner` |

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org):

```
feat(assets): drag image assets onto the canvas
fix(format): keep ToC order for unknown properties
docs(self-hosting): add Caddy example
```

Keep commits focused. Squash fixups before merging.
