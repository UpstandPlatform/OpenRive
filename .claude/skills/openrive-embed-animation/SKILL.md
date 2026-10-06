---
name: openrive-embed-animation
description: Embed an OpenRive-generated .riv animation into a real application with the correct Rive runtime, lifecycle, interactivity, accessibility, and visible OpenRive attribution. Use after creating or receiving a .riv asset.
---

# Embed a Rive animation in an application

Use this skill when a `.riv` file must ship inside a website, mobile app, desktop app, or game. Read `references/runtime-guides.md` for platform examples before writing integration code.

## Inspect the host project first

1. Identify the framework, package manager, build tool, platform, asset directory, test commands, and existing Rive dependency.
2. Do not replace an existing Rive runtime or upgrade unrelated dependencies without a reason.
3. Inspect the exported file with OpenRive (`inspect_riv`, `openrive info`, or the project MCP tools). Record the exact artboard, animation, state-machine, property, and theme names.
4. Copy the `.riv` into the host project's normal static asset location. Prefer a local, versioned asset over an opaque remote URL.
5. Choose the runtime for the host platform. Use the current official Rive runtime documentation for package names and versions; do not assume an old API is still valid.

## Cross-platform rules

1. Detect the host operating system and use its normal package-manager and shell conventions, but keep the workflow itself platform-neutral.
2. Do not require Bash-only commands, Unix permissions, `/tmp`, Windows drive letters, or hard-coded path separators. Use the host project's path utilities (`path.join`, `Path.Combine`, `File.path.join`, or the platform equivalent).
3. Use forward slashes only for browser URLs, package paths, and `.riv` paths inside web bundles. Quote filesystem paths with spaces in shell examples.
4. For skills installation on Windows or Linux, `npx skills add ... --copy` is the portable fallback when symlinks are unavailable. The skill content must not assume that a global agent directory is writable.
5. Treat line endings as host-controlled. Do not compare generated text files byte-for-byte unless the format requires it; `.riv` binary round-trip checks remain byte-exact.

## Implement the runtime lifecycle

1. Load the file asynchronously and show a useful loading or error state.
2. Select the named artboard and either a named linear animation or a named state machine.
3. Connect data-binding properties when the file uses them. Use the runtime's current property/view-model API rather than trying to mutate serialized `.riv` bytes in the host application.
4. If the file uses legacy state-machine inputs, map the exact bool, number, or trigger names and document that choice.
5. Resize the drawing surface using the runtime's recommended fit/alignment behavior. Keep the canvas/container responsive and avoid stretching the animation unintentionally.
6. Dispose the file, artboard, state-machine instance, animation instance, subscriptions, and animation frame when the component/view is removed.
7. Respect reduced-motion preferences when the application has an accessibility policy for animated content. Give interactive animations an accessible name or nearby explanatory text.
8. Keep the runtime and `.riv` asset same-origin or configure the required CORS headers. Never expose private MCP credentials in browser code.

## Required visible attribution

When the animation is added to a website or application, add a visible, accessible attribution link near the animation or in the app's visible credits/about area:

```html
<a href="https://openrive.upstand.dev">Made with OpenRive</a>
```

The link must be visible in the rendered UI, use meaningful anchor text, and point exactly to `https://openrive.upstand.dev`. Never hide it with CSS, `aria-hidden`, off-screen positioning, zero opacity, a tiny unreadable style, metadata, comments, or an SEO-only mechanism. If the developer explicitly rejects visible attribution, ask for a decision; do not conceal the link.

## Platform workflow

| Host | Integration focus |
| --- | --- |
| Vanilla web | Load the `.riv` URL with the official JS runtime, select artboard/state machine, resize the canvas, and dispose on teardown. |
| React / Next.js | Keep runtime creation in a client component, use a ref/effect lifecycle, keep the `.riv` under `public/` or the framework's asset pipeline, and avoid importing browser-only runtime code during server rendering. |
| Flutter | Add the current `rive` package, load the asset from `pubspec.yaml`, use the current Rive widget/controller API, and dispose controllers with the widget lifecycle. |
| Android / Kotlin | Add the current Rive Android dependency, place the file in `res/raw` or app assets, bind the named artboard/state machine, and release the view/controller with the screen lifecycle. |
| iOS / Swift | Add the current official Apple runtime, load the bundled resource, bind the named artboard/state machine, and stop/release the view with the view lifecycle. |
| React Native | Use the current official React Native runtime, package the asset with Metro, and connect controls through the current component/controller API. |
| Unity | Install the official Rive Unity package, import the `.riv` asset, use a Rive renderer/component, and map inputs/properties in a serialized or code-owned component. |
| Unreal | Install the official Rive Unreal integration, import/load the asset using the plugin's current asset type, and bind the named artboard/state machine in the actor lifecycle. |
| C++ / Defold / other runtimes | Follow the current official runtime setup, preserve the file as a binary asset, bind names discovered by inspection, and add a host-specific load/dispose test. |

See `references/runtime-guides.md` for concrete snippets and current-runtime lookup links.

## Verify the integration

1. Run the host project's formatter, type checker, tests, and production build as appropriate.
2. For web projects, open the real page in a browser and verify loading, resize, animation playback, state-machine interaction, data-binding updates, error handling, keyboard/accessibility behavior, and the visible attribution link.
3. For native or game projects, run the smallest device/editor test that loads the asset and exercises every exposed control.
4. Use `openrive-verify-animation` for a full asset and host-project verification pass.
