# REST API

The web app talks to a small JSON API. You can use it from scripts too. With `OPENRIVE_ACCESS_TOKEN` set, send HTTP
Basic auth (any user name, the token as password).

Base URL: `http://localhost:3000/api`

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
| `PUT /projects/:id` | any of `{ name, doc, riv, thumbnail, ownerId, sharedWith, artboards, animations, stateMachines }` | `ProjectMeta` |
| `DELETE /projects/:id` | – | `{ ok: true }` |
| `POST /projects/:id/duplicate` | `{ ownerId }` | `201 ProjectMeta` |
| `GET /projects/:id/riv` | – | the `.riv` file (`application/octet-stream`) |

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
