# User guide

## Files page

The home page lists the projects you can see. Each card plays its animation live on hover.

- **Templates**: start from a template or example file (see [Templates](templates.md)).
- **New file**: a blank file with artboard size presets (phone, tablet, desktop, social, icon…).
- **Import**: drop `.riv` files anywhere on the page, or use the Import button.
- Use a card's **⋯** menu to **rename, duplicate, share, download** or **delete** it; click to open it.

## The editor

```
┌──────────────────────────── Top bar: menu, tools, Design/Animate, Code, Preview, Export ──────────┐
│ Layers │ Theme │ Assets │                                                    │   Inspector        │
│  hierarchy / theme      │                   Stage (canvas)                   │   properties of    │
│  colors / assets        │                                                    │   the selection    │
│                         ├────────────────────────────────────────────────────┤                    │
│                         │ Code panel (Alt+C) · Timeline & state machine (Animate mode)              │
└─────────────────────────┴────────────────────────────────────────────────────┴────────────────────┘
```

Changes save automatically. The title shows "Saving…" and then "All changes saved". If another tool (the CLI, MCP
or another tab) changes the file while it's open, a banner lets you reload or keep your version.

### Design mode

| Tool | Key | Use |
| --- | --- | --- |
| Select | `V` | Click to select, `Shift` to add, drag to marquee. Drag handles to resize and rotate. |
| Artboard | `A` | Drag to create an artboard |
| Rectangle, Ellipse, Triangle, Polygon, Star | `R` `O` `Y` `Shift R` `Shift O` | Drag to draw. Hold `Shift` for equal sides. |
| Pen | `P` | Click to add points, drag for curves, click the first point to close |
| Text | `T` | Click to add text, then type. Double-click text to edit it later. |
| Hand | `H` / hold `Space` | Pan. Scroll with `Ctrl` to zoom. |

- **Groups**: `Ctrl G` / `Ctrl Shift G`.
- **What a click selects** is set by the **Groups** checkbox in the toolbar (`Alt G`):
  - **on** (default): a click selects the whole group. **Double-click** enters the group and selects the item under the
    cursor; double-clicking a nested group goes one level deeper. A chip at the top of the canvas shows which group you
    are inside, and `Esc` steps back out one level.
  - **off**: a click selects the exact object under the cursor, however deeply it is nested.
  Either way, `Enter` goes inside the selection and `Shift Enter` selects the parent.
- **Paths**: double-click a shape, or press `Enter`, to edit its vertices.
- **Arrange**: `Ctrl [` / `Ctrl ]` change draw order. In Rive, objects higher in the Layers list draw on top.
- **Inspector**: position, size, rotation, scale, opacity, blend mode, fills and strokes (solid or gradient), corner
  radius, trim path, text styling. Colors can link to [theme colors](theme-colors.md).
- **Masks (clipping)**: draw the mask shape on top, select it together with what it should mask, and choose
  **Use front shape as mask** (`Ctrl Alt M`, also in the right-click menu). The masked objects are drawn only inside
  that shape, and the mask itself is hidden. The **Mask** section of the inspector lists every mask on the selection,
  where you can turn one off with the eye, remove it, or add another shape as an extra mask.
- **Context menus**: right-click objects, layers, the canvas, keyframes, timelines, states and transitions.

### Animate mode (`Tab`)

- **Timelines**: create them in the timeline panel. Set duration, fps, speed and loop (one shot, loop, ping-pong).
- **Auto-key**: in Animate mode, any property you change at the playhead gets a keyframe. `K` keys the selected
  objects' transforms.
- **Keyframes**: drag to move, `Shift`-click to select several, right-click to set interpolation (hold, linear, cubic
  presets) or delete. The curve editor tweaks cubic easing.
- **Playback**: `Enter` play/pause, `,` `.` step frames, `Alt ,` `Alt .` jump between keyframes, `Home`/`End`.

### State machines

State machines make files interactive:

1. Add a state machine and **inputs** (number, boolean, trigger).
2. Add **states** with **Add state** (or right-click the graph) and pick a timeline for each. Drag from one state's
   edge to another state to create a **transition**. Connect Entry (or Any State) to your first state.
3. Select a transition to add **conditions** (for example `hover == true`, or `press` fired) and set its duration.
4. Add **listeners** (Listeners tab): choose a target shape and a pointer event (down, up, enter, exit, move), then
   actions that set a boolean, change a number or fire a trigger. Align-to-pointer ("follow the cursor") listeners
   are available through the API and templates, and are preserved in the editor.
5. Press `Ctrl Enter` to preview the state machine on the stage and interact with it.

### Preview

**Preview** (`Ctrl P`) opens the file full-screen in the official runtime:

- choose the artboard, state machine or timeline ("All timelines" plays every timeline together)
- change inputs, and view model properties for data-bound files
- watch fired events in the log, and switch backgrounds (dark, light, transparent)
- download the `.riv`, or **Bundle** this whole screen as a folder you can ship — see
  [preview bundles](preview-bundles.md)

### Export

**Export** (`Ctrl E`) downloads the `.riv`. Load it with any Rive runtime. The [Code panel](code-panel.md)'s Embed
tab has ready-made snippets.

**Export preview bundle** (`Ctrl Shift E`, in the OpenRive menu) downloads a zip that plays the file on its own:
`index.html`, an `index.js` player, the `.riv` and the Rive runtime. Unzip it, serve the folder, and you have the
preview screen without OpenRive — see [preview bundles](preview-bundles.md).

## Preferences

`Ctrl ,` opens editing defaults: new shape fill (cycle colors or a fixed color), default stroke, text color and size,
interpolation for new keys, nudge distances and pixel snapping. Preferences are saved per browser.

## Undo

Every change can be undone (`Ctrl Z`) and redone (`Ctrl Shift Z` / `Ctrl Y`), including script runs and imports.

See also: [Shortcuts](shortcuts.md) · [Theme colors](theme-colors.md) · [Text & assets](text-and-assets.md) · [Code panel](code-panel.md)
