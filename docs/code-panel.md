# Code panel

Open it with the **Code** button in the top bar or `Alt C`. It has three tabs.

## Scripts: automate edits with JavaScript

Scripts are small JavaScript programs that edit the open file through the **OpenRive API**, the same API the CLI,
MCP server and templates use. Use them for repetitive or generative work: grids, bulk renames, recoloring, keying
many objects at once, importing generated SVG.

- **New script**, or **From example…** (Grid of dots, Pulse every shape, Theme color from fills, Inspect the file)
- **Run** with the button or `Ctrl Enter`. A run is applied as **one undoable change**.
- Errors are shown in the console, and nothing is changed when a script throws.
- Scripts are saved with the project (editor data, not written to the `.riv`).

### Globals

| Name | What |
| --- | --- |
| `doc` | The document (a copy; your changes are applied when the script finishes) |
| `artboard` | Id of the active artboard. Pass it as `artboard` to API calls. |
| `api` | The OpenRive API (below) |
| `log(...values)` | Print to the console (objects are pretty-printed) |

### API overview

All functions take `doc` first. Objects, timelines, state machines and inputs can be referenced by **id or name**.

| Area | Functions |
| --- | --- |
| Read | `outline(doc)`, `getArtboard(doc, ref)`, `getObject(doc, ref)` |
| Create | `addArtboard`, `addShape({kind, x, y, width, height, fill, stroke, cornerRadius…})`, `addPath({points, closed})`, `addText({text, fontSize, color…})`, `addGroup`, `importSvg(svg, {artboard, x, y, width})` |
| Edit | `setProperties(doc, ref, {x, y, rotationDegrees, opacity, fill…})`, `setText`, `deleteObjectsByRef` |
| Animate | `addAnimation({name, duration, fps, loop})`, `addKeyframes({animation, object, property, keys: [{time, value, ease}]})` |
| Interactivity | `addStateMachine`, `addInput`, `addState`, `addTransition`, `addListener`, `addDistanceConstraint`, `addClip` |
| Theme | `defineColor(doc, name, color)`, `applyThemeColor(doc, ref, name)`, `addTheme`, `applyTheme` |
| Assets | `fileAssets(doc)`, `addImageAsset`, `addFontAsset`, `placeImage`, `removeAsset` |
| Colors | `parseColor('#rrggbb' / 'rgba(…)' / 'hsl(…)')`, `formatColor` |

Full signatures: [`packages/rive/src/api.ts`](../packages/rive/src/api.ts). They match the [MCP tools](mcp.md) one to one.

### Example

```js
// A row of five squares that pop in one after another
const anim = api.addAnimation(doc, { artboard, name: 'Pop', duration: 1.5 });
for (let i = 0; i < 5; i++) {
  const sq = api.addShape(doc, { artboard, kind: 'rectangle', name: `Square ${i}`,
    x: 70 + i * 90, y: 250, width: 60, height: 60, cornerRadius: 12, fill: '#0068ff' });
  for (const property of ['scaleX', 'scaleY'])
    api.addKeyframes(doc, { artboard, animation: anim.id, object: sq.id, property, keys: [
      { time: 0, value: 0, ease: 'hold' },
      { time: i * 0.15, value: 0, ease: 'easeOutBack' },
      { time: i * 0.15 + 0.4, value: 1 },
    ]});
}
log('done');
```

Scripts run in your browser with full access to the page, like the browser console. Only run scripts you trust.

## Embed: runtime code for your app

Ready-to-paste snippets for **Web (JS)**, **React**, **Flutter**, **iOS (SwiftUI)** and **Android**, filled in with this
file's artboard, state machine and input names. Export the `.riv` (`Ctrl E`), add it to your app, and paste the
snippet.

## Rive scripting

The rive.app editor's own **Scripting** feature runs Luau scripts inside the Rive runtime. Those scripts are compiled
and **signed with Rive's private key**, and the official runtimes skip scripts without a valid signature. A
third-party editor therefore can't produce Rive scripts that run. OpenRive's Scripts tab works at design time
instead, and produces plain `.riv` files that play everywhere.

Script assets in files made with rive.app are **preserved** when you open and save them in OpenRive.
