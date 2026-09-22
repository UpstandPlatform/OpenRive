# Users & roles

OpenRive has **local users instead of accounts**. There are no passwords or sign-up. Pick who you are from the switcher
in the header. It's meant for sharing one machine or a trusted team server. On a server reachable by others, protect
the whole app with `OPENRIVE_ACCESS_TOKEN` (see [Self-hosting](self-hosting.md#before-you-start-protecting-access)).

## Roles

| Role | Can |
| --- | --- |
| **Admin** | Everything: manage users, and see and edit every file |
| **Editor** | Create files, edit their own files and files shared with them |
| **Viewer** | Open and preview files read-only |

There is always at least one admin. The first start creates one called *Admin*.

## Managing users

The **Users** page (`/users`) lets admins add users (name, color, role), rename them, change roles and remove them.
Removing a user transfers their files to another user you choose (by default an admin).

From the command line:

```bash
openrive users
openrive users add "Sara" --role editor
openrive users remove "Sara"
```

## Sharing

Open a file card's **⋯** menu › **Share with users** to let specific users edit it. Admins see every file.

## Which user is "me"?

The current user is remembered per browser (local storage). The CLI and MCP tools create files as `OPENRIVE_USER`,
or as the first admin.
