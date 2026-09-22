OpenRive includes an [MCP server](MCP-Server), so AI assistants such as Claude, Cursor or VS Code agents can create
and edit Rive files for you. The results are ordinary projects you can keep editing by hand.

## 1. Connect your assistant

**Claude Code:** open the OpenRive folder. The included `.mcp.json` registers the **openrive** server. Approve it
when asked.

**Other clients** (Claude Desktop, Cursor, …): add this to the client's MCP configuration and restart it:

```json
{
  "mcpServers": {
    "openrive": {
      "command": "bun",
      "args": ["/path/to/OpenRive/apps/cli/src/mcp-server.ts"]
    }
  }
}
```

Keep OpenRive running (`bun run dev`) if you want to watch the changes live in the browser.

## 2. Ask for an animation

Try prompts like:

> Create a new OpenRive project called "Loader" with three dots in a row. Make them bounce one after another in a
> loop, using a theme color called Brand set to #0068ff.

> In "Loader", add a state machine with a boolean input `paused`. When it's true, switch to a still timeline. Add a
> click listener on the artboard that toggles it.

> Add a Dark theme to "Loader" where Brand is #7cc4ff, and switch to it.

The assistant replies with an editor link, such as `http://localhost:3000/editor/<id>`. An open editor tab picks up
changes within a couple of seconds.

## 3. Refine

- Keep talking: "make the bounce higher", "slow it down to 1.5 s", "rename the dots".
- Or edit by hand. The assistant's changes are normal objects, keyframes and states.
- Ask it to **inspect** a file: "describe the structure of CyFit-Robot" uses `get_project` / `inspect_riv`.

## Tips

- **Name things** in your prompts. Later instructions can then refer to them.
- Ask explicitly for **state machines**, **inputs** and **listeners** when you want interactivity.
- Say **"use theme colors"** for recolorable files.
- Keep prompts focused. Several small steps work better than one huge request.

## What the assistant can do

27 tools covering projects, shapes and paths, text, groups, properties, timelines and keyframes, state machines
(inputs, states, transitions, listeners) and theme colors. See the full list in [MCP Server](MCP-Server).

Prefer scripting yourself? The [Code Panel](Code-Panel) runs JavaScript with the same API inside the editor.
