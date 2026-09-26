# Data binding

Data binding properties are how a Rive file and your app talk to each other: the file exposes named
properties, transitions and listeners read and write them, and your code sets them at runtime.

They replace **state machine inputs**, which Rive
[deprecated](https://rive.app/docs/editor/data-binding/migration-guide#state-machine-inputs). Files with
inputs still play — Rive kept them working — but runtimes log a deprecation warning the moment your code
touches the inputs API:

```
[Rive: state-machine-inputs] State machine inputs are deprecated and will be removed in a future major
version: please use data binding properties instead.
```

Properties do everything inputs did, plus strings and colors, and no runtime warns about them.

| | State machine input | Data binding property |
| --- | --- | --- |
| Types | number, boolean, trigger | number, boolean, trigger, **string**, **color** |
| Scope | one state machine | the whole artboard |
| Runtime API | `rive.stateMachineInputs(…)` (deprecated) | `rive.viewModelInstance` |
| Drives | transitions | transitions, and anything else bound to the property |

## Properties in the editor

The **Data** tab sits beside Listeners under the state machine graph (Animate mode).

- **Add property** → number, boolean, trigger, string or color. The value you set there is the value the
  file starts with.
- Right-click a property to rename or delete it. Deleting also removes the conditions and listener actions
  that used it, so the file stays valid.
- **Preview** (`Ctrl P`) lists the properties of the running file and lets you change them live, which is
  the quickest way to check a transition.

Transitions and listeners pick up properties automatically: a condition compares a property, and a
listener action sets one.

## Converting a file that still uses inputs

Use **Convert inputs to data binding** — in the Data tab when a file still has inputs, from the canvas
right-click menu, or from the command list. It does what Rive's own "Convert Inputs to View Models" does:

1. creates a property for every input, with the same name, type and starting value,
2. rewrites every transition condition to read the property,
3. rewrites every listener action to set it,
4. removes the inputs.

Anything it cannot express with data binding keeps its input, and the editor says which and why:

| Kept because | What to do |
| --- | --- |
| a listener **toggles** it | data binding has no toggle; set the property to `true` or `false` from two listeners, or use a converter in Rive |
| a **blend state** reads it | blend states driven by data binding are not editable in OpenRive yet |
| a **nested artboard** input reads it | convert the nested artboard first |

Converting changes the runtime contract: code that called `stateMachineInputs` must move to
`viewModelInstance` (the [Code panel](code-panel.md) regenerates the snippet for you).

## Runtime code

With `autoBind: true` the runtime binds the file's default instance, and properties are read and written
through it:

```js
import { Rive } from '@rive-app/canvas';

const rive = new Rive({
  src: '/button.riv',
  canvas: document.getElementById('canvas'),
  stateMachines: 'Button',
  autoplay: true,
  autoBind: true,
});

rive.on('load', () => {
  const vm = rive.viewModelInstance;
  vm.boolean('isHover').value = true;
  vm.number('level').value = 3;
  vm.string('label').value = 'Buy now';
  vm.color('tint').value = 0xff3d8bd0;
  vm.trigger('press').trigger();

  vm.boolean('isHover').on((value) => console.log('isHover is now', value));
});
```

React uses hooks over the same instance (`useViewModelInstanceBoolean`, `…Number`, `…String`, `…Color`,
`…Trigger`). The Code panel's **Embed** tab writes the snippet for the file you have open, and
[preview bundles](preview-bundles.md) ship a player that already drives the properties.

For other runtimes, see Rive's [data binding docs](https://rive.app/docs/runtimes/data-binding).

## Automation

The same operations are available to scripts, the CLI and AI assistants:

| API (`@openrive/rive`) | MCP tool |
| --- | --- |
| `addDataProperty(doc, { name, type, value })` | `add_property` |
| `setDataProperty(doc, { property, value })` | `set_property_value` |
| `convertInputs(doc, { artboard })` | `convert_inputs_to_data_binding` |
| `addTransition(doc, { conditions: [{ property, op, value }] })` | `add_transition` |
| `addListener(doc, { actions: [{ property, value }] })` | `add_listener` |

`get_project` lists each artboard's properties, so an assistant can see what a file exposes before
editing it. Lower level helpers (`addProperty`, `propertyCondition`, `propertyListenerAction`,
`removeProperty`) live in `packages/rive/src/databind.ts`.

## What OpenRive does not author yet

- binding a property to a shape's own properties (a color property driving a fill, a string driving a text
  run) — OpenRive reads and preserves these bindings in files that have them, but cannot create them,
- enum and list properties, nested view models, and data converters,
- blend states driven by properties.

Files that use those features import, edit and export byte for byte as usual; they simply cannot be
created from the editor yet. Theme colors are a separate, editor-only feature — see
[theme colors](theme-colors.md).
