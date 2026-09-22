# MCP server

OpenRive includes a [Model Context Protocol](https://modelcontextprotocol.io) server, so AI assistants can create and
edit Rive animations for you: *"Make a loading animation with three bouncing dots in brand purple that pauses when
clicked."*

It runs over **stdio** and uses the same storage as the app. Open the printed editor link to watch the result appear
live.

## Connect a client

### Claude Code

The repo includes `.mcp.json`. Open the project in Claude Code and approve the **openrive** server.

### Claude Desktop, Cursor, Windsurf, VS Code and others

Add a server entry (adjust the path):

```json
{
  "mcpServers": {
    "openrive": {
      "command": "node",
      "args": ["/path/to/openrive/bin/openrive.cjs", "mcp"],
      "env": { "OPENRIVE_DATA_DIR": "/path/to/openrive/data" }
    }
  }
}
```

With PostgreSQL, set `DATABASE_URL` in `env` instead of `OPENRIVE_DATA_DIR`.

Using Docker? Run it inside the container:

```json
{ "command": "docker", "args": ["compose", "-f", "/path/to/openrive/docker-compose.yml", "exec", "-T", "openrive", "openrive", "mcp"] }
```

## Tools (27)

| Area | Tools |
| --- | --- |
| Projects | `list_projects`, `list_templates`, `create_project`, `get_project`, `import_riv`, `export_riv`, `delete_project`, `inspect_riv` |
| Design | `add_artboard`, `add_shape`, `add_path`, `add_text`, `add_group`, `set_properties`, `delete_objects` |
| Animation | `add_timeline`, `add_keyframes` |
| State machines | `add_state_machine`, `add_input`, `add_state`, `add_transition`, `add_listener` |
| Theme colors | `define_theme_color`, `use_theme_color`, `set_theme_color_value`, `add_theme`, `switch_theme` |

Objects, timelines, states and inputs can be referenced **by name**, so assistants don't need to track ids.
`get_project` returns a compact outline of the file for the model to reason about.

## Tips for prompting

- Name things ("a circle called *Ball*"). Later instructions can then refer to them.
- Ask for a state machine explicitly when you want interactivity ("add a hover input and listener").
- Ask it to "use theme colors" to get recolorable files.
- Review in the editor: every change is a normal edit, and you can keep refining by hand.

## Test

```bash
npm run test:mcp        # starts the server, creates a project, animates it and exports it
```
