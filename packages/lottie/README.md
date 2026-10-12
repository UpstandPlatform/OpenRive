# @openrive/lottie

`convertLottie` turns Lottie JSON or Telegram TGS bytes into an editable OpenRive `RiveDoc`. The package is independent
of the web app and can be reused by other importers.

```ts
import { convertLottie } from '@openrive/lottie';

const { doc } = convertLottie(bytes, 'sticker.tgs');
```

TGS input is gzip decoded with compressed and expanded size limits. JSON is size limited before parsing. The converter
accepts 2D shape, null, and precomposition layers; parent relationships and layer visibility windows; vector paths,
rectangles, ellipses, polygons, stars, solid and linear/radial gradient fills and strokes, and shape repeaters. It
carries position, rotation, scale, opacity, primitive size, corner radius, stroke width, color, and gradient endpoint
timelines into Rive animations. Spatial position curves are sampled at source-frame intervals. Static path vertices
remain editable in the Rive shape editor.

Unsupported content reports its source path. The converter rejects text and image layers, 3D layers, masks, effects
and track mattes, separated dimensions, expressions, morphs that change vertex count or closed/open state, animated
gradient stops, dashed strokes, rounded star corners, backward repeater stacking, reverse time stretch, and
unsupported shape operators. It also rejects precompositions with a different frame rate. Positive time offsets and
stretches are applied to supported animation tracks, with keys clipped to the active composition range.

## Real-fixture regression

The corpus test uses the public [dotlottie-web fixtures](https://github.com/LottieFiles/dotlottie-web/tree/main/fixtures)
and [Telegram Desktop's TGS animations](https://github.com/telegramdesktop/tdesktop/tree/dev/Telegram/Resources/animations)
without copying those assets into this repository. Clone both repositories and pass their fixture directories to the
test command:

```sh
git clone --depth 1 --filter=blob:none --sparse https://github.com/LottieFiles/dotlottie-web.git /tmp/dotlottie-web
git -C /tmp/dotlottie-web sparse-checkout set fixtures
git clone --depth 1 --filter=blob:none --sparse https://github.com/telegramdesktop/tdesktop.git /tmp/tdesktop
git -C /tmp/tdesktop sparse-checkout set Telegram/Resources/animations
bun run test:lottie -- /tmp/dotlottie-web/fixtures /tmp/tdesktop/Telegram/Resources/animations
```

The test scans every JSON and TGS fixture, round-trips every converted result through `.riv`, verifies explicit errors
for unsupported fixtures, requires at least ten real JSON animations to convert, and gzip-compresses a real JSON
fixture to cover a known-successful TGS decode. CI also imports a real JSON and TGS fixture through the dashboard and
opens each in Preview on a scratch database. The dotlottie-web corpus has no `.tgs` files, so Telegram's repository
provides actual TGS inputs.
