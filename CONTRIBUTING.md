# Contributing to OpenRive

Thanks for helping build OpenRive. Every contribution counts: bug reports, docs fixes, templates, file-format coverage
and features.

## Ways to contribute

| You want to… | Start here |
| --- | --- |
| Report a bug or a file that renders wrong | [Bug report](https://github.com/UpstandPlatform/OpenRive/issues/new?template=bug_report.yml) |
| Suggest a feature | [Feature request](https://github.com/UpstandPlatform/OpenRive/issues/new?template=feature_request.yml) |
| Propose or build a template | [Template request](https://github.com/UpstandPlatform/OpenRive/issues/new?template=template_request.yml) · [contribution/templates.md](contribution/templates.md) |
| Improve docs | [contribution/docs.md](contribution/docs.md) |
| Write code | [contribution/development.md](contribution/development.md) |
| Work with AI agents | [contribution/ai-collaboration.md](contribution/ai-collaboration.md) |

## Quick start for code contributions

```bash
git clone https://github.com/UpstandPlatform/OpenRive.git
cd OpenRive
npm install
npm run dev                 # http://localhost:3000
```

1. **Open or find an issue** first for anything bigger than a small fix, so we can agree on the approach.
2. **Branch** from `main`: `feat/assets-drag`, `fix/text-bounds`, `docs/self-hosting`.
3. **Make the change** following the [code style](contribution/code-style.md).
4. **Check it**:
   ```bash
   npx tsc --noEmit
   npm run lint
   npm test
   ```
   Also run `npm run test:mcp` if you touched `api.ts` or tools, and `npm run test:corpus` if you touched the format
   layer (see [testing](contribution/testing.md)).
5. **Open a pull request** using the template. Include screenshots or a short recording for UI changes, and attach
   `.riv` files for format fixes.

## Ground rules

- **Never break files.** Unmodified `.riv` files must round-trip byte for byte. Format changes need tests.
- **Local-first and login-free.** Don't add accounts, telemetry or required network calls. Optional integrations must
  be off by default.
- **One editing API.** Features that create or change content belong in `src/lib/rive/api.ts` (or a DOM-free module
  next to it), so the UI, CLI, MCP and Code panel all get them.
- **Keyboard and menus.** New commands go in the action registry (`src/components/editor/actions.ts`) with a sensible
  shortcut when appropriate.
- **Docs with features.** User-visible changes update the relevant page in `docs/`.
- Be kind and constructive. Assume good intent.

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
