# Text & assets

## Text

Rive text objects are fully supported and render with the official text engine.

- **Create**: choose the Text tool (`T`), click on the artboard, and type. `Esc` or clicking outside finishes.
- **Edit**: double-click the text, or select it and press `Enter`.
- **Style** (Inspector › Text): font, size, line height, letter spacing, alignment, auto width / auto height / fixed
  size, overflow, and fill color (which can be a theme color).
- **Fonts**: Inter Regular and Bold are bundled and embedded automatically. Upload a `.ttf`/`.otf` from the inspector,
  or import one in the Assets tab.

Fonts are embedded in the `.riv` in full. Inter adds about 340 KB, and font subsetting is not implemented yet.

## Assets tab

The **Assets** tab (next to Theme) lists every file asset in the project: images, fonts and others.

### Importing

Click **Import asset**, or drop files onto the Assets tab **or directly onto the canvas**:

| File | Result |
| --- | --- |
| `.png`, `.jpg`, `.webp` | An **image asset**, embedded in the `.riv`, and an **Image** placed at the artboard's center (scaled to fit) |
| `.svg` | **Vector shapes**: circles, ellipses and rectangles become parametric shapes, and paths become editable pen paths, grouped under one node. Fills, strokes, opacity, transforms and CSS classes are converted. |
| `.ttf`, `.otf` | A **font asset**, usable from the text inspector |

### Using assets

- **Place on artboard**: double-click an image asset, click its **+** button, or drag it onto the canvas. One asset can
  be placed many times.
- Images behave like other objects: move, scale, rotate, change opacity, animate, and use them as clipping targets.
- **Right-click** an asset to rename, download or delete it. Deleting an image asset also removes the images that use
  it. A font in use by text can't be deleted.
- The list shows each asset's size, whether it's embedded, and how many objects use it.

### Assets in imported files

Files from the Rive editor can reference **hosted** (CDN) or **referenced** assets instead of embedding them. These
are listed as "referenced (not embedded)" and preserved on save. Your app then provides them at run time, as in the
official runtimes.

## SVG import from code

```js
// Code panel script
const ab = api.getArtboard(doc, artboard);
api.importSvg('<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="#0068ff"/></svg>',
  { artboard: ab, x: 250, y: 250, width: 200, name: 'Dot' });
```

The importer lives in `packages/rive/src/svg.ts` and is DOM-free, so it also works in Node (CLI/MCP).
