import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'fflate';
import { exportRiv, importRiv } from '@openrive/rive/document';
import { convertLottie } from '@openrive/lottie';

const fixturesRoot = process.argv[2] ?? process.env.LOTTIE_FIXTURES_DIR;
const telegramTgsRoot = process.argv[3] ?? process.env.TELEGRAM_TGS_FIXTURES_DIR;
if (!fixturesRoot) {
  console.log('Skipping Lottie corpus test: pass dotlottie-web fixtures directory or set LOTTIE_FIXTURES_DIR.');
  process.exit(0);
}
const fallbackFont = {
  name: 'Inter',
  bytes: new Uint8Array(readFileSync(path.resolve(import.meta.dir, '../apps/web/public/fonts/Inter-Regular.ttf'))),
};

const expectedSuccesses = [
  'down.json',
  'dragon.json',
  'growup.json',
  'lolo.json',
  'lottie/abstract_circle.json',
  'lottie/alien.json',
  'lottie/anubis.json',
  'lottie/balloons_with_string.json',
  'lottie/confetti.json',
  'lottie/dancing_book.json',
  'lottie/dodecahedron.json',
  'lottie/down.json',
  'lottie/duck.json',
  'lottie/emoji.json',
  'lottie/fleche.json',
  'lottie/flipping_page.json',
  'lottie/foodrating.json',
  'lottie/funky_chicken.json',
  'lottie/glow_loading.json',
  'lottie/gradient_infinite.json',
  'lottie/gradient_sleepy_loader.json',
  'lottie/gradient_smoke.json',
  'lottie/growup.json',
  'lottie/hola.json',
  'lottie/like_button.json',
  'lottie/lolo_walk.json',
  'lottie/loveface_emoji.json',
  'lottie/material_wave_loading.json',
  'lottie/merging_shapes.json',
  'lottie/polystar.json',
  'lottie/property_market.json',
  'lottie/ripple_loading_animation.json',
  'lottie/sad_emoji.json',
  'lottie/sample.json',
  'lottie/starstrips.json',
  'lottie/swinging.json',
  'lottie/uk_flag.json',
  'lottie/voice_recognition.json',
  'lottie/walker.json',
  'lottie/yarn_loading.json',
  'lottie-lego.json',
  'walker.json',
];
const expectedTgsSuccesses = [
  'ban.tgs',
  'bot_menu.tgs',
  'chat/white_flag_emoji.tgs',
  'cloud_password/email.tgs',
  'cloud_password/validate.tgs',
  'collectible_phone.tgs',
  'craft_failed.tgs',
  'dice/slot_0_idle.tgs',
  'dice/slot_1_idle.tgs',
  'dice/slot_2_idle.tgs',
  'dice/slot_back.tgs',
  'dice/slot_pull.tgs',
  'filters.tgs',
  'gram_white.tgs',
  'gram_white_fast.tgs',
  'greeting.tgs',
  'hello_status.tgs',
  'palette.tgs',
  'photo_editor/arrow.tgs',
  'photo_editor/blur.tgs',
  'photo_editor/text_align.tgs',
  'photo_editor/trim_shortest.tgs',
  'star_reaction/select.tgs',
  'stats.tgs',
  'stop.tgs',
  'swipe_action/archive.tgs',
  'swipe_action/delete.tgs',
  'swipe_action/pin.tgs',
  'swipe_action/read.tgs',
  'swipe_action/ungroup.tgs',
  'swipe_action/unmute.tgs',
  'swipe_action/unread.tgs',
  'toast/chats_filter_in.tgs',
  'toast/copy.tgs',
  'toast/delete.tgs',
  'toast/forward.tgs',
  'toast/saved_messages.tgs',
  'toast/save_to_music.tgs',
  'toast/tagged.tgs',
  'toast/voip_invite.tgs',
  'transcribe_loading.tgs',
  'voice_ttl_idle.tgs',
  'voice_ttl_start.tgs',
  'wallet/paper.tgs',
  'wallet/test.tgs',
];

