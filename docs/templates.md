# Templates & example files

Pick a template on the Files page (**Templates** or **New file**), run `openrive new "Name" --template <id>`, or
ask an AI assistant via MCP (`create_project`). Each template is a small lesson in one Rive feature.

| Id | Name | What it teaches |
| --- | --- | --- |
| `blank` | Blank | An empty 500×500 artboard with a timeline and a state machine |
| `openrive-logo` | OpenRive Logo | **Mouse interaction.** The eye's iris and glint follow the cursor (listener align target plus distance constraints), dilate on hover, blink on their own, and bounce when clicked. Light and Dark themes. |
| `upstand-logo` | Upstand Logo | **Brand intro.** The italic marks slide in, a clipped shine sweeps across the tile, then it floats. Hover lifts it, click replays. Blue and Mono themes. |
| `bouncing-ball` | Bouncing Ball | Timelines, easing, squash & stretch |
| `interactive-button` | Interactive Button | Hover and press states from pointer listeners |
| `toggle-switch` | Toggle Switch | A boolean input driving two states |
| `loading-spinner` | Loading Spinner | Strokes and trim paths |
| `favorite-star` | Favorite Star | A trigger input with a springy one-shot |
| `hello-text` | Text & Themes | Text objects, theme colors, Light/Dark switching |

## Example files

Real-world files made in the Rive editor, from the official
[rive-runtime](https://github.com/rive-app/rive-runtime) test suite (MIT, © Rive). They show features beyond the
templates:

| Id | Name | Shows |
| --- | --- | --- |
| `off-road-car` | Off-road Car | Several looping timelines playing together (wheels, body bounce, wipers) |
| `death-knight` | Death Knight | Bones, nested artboards and a 4-layer state machine (walk, attack, facing, death) |

"Open a copy" creates a normal project you can edit.

## The first-run project

On first start OpenRive creates **Welcome to OpenRive** from `openrive-logo`, so there's something interactive to
open right away. Delete it any time. It won't come back.

## Adding a template

Templates are code in `packages/rive/src/templates*.ts`, built with the same API as the CLI and MCP. See
[contribution/templates.md](../contribution/templates.md).
