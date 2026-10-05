# REST API

The web app talks to a small JSON API. You can use it from scripts too. With `OPENRIVE_ACCESS_TOKEN` set, send HTTP
Basic auth (any user name, the token as password).

Base URL: `http://localhost:3000/api`

When the server requires a sign-in ([Accounts and sign-in](authentication.md)), every endpoint except `/health` and
`/auth/*` needs the session cookie from `POST /auth/login`; without it they answer `401`, and `403` when the account
lacks the right. MCP also accepts a Better Auth API key as `Authorization: Bearer <key>`. In login-free mode the API
acts as the local administrator.

## Accounts

| Method & path | Body | Response |
| --- | --- | --- |
| `GET /auth/session` | – | `{ authEnabled, needsSetup, user }` |
| `POST /auth/setup` | `{ name, email?, password }` | `201 { user }` — only while no account exists; becomes the admin |
| `POST /auth/login` | `{ login, password }` | `{ user }` and a session cookie (`login` is a name or email) |
| `POST /auth/logout` | – | `{ ok: true }` |

## Admin (administrators only)

| Method & path | Body | Response |
| --- | --- | --- |
| `GET /admin/stats` | – | counts of users, files and sessions, plus database and server settings |
| `GET /admin/users` | – | `Account[]` (never password hashes) |
| `POST /admin/users` | `{ name, email?, password?, role? }` | `201 Account` |
| `PATCH /admin/users/:id` | `{ name?, email?, password?, role?, disabled?, color? }` | `Account` |
| `DELETE /admin/users/:id?transferTo=<id>` | – | `{ ok, transferredTo }` |
| `GET /admin/sessions` | – | active sessions |
| `DELETE /admin/sessions?session=<id>` or `?user=<id>` | – | `{ ok: true }` |

## Health

| Method & path | Response |
| --- | --- |
| `GET /health` | `{ ok: true, storage: "file" \| "postgres" }` (503 if storage fails). No auth required. |

## Projects

| Method & path | Body | Response |
| --- | --- | --- |
| `GET /projects` | – | `ProjectMeta[]`, newest first |
| `POST /projects` | `{ name, ownerId, doc, riv?, thumbnail?, artboards?, animations?, stateMachines? }` | `201 ProjectMeta` |
| `GET /projects/:id` | – | `{ meta: ProjectMeta, doc: object }` |
| `GET /projects/:id?meta=1` | – | `ProjectMeta` (cheap, used to detect outside changes) |
| `PUT /projects/:id` | any of `{ name, doc, riv, thumbnail, ownerId, sharedWith, artboards, animations, stateMachines, expectedUpdatedAt }` | `ProjectMeta` (`409` when the optimistic version is stale) |
| `DELETE /projects/:id` | – | `{ ok: true }` |
| `POST /projects/:id/duplicate` | `{ ownerId }` | `201 ProjectMeta` |
| `GET /projects/:id/riv` | – | the `.riv` file (`application/octet-stream`) |
| `GET /projects/:id/bundle` | – | a [preview bundle](preview-bundles.md) zip (`application/zip`); `?runtime=cdn` leaves the Rive runtime out |
| `POST /projects/import` | multipart `file=<name>.riv`, optional `name` | `201 ProjectMeta`; validates and imports the `.riv` server-side (100 MB limit) |

- `doc` is the editor document serialized as a **string** (see `src/lib/serialize.ts`: binary data is base64 tagged).
- `riv` is a **base64** string of the exported file.

```ts
interface ProjectMeta {
  id: string; name: string; ownerId: string;
  createdAt: number; updatedAt: number;       // ms since epoch
  thumbnail?: string;                          // PNG data URL
  artboards?: number; animations?: number; stateMachines?: number;
  sharedWith?: string[];                       // user ids
}
```

Creating a project from a template is easiest with the CLI (`openrive new`) or MCP (`create_project`), which build the
document for you.

## MCP API keys

These endpoints are available when Better Auth is enabled. They are intended for AI clients that cannot retain the
browser session cookie. Signed-in users can manage the same keys from the web app's **AI & API** page.

| Method & path | Body | Response |
| --- | --- | --- |
| `POST /mcp/keys` | `{ name?, expiresIn? }` | `201` with the secret (returned only on creation) |
| `GET /mcp/keys` | – | key metadata, never key secrets |
| `DELETE /mcp/keys` | `{ keyId }` | revokes the key immediately |

Use the returned secret only in an `Authorization: Bearer` header when connecting an MCP client to `POST /mcp`.

## Users

| Method & path | Body | Response |
| --- | --- | --- |
| `GET /users` | – | `User[]` (creates an Admin on first call) |
| `POST /users` | `{ name, role?, color? }` | `201 User` |
| `PUT /users/:id` | `{ name?, role?, color? }` | `User` (400 when demoting the last admin) |
| `DELETE /users/:id?transferTo=<userId>` | – | `{ ok: true }`: files move to `transferTo`, or to an admin |

```ts
interface User { id: string; name: string; color: string; role: 'admin' | 'editor' | 'viewer'; createdAt: number }
```

## Examples

```bash
curl -s localhost:3000/api/projects | jq '.[].name'
curl -s -o logo.riv localhost:3000/api/projects/8FaToPnhmAka/riv
curl -s -u any:$OPENRIVE_ACCESS_TOKEN https://openrive.example.com/api/users
```
