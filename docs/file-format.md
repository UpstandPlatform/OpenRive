# The .riv format in OpenRive

A `.riv` file is a compact binary stream of **objects**, each with a type key and a list of properties. OpenRive's
reader/writer is generated from the runtime's own type definitions, so it knows every object and property the
runtime knows.

## Structure

```
"RIVE"  majorVersion  minorVersion  fileId          (varuints)
Table of contents: property keys + field types for properties the runtime may not know
Object stream:     typeKey  (propertyKey value)*  0
                   typeKey  (propertyKey value)*  0
                   …
```

Field types: `uint` (varuint), `double` (float32), `string`, `bytes`, `color` (uint32 ARGB), `bool`.

The object stream is flat. The hierarchy comes from order and references:

- **File level**: `Backboard`, file assets (`ImageAsset`, `FontAsset`, `AudioAsset`) each followed by
  `FileAssetContents` with the bytes, view models, …
- **Artboards**: each `Artboard` is followed by its components. `Component.parentId` is an **index into the
  artboard's component list**.
- **Animations** (`LinearAnimation` → `KeyedObject` → `KeyedProperty` → `KeyFrame*`) and **state machines** (inputs,
  layers, states, transitions, conditions, listeners) follow their artboard.

References by index use several index spaces: components, animations, state machines, states, inputs, file assets
and artboards. Some types, such as interpolators and non-instantiable types, occupy slots too. Getting these spaces
right is the core of lossless editing.

## How OpenRive handles it

1. `riv-format.ts` reads the stream into raw objects, keeping unknown properties and the original ToC.
2. `document.ts` builds a tree and replaces index references with stable string ids (`refSpaceOf`), so edits never
   break references.
3. On export, ids are turned back into indices, objects are written in array order (which is **draw order**: earlier
   drawables draw on top), and the original ToC and property order are reused.

Unmodified files round-trip **byte for byte**. `openrive validate file.riv` checks any file, and `bun run test:corpus`
checks Rive's test suite.

## Editor-only data

Theme links, themes, scripts and some UI state (artboard positions, collapsed layers) live in the project's
`doc.json` under `editor` and `ui` fields. They are never written to the `.riv`. The exported file contains resolved
values only.

## What can be edited

| Feature | Status |
| --- | --- |
| Artboards, shapes, paths, groups, fills/strokes/gradients, trim paths, blend modes | Full editing |
| Text (runs, styles, fonts) | Full editing |
| Images, SVG import, fonts | Assets tab |
| Timelines, keyframes, interpolation | Full editing |
| State machines, inputs, transitions, conditions, pointer listeners | Full editing |
| Clipping, distance constraints, listener align-target | Via API/templates; preserved in the editor |
| Bones & skinning, meshes, other constraints, nested artboards, blend states, layouts, data binding, events, audio, scripts | **Preserved** and playable; no dedicated editing UI yet |

## Not supported

- **`.rev` files**: the Rive editor's private backup format isn't public. Export a `.riv` from Rive instead.
- **Rive scripting (Luau)**: scripts must be signed by Rive to run. See [Code panel](code-panel.md#rive-scripting).
