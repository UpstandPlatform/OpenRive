# Building a template

Templates are small, well-named Rive files built in code, each teaching one idea. They appear in the gallery, the CLI
(`openrive new --template`) and MCP (`create_project`).

## 1. Define it

Add a `Template` to `packages/rive/src/templates.ts`, or to a new file for bigger ones, like `templates-brand.ts`:

```ts
export const pulseDot: Template = {
  id: 'pulse-dot',
  name: 'Pulse Dot',
  description: 'A notification dot that pulses. Shows looping timelines and opacity keys.',
  build() {
    const doc = newDocument({ name: 'Pulse Dot', width: 300, height: 300 });
    api.defineColor(doc, 'Accent', '#ff4d6d');
    const dot = api.addShape(doc, { kind: 'ellipse', name: 'Dot', x: 150, y: 150, width: 60, height: 60 });
    api.applyThemeColor(doc, 'Dot', 'Accent');
    const pulse = api.addAnimation(doc, { name: 'Pulse', duration: 1.2, loop: 'loop' });
    api.addKeyframes(doc, { animation: 'Pulse', object: 'Dot', property: 'scaleX',
      keys: [{ time: 0, value: 1, ease: 'easeInOut' }, { time: 0.6, value: 1.25, ease: 'easeInOut' }, { time: 1.2, value: 1 }] });
    // … scaleY, opacity, a state machine with an input …
    return doc;
  },
};
```

Register it in the `TEMPLATES` array. Order matters: simpler templates come first.

## 2. Guidelines

- **Teach one thing.** Say what it teaches in the description.
- **Name everything** (shapes, timelines, inputs), because names show up in the editor, embed snippets and MCP.
- **Use theme colors** so users can restyle it. Offer a second theme when it makes sense.
- **Interactive?** Add a state machine with clearly named inputs and listeners. Remember that array order is draw
  order, and that listener hit areas must be shapes.
- Keep files small. Avoid embedding big fonts or images unless that's the lesson.
- Everything must work in the **official runtime**: check it in Preview.

## 3. Test

```bash
bun run test                                   # the template must round-trip byte-identical
bun run cli new "Try" --template pulse-dot
```

Open it, press Preview, and interact.

## 4. Document

Add a row to [docs/templates.md](../docs/templates.md).

## Example files

Real-world `.riv` files can be added as examples (`packages/rive/src/examples.ts`, files in `apps/web/public/examples/`) **only if
their license allows redistribution**. Record the source and license in `apps/web/public/examples/README.md`.
