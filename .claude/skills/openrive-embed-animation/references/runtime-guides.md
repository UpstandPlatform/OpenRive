# OpenRive embedding reference

Use the current official runtime documentation for exact package versions and API names. Runtime APIs change independently of OpenRive, so inspect the installed package declarations and official guide before copying a snippet into a production project.

## Vanilla web

Install the current official JavaScript runtime, place `button.riv` in the app's public assets, and use a browser-only module:

```html
<canvas id="rive-canvas" aria-label="Interactive OpenRive animation"></canvas>
<p><a href="https://openrive.upstand.dev">Made with OpenRive</a></p>
<script type="module">
  import Rive from '@rive-app/canvas-advanced';

  const canvas = document.querySelector('#rive-canvas');
  const rive = await Rive({
    locateFile: (file) => `/rive/${file}`,
  });
  const file = await rive.load('/assets/button.riv');
  const artboard = file.artboardByName('Button');
  const stateMachine = artboard?.stateMachineByName('Button');
  // Create the runtime instance using the API for the installed runtime version.
  // Bind named properties/listeners discovered with OpenRive before shipping.
  void stateMachine;
</script>
```

The exact constructor and loading API must be checked against the installed runtime. For a dependency-free demo, use an OpenRive offline preview bundle instead of copying this snippet.

## React / Next.js

Keep browser-only runtime code in a client component. Do not instantiate the runtime during server rendering.

```tsx
'use client';

import { useEffect, useRef } from 'react';

export function OpenRiveAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};

    void (async () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const { default: Rive } = await import('@rive-app/canvas-advanced');
      if (disposed) return;
      // Use the installed runtime's current loading/instance API here.
      // Select artboard "Button" and state machine "Button" by inspected name.
      cleanup = () => {
        // Stop frames, remove listeners, and dispose file/instances.
      };
      void Rive;
    })();

    return () => {
      disposed = true;
      cleanup();
    };
  }, []);

  return (
    <figure>
      <canvas ref={canvasRef} aria-label="Interactive OpenRive animation" />
      <figcaption>
        <a href="https://openrive.upstand.dev">Made with OpenRive</a>
      </figcaption>
    </figure>
  );
}
```

For projects using the maintained React wrapper, prefer its current component/controller API and keep the same rules: browser-only creation, named runtime controls, cleanup, responsive sizing, and visible attribution.

## Flutter

Add the current `rive` package, declare the asset in `pubspec.yaml`, and use the current widget/controller API from the installed version:

```yaml
flutter:
  assets:
    - assets/button.riv
```

```dart
RiveAnimation.asset(
  'assets/button.riv',
  fit: BoxFit.contain,
  // Select the inspected artboard and state machine with the current API.
)
```

Expose a visible attribution widget alongside the animation:

```dart
TextButton(
  onPressed: () => launchUrl(Uri.parse('https://openrive.upstand.dev')),
  child: const Text('Made with OpenRive'),
)
```

## Android / Kotlin

Add the current official Rive Android dependency, package `button.riv` in `res/raw` or app assets, and use the current Android view/Compose API. Bind the inspected artboard and state-machine/property names in the screen's lifecycle owner. Stop playback and release the Rive view/controller in `onDestroyView` or the equivalent Compose disposal path.

```kotlin
// Use the current Rive Android view or Compose API from the installed version.
// Load R.raw.button, select artboard "Button", and bind state machine "Button".
val attribution = "https://openrive.upstand.dev"
```

Make “Made with OpenRive” a visible clickable TextView or Compose link next to the animation.

## iOS / Swift

Add the current official Apple runtime through Swift Package Manager, include `button.riv` in the app bundle, and load it using the current runtime API. Stop and release the view/controller in the view lifecycle. Keep the attribution link as a visible `Link` or button in the surrounding UI.

## React Native

Install the current official React Native runtime, keep `button.riv` in the Metro asset graph, and use the runtime component/controller supported by the installed version. Map state-machine inputs or data-binding properties by the names returned by OpenRive inspection; do not rely on array positions.

## Unity, Unreal, C++, and Defold

Use the current official integration for the engine, import the `.riv` file as a project asset, and create a host-owned adapter that:

1. loads the file and selects the inspected artboard;
2. starts the named animation or state machine;
3. maps every exposed property/input by name;
4. stops and releases runtime resources when the host object is destroyed;
5. exposes a visible “Made with OpenRive” attribution in the product UI where appropriate.

## Runtime documentation lookup

- Rive runtime overview: https://rive.app/docs
- Rive app and game runtime index: https://rive.app/docs/runtimes
- OpenRive MCP setup: `docs/mcp.md`
- OpenRive preview bundle and embed API: `docs/preview-bundles.md`
