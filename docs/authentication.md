# Accounts and sign-in

OpenRive has two ways of knowing who you are:

| Mode | When | What it looks like |
| --- | --- | --- |
| **Login-free** | a local run or the desktop app | pick a user from the header, as OpenRive has always worked |
| **Sign-in** | self-hosted (a `DATABASE_URL` is set) | an email and a password, sessions, and an admin dashboard |
| **Cloud sign-in** | `OPENRIVE_EDITION=cloud` | mandatory Better Auth sign-in, verified email ownership, PostgreSQL sessions and Redis rate limits |

Set `OPENRIVE_AUTH` to choose explicitly:

```env
OPENRIVE_AUTH=auto   # default: sign-in required when DATABASE_URL is set
OPENRIVE_AUTH=on     # always require sign-in (also with the embedded database)
OPENRIVE_AUTH=off    # never require sign-in (single user on a trusted machine)
```

Cloud deployments always require authentication; `OPENRIVE_AUTH=off` is rejected by startup configuration.

Accounts are handled by [Better Auth](https://better-auth.com): email and password, no external provider. On shared
servers, workspaces use Better Auth's organization plugin and global account administration uses its admin plugin.

## The first account

Open the server in a browser. With nobody registered yet, OpenRive sends you to **/signup** to create the
administrator account: a name, an email and a password of at least 8 characters. The first account to exist becomes
the **administrator**; everyone who signs up later is an **editor**. In cloud, OpenRive emails a verification link
and does not create a usable session until the address is verified. Sign-in attempts for an unverified account resend
the link, and the verification page can send another link on request.

In cloud, configure `RESEND_API_KEY` and `OPENRIVE_EMAIL_FROM` to send verification and workspace invitation emails.
The sender must be verified in Resend. OpenRive requires verified email ownership before any cloud service is
available, including existing browser sessions and MCP/API-key requests. Self-hosted instances can use SMTP via
`OPENRIVE_SMTP_URL` and `OPENRIVE_EMAIL_FROM`, or Resend by setting `RESEND_API_KEY`; email verification remains
optional there. Delivery errors do not leave a pending workspace invitation behind.
CLI and MCP API-key clients can select a workspace per request with the
`X-OpenRive-Organization-Id` header. OpenRive validates membership and role on
every request; the header never grants access by itself. A stateful MCP session
is bound to the workspace selected when it starts; create a new MCP session to
switch workspace. Stateless MCP requests can select a workspace independently.

## Workspaces and members

Open **Workspaces** from the top bar on a sign-in-enabled server. Create a workspace, select which one receives new
files, and manage its members and invitations. Existing projects remain personal; workspace projects are visible only
to members of that workspace (and global administrators). Select **Personal** to create private projects again.

Workspace roles are independent of global account roles:

| Workspace role | Can |
| --- | --- |
| **Owner** | Manage members, assign administrators, rename the workspace, and transfer ownership |
| **Administrator** | Invite members and manage editor/viewer access |
| **Editor** | Create and edit workspace projects |
| **Viewer** | Open and preview workspace projects |

Invitations expire after seven days. Invitees must sign in with the invited email address and verify ownership of that
address. Workspace ownership must be transferred before its owner account can be deleted. Owners can delete a
workspace from its Danger zone in Workspace settings; that operation removes the workspace's projects and invitations
in one database transaction, clears active workspace selections, and then best-effort deletes uploaded assets. Personal
projects are never reassigned or deleted by this operation. Better Auth's direct organization-deletion endpoint stays
disabled so it cannot bypass this cleanup path.

## Who may sign up

```env
OPENRIVE_SIGNUP=first   # default: only the initial administrator can sign up
OPENRIVE_SIGNUP=first   # only the administrator account; an admin adds the rest
OPENRIVE_SIGNUP=off     # nobody: accounts are created with `openrive users add`
```

The server enforces this, not just the page: a refused sign-up creates nothing.

> On a server reachable from the internet, set `OPENRIVE_SIGNUP=first` (or `off`) unless you really want anyone
> passing by to have an account. Put the server behind HTTPS before anyone signs in over a network — see
> [Self-hosting](self-hosting.md#https-with-a-reverse-proxy).

## Roles

| Role | Can |
| --- | --- |
| **Admin** | Everything: the dashboard, accounts, sessions, and every file |
| **Editor** | Create files, and edit their own and files shared with them |
| **Viewer** | Open and preview every file, change nothing |

Roles are enforced by the server, not just hidden in the interface: the API answers `401` without a session and `403`
when the account may not do something.

## The admin dashboard

`/admin` (also in the user menu) shows:

- how many accounts, files, artboards, animations and state machines the instance holds
- which database is in use, whether sign-in and the access token are on, and where the data folder is
- **Accounts**: create one, change name, email, role or password, disable an account, sign it out everywhere, or
  delete it — the files of a deleted account move to an administrator
- **Sessions**: who is signed in, from which browser and until when, with a button to end any of them

Changing a password or disabling an account ends that person's existing sessions immediately.

## Sessions

Signing in sets an `httpOnly` cookie holding a signed session token; the session itself is a database row, so it can
be revoked from the dashboard. Sessions last `OPENRIVE_SESSION_DAYS` (30 by default).

Cookies are signed with `OPENRIVE_AUTH_SECRET`. Leave it unset and OpenRive generates one on first use and keeps it
in the database, so sessions survive a restart; set it explicitly to share one secret across several app containers:

```env
OPENRIVE_AUTH_SECRET=a-long-random-string-at-least-32-characters
```

When authentication is enabled in production, set `OPENRIVE_URL` to the public
origin, for example `https://openrive.example.com`. If the browser is served
from additional origins, list them in `OPENRIVE_TRUSTED_ORIGINS` as a
comma-separated value. Authentication requests are rate limited and the limits
are stored in Redis when `OPENRIVE_REDIS_URL` is configured, so multiple app
processes share atomic fixed-window limits. Without Redis, the existing
database-backed limiter remains the safe fallback.

## Passwords

Passwords are hashed with scrypt (Better Auth's default) and only the hash is stored. The same message is shown for
an unknown account and a wrong password, so neither reveals which accounts exist. Accounts created by the first
release of sign-in carry a PBKDF2-HMAC-SHA-512 hash instead; those still work, and the next password change stores
scrypt.

## Where accounts live

| Table | Holds |
| --- | --- |
| `users` | the account and the person a file belongs to: name, email, colour, role |
| `accounts` | how an account signs in — one `credential` row per password |
| `sessions` | who is signed in, from which browser and until when |
| `verifications` | short-lived tokens; empty unless something asks for one |
| `organization`, `member`, `invitation` | workspaces, membership and pending invitations |
| `rate_limit` | Better Auth request-rate windows when Redis is not configured |

One row per person in `users`, whether they sign in or are just a name a local, login-free run attributes files to.

## Recovering access from the server

If you lock yourself out, the CLI works directly against the database:

```bash
openrive db auth                       # who exists, who has a password
openrive users password Ada            # asks for a new password (no echo)
openrive users password Ada --password 'a new password'
openrive users role Ada --role admin   # promote someone
openrive users add Sam --role editor --email sam@example.com --password 'their password'
```

An account needs an email before it can have a password — that is what it signs in with.

With the embedded database, stop the server first — it allows one process at a time.

## Shared password instead of accounts

`OPENRIVE_ACCESS_TOKEN` is a different thing and can be combined with accounts: it puts HTTP Basic auth in front of
the whole instance, so nothing is reachable at all without the shared password. Accounts then decide who may do what.
