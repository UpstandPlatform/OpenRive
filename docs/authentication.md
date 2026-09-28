# Accounts and sign-in

OpenRive has two ways of knowing who you are:

| Mode | When | What it looks like |
| --- | --- | --- |
| **Login-free** | a local run or the desktop app | pick a user from the header, as OpenRive has always worked |
| **Sign-in** | self-hosted (a `DATABASE_URL` is set) | an email and a password, sessions, and an admin dashboard |

Set `OPENRIVE_AUTH` to choose explicitly:

```env
OPENRIVE_AUTH=auto   # default: sign-in required when DATABASE_URL is set
OPENRIVE_AUTH=on     # always require sign-in (also with the embedded database)
OPENRIVE_AUTH=off    # never require sign-in (single user on a trusted machine)
```

Accounts are handled by [Better Auth](https://better-auth.com): email and password, no external provider.

## The first account

Open the server in a browser. With nobody registered yet, OpenRive sends you to **/signup** to create the
administrator account: a name, an email and a password of at least 8 characters. The first account to exist becomes
the **administrator** and is signed in straight away; everyone who signs up later is an **editor**.

**Nothing is emailed and nothing is verified.** The address is only what you sign in with, so it can be
`ada@example.test` on a private server. OpenRive sends no mail at all.

## Who may sign up

```env
OPENRIVE_SIGNUP=open    # default: anyone who can reach the server can create an account
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
OPENRIVE_AUTH_SECRET=a-long-random-string
```

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
