## General

**What is OpenRive?**
An open-source, local-first editor for [Rive](https://rive.app) animations. It edits `.riv` files, the format Rive's
runtimes play, and renders them with the official runtime.

**Is it affiliated with Rive?**
No. OpenRive is an independent project. "Rive" is a trademark of its owner.

**Is it free?**
Yes, under the MIT License. [Donations](Home#support-the-project) are welcome.

**Do I need an account or internet connection?**
No. Everything runs on your machine or your own server. The Rive runtime is served locally.

## Files

**Can I open files made in rive.app?**
Yes, if you exported them as `.riv` (File › Export for runtime in rive.app). Everything in them is preserved and plays.
Some features (bones, meshes, nested artboards, …) can't be edited in OpenRive yet. See
[File Format](File-Format#what-can-be-edited).

**Can I open `.rev` files?**
No. `.rev` is the Rive editor's private backup format, and it isn't public. Export a `.riv` instead.

**Will OpenRive change my files?**
Not unless you edit them. Unmodified files are written back byte for byte. Check any file with
`openrive validate file.riv`.

**Do exported files work in the official runtimes?**
Yes: web, React, Flutter, iOS, Android, Unity and others. The editor itself renders with the official web runtime.

**Where are my projects stored?**
In `./data` by default, or in PostgreSQL when `DATABASE_URL` is set. See
[Storage and PostgreSQL](Storage-and-PostgreSQL).

## Features

**Does OpenRive support Rive Scripting (Luau)?**
Not for authoring. Rive signs compiled scripts with its private key, and the runtimes skip unsigned scripts. Scripts in
imported files are preserved. OpenRive's [Code Panel](Code-Panel) offers design-time JavaScript automation instead.

**Do theme colors end up in my `.riv`?**
The file contains the colors of the active theme. Theme links and other themes are editor data. See
[Theme Colors](Theme-Colors#in-exported-files).

**Can I use images and SVGs?**
Yes. Use the **Assets** tab: images are embedded, and SVGs become editable vector shapes. See
[Text and Assets](Text-and-Assets).

**Is there real-time collaboration?**
Not yet. Several people can use one self-hosted server, and an open file shows a banner when someone else changes it.
See [Roadmap](Roadmap).

## Self-hosting

**Is it safe to put on the internet?**
Only with `OPENRIVE_ACCESS_TOKEN` set and HTTPS in front, because OpenRive has no login by design. See
[Self-Hosting](Self-Hosting#before-you-start-protecting-access).

**Files or PostgreSQL?**
Files are simplest for one person. PostgreSQL suits teams and managed hosting. You can switch any time with
`openrive migrate`.

**How do I back up?**
Copy the data folder, or `pg_dump` the database. See [Self-Hosting](Self-Hosting#backups).

## Contributing

**How can I help?**
Report bugs (with `.riv` files), propose templates, improve docs or pick an issue. Start at
[Contributing](Contributing).

**Can I use AI tools to contribute?**
Yes. The repo ships agents and skills for that. Please follow the rules in [AI Collaboration](AI-Collaboration).
