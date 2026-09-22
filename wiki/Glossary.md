Rive and OpenRive terms, in alphabetical order.

| Term | Meaning |
| --- | --- |
| **Any State** | A special state in a state machine layer. Transitions from it can fire no matter which state is active. |
| **Artboard** | The canvas that holds a design. A file can have several, and apps choose which one to show. |
| **Asset** | A file embedded in or referenced by a `.riv`: image, font or audio. Managed in the Assets tab. |
| **Auto-key** | In Animate mode, changing a property at the playhead creates a keyframe automatically. |
| **Blend state** | A state that mixes several timelines by an input value. Preserved, but not editable yet. |
| **Bones** | Skeleton used to deform artwork (skinning). Preserved, but not editable yet. |
| **Clipping** | Masking an object's children to a shape. |
| **Condition** | A rule on a transition (for example `hover == true`). All conditions must be true for it to fire. |
| **Constraint** | A rule that positions an object relative to another (for example distance, follow). |
| **Data binding / view model** | Rive's way for apps to set typed properties (numbers, colors, strings…) on a file. OpenRive's Preview can edit them. |
| **Draw order** | Which objects draw on top. In Rive, objects higher in the hierarchy draw on top. |
| **Entry** | The state a layer starts in. Connect it to your first real state. |
| **Exit time** | A transition option: wait until the current timeline has played a given amount before switching. |
| **Input** | A value an app or listener sets on a state machine: **number**, **boolean** or **trigger**. |
| **Interpolation** | How a value moves between keyframes: hold, linear or cubic (easing curves). |
| **Keyframe** | A property's value at a specific frame of a timeline. |
| **Layer (state machine)** | An independent graph of states. Layers run in parallel, for example one for hover and one for blinking. |
| **Listener** | A state machine rule reacting to pointer events on a shape (enter, exit, down, up, move) by changing inputs. |
| **MCP** | Model Context Protocol, a standard way for AI assistants to use tools. OpenRive ships an MCP server. |
| **Nested artboard** | An artboard placed inside another one. Preserved, but not editable yet. |
| **One shot / Loop / Ping pong** | Timeline playback modes: play once, repeat, or play forward then backward. |
| **`.riv`** | Rive's runtime file format: compact binary objects, played by the Rive runtimes. |
| **`.rev`** | The Rive editor's private backup format. Not supported. |
| **Round-trip** | Importing and re-exporting a file. OpenRive's is byte-identical for unmodified files. |
| **Runtime** | The library that plays `.riv` files in an app (web, Flutter, iOS, Android, …). |
| **State** | A node in a state machine, usually playing one timeline. |
| **State machine** | A graph of states and transitions driven by inputs. It makes a file interactive. |
| **Theme color** | An OpenRive color variable that fills, strokes and keyframes can link to. Themes swap all values at once. |
| **Timeline** | An animation: keyframes over time with a duration, fps, speed and loop mode. |
| **Transition** | An arrow between two states, with conditions, a duration (blend) and optional exit time. |
| **Trigger** | An input that fires once, like a button press, instead of holding a value. |
| **Trim path** | A stroke effect that draws only part of a path. Used for spinners and "drawing" effects. |
