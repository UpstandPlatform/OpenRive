# MCP server

OpenRive includes a [Model Context Protocol](https://modelcontextprotocol.io) server, so AI assistants can create and
edit Rive animations for you: *"Make a loading animation with three bouncing dots in brand purple that pauses when
clicked."*

It runs over **stdio** or the web app's authenticated **Streamable HTTP** endpoint and uses the same storage as the
app. Open the returned editor link to watch the result appear live.

The web app's **AI & API** page is the central connection surface. It shows the correct MCP endpoint for the current
edition, lets signed-in cloud and self-hosted users create or revoke scoped API keys, and explains the key-free local
CLI or desktop connection.

## Connect a client

### Claude Code

The repo includes `.mcp.json`. Open the project in Claude Code and approve the **openrive** server.

### Claude Desktop, Cursor, Windsurf, VS Code and others

Add a server entry (adjust the path):

```json
{
  "mcpServers": {
    "openrive": {
      "command": "bun",
      "args": ["/path/to/OpenRive/apps/cli/src/mcp-server.ts"],
      "env": { "OPENRIVE_DATA_DIR": "/path/to/openrive/data" }
    }
  }
}
```

With PostgreSQL, set `DATABASE_URL` in `env` instead of `OPENRIVE_DATA_DIR`.

Using Docker? Run it inside the container:

```json
{ "command": "docker", "args": ["compose", "-f", "/path/to/OpenRive/docker-compose.yml", "exec", "-T", "openrive", "openrive", "mcp"] }
```

## Cloud and self-hosted HTTP MCP

Authenticated self-hosted and cloud deployments expose MCP at `/api/mcp`. Create a short-lived, user-scoped bearer
key from a signed-in browser session:

```bash
curl -sS -X POST https://openrive.example.com/api/mcp/keys \
  -H 'content-type: application/json' \
  -H 'cookie: openrive.session_token=…' \
  -d '{"name":"Claude","expiresIn":7776000}'
```

The response contains the secret once. Store it in the AI client and connect its Streamable HTTP transport to
`https://openrive.example.com/api/mcp` with `Authorization: Bearer <key>`. Keys can be listed with `GET /api/mcp/keys`
and revoked with `DELETE /api/mcp/keys` and `{"keyId":"…"}`. The key is hashed in PostgreSQL, rate-limited, and
scoped to the account that created it.

Remote clients send `.riv` bytes to `import_riv` as `dataBase64`; `export_riv` returns `dataBase64` when no local path
is supplied. Remote MCP never accepts server filesystem paths. A multi-instance cloud deployment must keep one MCP
session on the same application instance (sticky routing), because the MCP transport is stateful; a single-instance
self-hosted server and the desktop app need no extra service.

The local desktop app serves the same `/api/mcp` route on its loopback origin. Its bundled server has authentication
off by default and is bound to `127.0.0.1`; use the loopback URL shown by the desktop integration when configuring a
local AI client.

## Tools (30)

| Area | Tools |
| --- | --- |
| Projects | `list_projects`, `list_templates`, `create_project`, `get_project`, `import_riv`, `export_riv`, `delete_project`, `inspect_riv` |
| Design | `add_artboard`, `add_shape`, `add_path`, `add_text`, `add_group`, `set_properties`, `delete_objects` |
| Animation | `add_timeline`, `add_keyframes` |
| State machines | `add_state_machine`, `add_state`, `add_transition`, `add_listener` |
| Data binding | `add_property`, `set_property_value`, `convert_inputs_to_data_binding` (and the deprecated `add_input`) |
| Theme colors | `define_theme_color`, `use_theme_color`, `set_theme_color_value`, `add_theme`, `switch_theme` |

Objects, timelines, states and properties can be referenced **by name**, so assistants don't need to track ids.

Assistants are told to use data binding properties rather than state machine inputs, which Rive deprecated:
transitions read a property, listeners set one, and `convert_inputs_to_data_binding` migrates an older file.
See [data binding](data-binding.md).
`get_project` returns a compact outline of the file for the model to reason about.

## Tips for prompting

- Name things ("a circle called *Ball*"). Later instructions can then refer to them.
- Ask for a state machine explicitly when you want interactivity ("add a hover input and listener").
- Ask it to "use theme colors" to get recolorable files.
- Review in the editor: every change is a normal edit, and you can keep refining by hand.

## Test

```bash
bun run test:mcp        # starts the server, creates a project, animates it and exports it
```