function assertRoundTrip(doc: ReturnType<typeof convertLottie>['doc'], fixtureName: string): void {
  const rivBytes = exportRiv(doc);
  const imported = importRiv(rivBytes);
  const reExportedBytes = exportRiv(imported);
  assert.deepEqual(reExportedBytes, rivBytes, `${fixtureName} must survive an OpenRive export/import round trip.`);
  const artboard = imported.artboards[0];
  assert.ok(artboard, `${fixtureName} must create an artboard.`);
  assert.ok(artboard.objects.some((object) => object.type === 'Shape' || object.type === 'Text'), `${fixtureName} must produce editable shapes or text.`);
  assert.ok(artboard.animations.length > 0, `${fixtureName} must preserve an animation timeline.`);
  const objectIds = new Set([artboard.id, ...artboard.objects.map((object) => object.id)]);
  for (const object of artboard.objects) {
    if (object.type === 'Artboard' || object.props.parentId === undefined) continue;
    assert.ok(typeof object.props.parentId === 'string' && objectIds.has(object.props.parentId), `${fixtureName} has an invalid parent reference.`);
  }
}

const jsonFiles: string[] = [];
function collectJsonFiles(directory: string): void {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) collectJsonFiles(absolutePath);
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.json')) jsonFiles.push(absolutePath);
  }
}
collectJsonFiles(fixturesRoot);
assert.ok(jsonFiles.length >= 20, `Expected at least 20 real JSON fixtures, found ${jsonFiles.length}.`);

const successNames = new Set<string>();
let convertedCount = 0;
let unsupportedCount = 0;
for (const fixturePath of jsonFiles) {
  const fixtureName = path.relative(fixturesRoot, fixturePath).replaceAll('\\', '/');
  const bytes = new Uint8Array(readFileSync(fixturePath));
  try {
    const result = convertLottie(bytes, fixtureName, { font: fallbackFont });
    assertRoundTrip(result.doc, fixtureName);
    convertedCount++;
    successNames.add(fixtureName);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    assert.match(message, /^Unsupported Lottie feature at animation\./, `${fixtureName} failed unexpectedly: ${message}`);
    unsupportedCount++;
  }
}

for (const name of expectedSuccesses) {
  assert.ok(successNames.has(name), `Expected fixture ${name} to convert successfully.`);
}
assert.ok(successNames.size >= 10, `Expected at least 10 distinct real fixtures to convert; got ${successNames.size}.`);

const tgsSourcePath = path.join(fixturesRoot, 'lottie', 'balloons_with_string.json');
const tgsSource = new Uint8Array(readFileSync(tgsSourcePath));
const tgsBytes = gzipSync(tgsSource);
const tgsConversion = convertLottie(tgsBytes, 'balloons_with_string.tgs', { font: fallbackFont });
assert.equal(tgsConversion.source, 'tgs');
assertRoundTrip(tgsConversion.doc, 'gzip-compressed balloons_with_string.json');

let tgsFixtureCount = 0;
let convertedTgsCount = 0;
const convertedTgs = new Set<string>();
if (telegramTgsRoot) {
  const tgsFiles: string[] = [];
  function collectTgsFiles(directory: string): void {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) collectTgsFiles(absolutePath);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith('.tgs')) tgsFiles.push(absolutePath);
    }
  }
  collectTgsFiles(telegramTgsRoot);
  assert.ok(tgsFiles.length >= 10, `Expected at least 10 real Telegram TGS fixtures, found ${tgsFiles.length}.`);
  tgsFixtureCount = tgsFiles.length;
  for (const fixturePath of tgsFiles) {
    const fixtureName = path.relative(telegramTgsRoot, fixturePath).replaceAll('\\', '/');
    try {
      const result = convertLottie(new Uint8Array(readFileSync(fixturePath)), fixtureName, { font: fallbackFont });
      assert.equal(result.source, 'tgs');
      assertRoundTrip(result.doc, fixtureName);
      convertedTgsCount++;
      convertedTgs.add(fixtureName);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      assert.match(message, /^Unsupported Lottie feature at animation\./, `${fixtureName} failed unexpectedly: ${message}`);
    }
  }
  for (const name of expectedTgsSuccesses) {
    assert.ok(convertedTgs.has(name), `Expected Telegram TGS fixture ${name} to convert successfully.`);
  }
}

console.log(`Lottie corpus: ${jsonFiles.length} real JSON files scanned, ${successNames.size} distinct files converted end to end (${convertedCount} total conversions), ${unsupportedCount} explicitly rejected.`);
console.log(`TGS gzip conversion: passed using ${path.relative(fixturesRoot, tgsSourcePath).replaceAll('\\', '/')}.`);
if (telegramTgsRoot) console.log(`Telegram corpus: ${tgsFixtureCount} real TGS files scanned, ${convertedTgsCount} converted end to end, ${tgsFixtureCount - convertedTgsCount} explicitly rejected.`);
