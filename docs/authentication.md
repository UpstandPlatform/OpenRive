# Accounts and sign-in

OpenRive has two ways of knowing who you are:

| Mode | When | What it looks like |
| --- | --- | --- |
| **Login-free** | a local run or the desktop app | pick a user from the header, as OpenRive has always worked |
| **Sign-in** | self-hosted (a `DATABASE_URL` is set) | an account with a password, sessions, and an admin dashboard |

Set `OPENRIVE_AUTH` to choose explicitly:

```env
OPENRIVE_AUTH=auto   # default: sign-in required when DATABASE_URL is set
OPENRIVE_AUTH=on     # always require sign-in (also with the embedded database)
OPENRIVE_AUTH=off    # never require sign-in (single user on a trusted machine)
```

## The first account

Open the server in a browser. With nobody registered yet, OpenRive shows **Create the administrator account**: pick a
name, an optional email and a password of at least 8 characters. That first account becomes the **administrator** and
is signed in straight away.

There is no sign-up page and no email verification — self-hosted instances are private, so the administrator creates
everyone else from the dashboard.

> Put the server behind HTTPS before anyone signs in over a network. See
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

Signing in sets an `httpOnly` cookie holding a random session id; the session itself lives in the database, so it can
be revoked. Sessions last `OPENRIVE_SESSION_DAYS` (30 by default) and expired rows are cleaned up on each sign-in.

## Passwords

Passwords are hashed with PBKDF2-HMAC-SHA-512, 210,000 iterations and a random 16-byte salt per password (OWASP's
guidance), using WebCrypto — nothing native to compile. The database stores only the hash, and sign-in compares in
constant time. The same message is shown for an unknown account and a wrong password.

## Recovering access from the server

If you lock yourself out, the CLI works directly against the database:

```bash
openrive db auth                       # who exists, who has a password
openrive users password Ada            # asks for a new password (no echo)
openrive users password Ada --password 'a new password'
openrive users role Ada --role admin   # promote someone
openrive users add Sam --role editor --password 'their password' --email sam@example.com
```

With the embedded database, stop the server first — it allows one process at a time.

## Shared password instead of accounts

`OPENRIVE_ACCESS_TOKEN` is a different thing and can be combined with accounts: it puts HTTP Basic auth in front of
the whole instance, so nothing is reachable at all without the shared password. Accounts then decide who may do what.
