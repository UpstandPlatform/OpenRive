Make a button that reacts to hover and click. You'll learn state machines, inputs, transitions and pointer listeners.

**You'll need:** the basics from [Tutorial: Your First Animation](Tutorial-Your-First-Animation).

## 1. Design the button

1. Create a new file (400 × 200).
2. Draw a rectangle (`R`), set its corner radius, and name it **Button**.
3. Add a label with the Text tool (`T`), for example "Click me".

## 2. Make three timelines

Switch to **Animate** (`Tab`) and create three timelines with **New timeline**:

| Timeline | Content |
| --- | --- |
| **Idle** | Button at scale 1, normal color (a single key at frame 0 is enough) |
| **Hover** | Button at scale 1.05 and a lighter color |
| **Press** | Button at scale 0.95 |

Keep each one short (for example 0.2 s) and set them to **One shot**.

## 3. Add inputs

Open the state machine (the blank file already has **State Machine 1**, or use **New state machine**). In the
**Inputs** tab, choose **Add input**:

- **Boolean** named `hover`
- **Trigger** named `press`

## 4. Build the graph

1. Choose **Add state** (or right-click the graph) three times, picking **Idle**, **Hover** and **Press**.
2. Drag from **Entry** to **Idle** to make the first transition.
3. Drag from **Idle** to **Hover**, select the new transition, and add the condition **`hover` is `true`**. Give it a
   **Duration** (for example 150 ms) to blend smoothly.
4. Drag from **Hover** to **Idle** with the condition **`hover` is `false`**.
5. Drag from **Any State** to **Press** with the condition **`press`** (the trigger fires once).
6. Drag from **Press** to **Hover** and turn on **Exit time**, so it returns after the press animation finishes.

## 5. Connect the pointer

In the **Listeners** tab choose **Add listener** three times:

| Target | Event | Action |
| --- | --- | --- |
| Button | Pointer Enter | `hover` → true |
| Button | Pointer Exit | `hover` → false |
| Button | Pointer Down | fire `press` |

## 6. Test it

- Press `Ctrl Enter` (**Run the state machine on the stage**) and hover and click the button right in the editor.
  Inputs update live in the Inputs tab.
- Or open **Preview** (`Ctrl P`).

## 7. Use it in your app

**Code** panel (`Alt C`) › **Embed** shows code with your names filled in, for example for the web:

```js
const rive = new Rive({
  src: '/button.riv',
  canvas: document.getElementById('canvas'),
  stateMachines: 'State Machine 1',
  autoplay: true,
});
```

Pointer listeners work automatically in every runtime. You can also drive `hover` and `press` from your own code.

## What you learned

| Concept | Where |
| --- | --- |
| Inputs (boolean, trigger, number) | State machine › Inputs |
| States and transitions with conditions | State machine graph |
| Exit time and blend duration | Transition properties |
| Pointer listeners | State machine › Listeners |

Compare with the **Interactive Button** and **Toggle Switch** templates. For "follow the cursor" effects, see the
**OpenRive Logo** template.
