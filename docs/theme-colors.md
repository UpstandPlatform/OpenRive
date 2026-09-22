# Theme colors

Theme colors are named color variables. Define a color once, link fills, strokes, gradient stops and color keyframes
to it, and changing the color updates every linked place. Group colors into **themes** (for example Light and Dark)
and switch themes to recolor the whole file.

## Using theme colors

1. Open the **Theme** tab in the left panel (`Alt T` cycles Layers → Theme → Assets).
2. Click **+** to add a color, name it (for example *Brand*), and pick its value.
3. Select a shape and open its fill color picker. Click a color in the **Theme colors** row to link it. Linked
   colors show a chain icon.
   - Or right-click the shape › *Fill theme color* / *Stroke theme color*.
   - Or click **+ Save** in any color picker to turn the current color into a new theme color.
4. Edit the theme color: everything linked to it changes.

To unlink, pick a plain color in the picker.

## Themes

- **New theme** copies the current theme. Change its colors, then switch between themes from the Theme tab.
- Each theme stores its own value for every theme color.
- The active theme is saved with the project.

## In exported files

Exported `.riv` files contain the **resolved colors of the active theme**, so they play in every runtime without
extra setup. Theme links and the other themes are editor data, stored in the project's `doc.json`.

To ship several themes, switch theme and export once per theme, or keep one file and drive colors at run time with
Rive data binding in your app.

## From code

```js
// Code panel script, CLI-driven automation or MCP
api.defineColor(doc, 'Brand', '#0068ff');
api.applyThemeColor(doc, 'Tile', 'Brand');          // link a shape's fill
api.addKeyframes(doc, { animation: 'Intro', object: 'Tile', property: 'fill',
  keys: [{ time: 0, themeColor: 'Brand' }, { time: 1, value: '#ffffff' }] });
```

MCP tools: `define_theme_color`, `use_theme_color`, `set_theme_color_value`, `add_theme`, `switch_theme`.
