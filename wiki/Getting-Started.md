Get OpenRive running and make something move in about five minutes.

## 1. Install and start

You need [Bun](https://bun.sh) 1.4 or newer (`curl -fsSL https://bun.sh/install | bash`, or `powershell -c "irm bun.sh/install.ps1 | iex"` on Windows).

```bash
git clone https://github.com/UpstandPlatform/OpenRive.git
cd OpenRive
bun install
bun run dev
```

Open **http://localhost:3000**.

> Prefer Docker? Run `docker compose up -d` instead. See [Self-Hosting](Self-Hosting).

## 2. Look around the welcome project

On first start there's one project, **Welcome to OpenRive**. Open it and:

1. Press **Preview** (`Ctrl P`) and move your mouse over the logo. The eye follows the cursor, grows on hover, and
   bounces when you click.
2. Go back to the editor and press `Tab` to switch to **Animate** mode. The timeline panel shows the timelines
   (*Intro*, *Blink*, …), and the state machine graph shows how they connect.
3. Open the **Theme** tab (left panel) and switch between *Light* and *Dark*.

## 3. Start from a template

Go back to **Files** (click the logo) and choose **Templates**. Each template teaches one thing:

| Template | Teaches |
| --- | --- |
| Bouncing Ball | Timelines and easing |
| Interactive Button | Hover and press with pointer listeners |
| Toggle Switch | Boolean inputs |
| Loading Spinner | Strokes and trim paths |
| Favorite Star | Trigger inputs |
| Text & Themes | Text and switchable theme colors |

See [Templates](Templates) for all of them, including two real-world example files.

## 4. Export

Press **Export** (`Ctrl E`) to download the `.riv`. Open the **Code** panel (`Alt C`) › **Embed** to copy code for Web,
React, Flutter, iOS or Android that plays it.

## Next

- [Tutorial: Your First Animation](Tutorial-Your-First-Animation)
- [Tutorial: Interactive Button](Tutorial-Interactive-Button)
- [Keyboard Shortcuts](Keyboard-Shortcuts)
