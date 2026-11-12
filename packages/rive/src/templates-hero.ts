// Hero-section & interactive website showcase templates built with the high-level API.
import {
  addAnimation,
  addClip,
  addDistanceConstraint,
  addGroup,
  addInput,
  addKeyframes,
  addListener,
  addPath,
  addShape,
  addState,
  addStateMachine,
  addTransition,
  applyThemeColor,
  defineColor,
  getArtboard,
} from './api';
import { RiveDoc } from './document';
import { newDoc, newLayer, obj, solidStroke } from './factory';
import { moveBefore } from './ops';
import { addTheme, applyTheme, setSwatchColor } from './theme';
import type { Template } from './templates';

function base(name: string, width: number, height: number, bg: string): RiveDoc {
  const doc = newDoc(name);
  const ab = doc.artboards[0];
  ab.artboard.props.width = width;
  ab.artboard.props.height = height;
  ab.animations = [];
  ab.stateMachines = [];
  defineColor(doc, 'Background', bg);
  applyThemeColor(doc, ab.artboard.id, 'Background');
  return doc;
}

function addLayer(doc: RiveDoc, sm: string, name: string) {
  const ab = getArtboard(doc);
  const machine = ab.stateMachines.find((m) => m.props.name === sm)!;
  machine.children!.push(newLayer(name));
  return name;
}

/**
 * Helper to create an isometric 2.5D projection plane (squashed Y + rotated child).
 * Shapes placed under the returned `plane` name automatically project into 3D isometric space.
 */
function addIsoPlane(doc: RiveDoc, parent: string, prefix: string, y = 0, squash = 0.58, angleDeg = -30) {
  const scaleNode = addGroup(doc, { parent, name: `${prefix} Squash`, x: 0, y });
  scaleNode.props.scaleY = squash;
  const rotNode = addGroup(doc, { parent: `${prefix} Squash`, name: `${prefix} Plane`, x: 0, y: 0 });
  rotNode.props.rotation = (angleDeg * Math.PI) / 180;
  return rotNode.props.name as string;
}

export const isometricHeroStack: Template = {
  id: 'isometric-hero-stack',
  name: '3D Isometric Hero Stack',
  description: 'A floating 2.5D SaaS card stack with 5-layer cursor parallax, hover exploded view, streaming telemetry, and click shockwave.',
  learn: ['2.5D isometric projection', 'Multi-depth cursor parallax', 'Trim path data streams', 'Parallel state machine layers'],
  build() {
    const doc = base('3D Isometric Hero Stack', 600, 500, '#0b0e17');
    const ab = getArtboard(doc);

    // Theme palette (Midnight default + Daylight alternate theme)
    defineColor(doc, 'Deck Base', '#131b2e');
    defineColor(doc, 'Deck Side', '#090d18');
    defineColor(doc, 'Deck Mid', '#1a2540');
    defineColor(doc, 'Deck Top', '#223154');
    defineColor(doc, 'Panel', '#0d1324');
    defineColor(doc, 'Primary', '#3b82f6');
    defineColor(doc, 'Accent', '#00e5bb');
    defineColor(doc, 'Highlight', '#a855f7');
    defineColor(doc, 'Ink', '#f8fafc');
    defineColor(doc, 'Muted', '#64748b');

    // Central anchor for proportional distance-constraint parallax
    addGroup(doc, { name: 'Stack Anchor', x: 300, y: 265 });

    // -------------------------------------------------------------------------
    // 1. Ambient glow & ground shadow (deepest parallax layer: 4% pointer shift)
    // -------------------------------------------------------------------------
    addGroup(doc, { name: 'Shadow Parallax', x: 300, y: 265 });
    addDistanceConstraint(doc, { object: 'Shadow Parallax', target: 'Stack Anchor', distance: 0, strength: 0.96 });
    addGroup(doc, { parent: 'Shadow Parallax', name: 'Shadow Float', x: 0, y: 88 });

    addShape(doc, {
      parent: 'Shadow Float',
      kind: 'ellipse',
      name: 'Ambient Aura',
      x: 0,
      y: -20,
      width: 420,
      height: 240,
      fill: '#3b82f61c',
    });
    const shadowPlane = addIsoPlane(doc, 'Shadow Float', 'Ground Shadow', 0);
    addShape(doc, {
      parent: shadowPlane,
      kind: 'rectangle',
      name: 'Ground Shadow',
      x: 0,
      y: 0,
      width: 260,
      height: 190,
      cornerRadius: 28,
      fill: '#00000080',
    });

    // -------------------------------------------------------------------------
    // 2. Bottom Deck: Cloud Compute & Server Mesh (8% pointer shift)
    // -------------------------------------------------------------------------
    addGroup(doc, { name: 'Bottom Parallax', x: 300, y: 265 });
    addDistanceConstraint(doc, { object: 'Bottom Parallax', target: 'Stack Anchor', distance: 0, strength: 0.92 });
    addGroup(doc, { parent: 'Bottom Parallax', name: 'Bottom Float', x: 0, y: 52 });
    addGroup(doc, { parent: 'Bottom Float', name: 'Bottom Offset', x: 0, y: 0 });

    const botBevelPlane = addIsoPlane(doc, 'Bottom Offset', 'Bottom Bevel', 13);
    addShape(doc, {
      parent: botBevelPlane,
      kind: 'rectangle',
      name: 'Bottom Bevel',
      x: 0,
      y: 0,
      width: 256,
      height: 186,
      cornerRadius: 24,
      stroke: '#3b82f644',
      strokeWidth: 1.5,
    });
    applyThemeColor(doc, 'Bottom Bevel', 'Deck Side');

    const botPlane = addIsoPlane(doc, 'Bottom Offset', 'Bottom Card', 0);
    addShape(doc, {
      parent: botPlane,
      kind: 'rectangle',
      name: 'Bottom Card',
      x: 0,
      y: 0,
      width: 256,
      height: 186,
      cornerRadius: 24,
      stroke: '#3b82f677',
      strokeWidth: 2,
    });
    applyThemeColor(doc, 'Bottom Card', 'Deck Base');

    // Server rack blades on the bottom deck
    for (const [idx, sy] of [
      [1, -44],
      [2, 0],
      [3, 44],
    ] as const) {
      addShape(doc, {
        parent: botPlane,
        kind: 'rectangle',
        name: `Server Blade ${idx}`,
        x: 0,
        y: sy,
        width: 210,
        height: 28,
        cornerRadius: 8,
      });
      applyThemeColor(doc, `Server Blade ${idx}`, 'Panel');

      addShape(doc, {
        parent: botPlane,
        kind: 'ellipse',
        name: `Blade LED ${idx}`,
        x: -84,
        y: sy,
        width: 10,
        height: 10,
      });
      applyThemeColor(doc, `Blade LED ${idx}`, idx === 2 ? 'Primary' : 'Accent');

      addShape(doc, {
        parent: botPlane,
        kind: 'rectangle',
        name: `Blade Bar ${idx}`,
        x: 12,
        y: sy,
        width: idx === 1 ? 130 : idx === 2 ? 96 : 114,
        height: 6,
        cornerRadius: 3,
      });
      applyThemeColor(doc, `Blade Bar ${idx}`, idx === 3 ? 'Highlight' : 'Primary');
    }

    // Streaming perimeter circuit trace on bottom deck
    const botTrace = addShape(doc, {
      parent: botPlane,
      kind: 'rectangle',
      name: 'Bottom Trace',
      x: 0,
      y: 0,
      width: 238,
      height: 168,
      cornerRadius: 18,
      fill: null,
    });
    const [botTraceStroke, botTraceSolid] = solidStroke(botTrace.id, 0xff00e5bb, 3);
    botTraceStroke.props.cap = 1;
    const botTraceTrim = obj('TrimPath', {
      name: 'Bottom Trace Trim',
      parentId: botTraceStroke.id,
      start: 0,
      end: 0.22,
      offset: 0,
      modeValue: 1,
    });
    ab.objects.push(botTraceStroke, botTraceSolid, botTraceTrim);
    applyThemeColor(doc, 'Bottom Trace', 'Accent', 'Stroke');

    // -------------------------------------------------------------------------
    // 3. Middle Deck: Real-time Analytics & Telemetry (16% pointer shift)
    // -------------------------------------------------------------------------
    addGroup(doc, { name: 'Middle Parallax', x: 300, y: 265 });
    addDistanceConstraint(doc, { object: 'Middle Parallax', target: 'Stack Anchor', distance: 0, strength: 0.84 });
    addGroup(doc, { parent: 'Middle Parallax', name: 'Middle Float', x: 0, y: -6 });
    addGroup(doc, { parent: 'Middle Float', name: 'Middle Offset', x: 0, y: 0 });

    const midShadowPlane = addIsoPlane(doc, 'Middle Offset', 'Mid Shadow', 24);
    addShape(doc, {
      parent: midShadowPlane,
      kind: 'rectangle',
      name: 'Mid Shadow',
      x: 0,
      y: 0,
      width: 240,
      height: 172,
      cornerRadius: 22,
      fill: '#00000055',
    });

    const midBevelPlane = addIsoPlane(doc, 'Middle Offset', 'Mid Bevel', 11);
    addShape(doc, {
      parent: midBevelPlane,
      kind: 'rectangle',
      name: 'Mid Bevel',
      x: 0,
      y: 0,
      width: 240,
      height: 172,
      cornerRadius: 22,
      stroke: '#3b82f655',
      strokeWidth: 1.5,
    });
    applyThemeColor(doc, 'Mid Bevel', 'Deck Side');

    const midPlane = addIsoPlane(doc, 'Middle Offset', 'Mid Card', 0);
    addShape(doc, {
      parent: midPlane,
      kind: 'rectangle',
      name: 'Mid Card',
      x: 0,
      y: 0,
      width: 240,
      height: 172,
      cornerRadius: 22,
      stroke: '#60a5faaa',
      strokeWidth: 2,
    });
    applyThemeColor(doc, 'Mid Card', 'Deck Mid');

    // Recessed chart well on left of Middle Deck
    addShape(doc, {
      parent: midPlane,
      kind: 'rectangle',
      name: 'Chart Panel',
      x: -36,
      y: 10,
      width: 138,
      height: 112,
      cornerRadius: 14,
    });
    applyThemeColor(doc, 'Chart Panel', 'Panel');

    // 5 animated telemetry bars inside Chart Panel
    const barSpecs = [
      { name: 'Bar 1', x: -84, h: 38, color: 'Primary' },
      { name: 'Bar 2', x: -60, h: 62, color: 'Primary' },
      { name: 'Bar 3', x: -36, h: 48, color: 'Highlight' },
      { name: 'Bar 4', x: -12, h: 78, color: 'Accent' },
      { name: 'Bar 5', x: 12, h: 66, color: 'Accent' },
    ] as const;
    for (const b of barSpecs) {
      addShape(doc, {
        parent: midPlane,
        kind: 'rectangle',
        name: b.name,
        x: b.x,
        y: 52 - b.h / 2,
        width: 14,
        height: b.h,
        cornerRadius: 5,
      });
      applyThemeColor(doc, b.name, b.color);
    }

    // Glowing spline trendline with TrimPath across the chart
    const spline = addPath(doc, {
      parent: midPlane,
      name: 'Spline Wave',
      x: -36,
      y: 4,
      closed: false,
      fill: null,
      points: [
        { x: -52, y: 26, outX: 12, outY: -6 },
        { x: -20, y: -4, inX: -12, inY: 2, outX: 12, outY: -2 },
        { x: 8, y: 10, inX: -10, inY: 0, outX: 10, outY: 0 },
        { x: 34, y: -22, inX: -10, inY: 6, outX: 10, outY: -6 },
        { x: 54, y: -32, inX: -10, inY: 4 },
      ],
    });
    const [splineStroke, splineSolid] = solidStroke(spline.id, 0xff00e5bb, 4);
    splineStroke.props.cap = 1;
    splineStroke.props.join = 1;
    const splineTrim = obj('TrimPath', {
      name: 'Spline Trim',
      parentId: splineStroke.id,
      start: 0,
      end: 1,
      offset: 0,
      modeValue: 1,
    });
    ab.objects.push(splineStroke, splineSolid, splineTrim);
    applyThemeColor(doc, 'Spline Wave', 'Accent', 'Stroke');

    // Circular performance ring gauge on right of Middle Deck
    addShape(doc, {
      parent: midPlane,
      kind: 'ellipse',
      name: 'Gauge Track',
      x: 68,
      y: 10,
      width: 66,
      height: 66,
      fill: null,
      stroke: '#ffffff1f',
      strokeWidth: 9,
    });
    const gaugeArc = addShape(doc, {
      parent: midPlane,
      kind: 'ellipse',
      name: 'Gauge Arc',
      x: 68,
      y: 10,
      width: 66,
      height: 66,
      fill: null,
      rotation: -90,
    });
    const [gaugeStroke, gaugeSolid] = solidStroke(gaugeArc.id, 0xffa855f7, 9);
    gaugeStroke.props.cap = 1;
    const gaugeTrim = obj('TrimPath', {
      name: 'Gauge Trim',
      parentId: gaugeStroke.id,
      start: 0,
      end: 0.68,
      offset: 0,
      modeValue: 1,
    });
    ab.objects.push(gaugeStroke, gaugeSolid, gaugeTrim);
    applyThemeColor(doc, 'Gauge Arc', 'Highlight', 'Stroke');

    addShape(doc, {
      parent: midPlane,
      kind: 'ellipse',
      name: 'Gauge Core',
      x: 68,
      y: 10,
      width: 20,
      height: 20,
    });
    applyThemeColor(doc, 'Gauge Core', 'Accent');

    // Header pill on Middle Deck
    addShape(doc, {
      parent: midPlane,
      kind: 'rectangle',
      name: 'Mid Header Pill',
      x: -44,
      y: -62,
      width: 112,
      height: 12,
      cornerRadius: 6,
    });
    applyThemeColor(doc, 'Mid Header Pill', 'Muted');

    addShape(doc, {
      parent: midPlane,
      kind: 'ellipse',
      name: 'Mid Header Dot',
      x: 84,
      y: -62,
      width: 14,
      height: 14,
    });
    applyThemeColor(doc, 'Mid Header Dot', 'Accent');

    // -------------------------------------------------------------------------
    // 4. Top Deck: Hero Command Card & Holographic Sheen (26% pointer shift)
    // -------------------------------------------------------------------------
    addGroup(doc, { name: 'Top Parallax', x: 300, y: 265 });
    addDistanceConstraint(doc, { object: 'Top Parallax', target: 'Stack Anchor', distance: 0, strength: 0.74 });
    addGroup(doc, { parent: 'Top Parallax', name: 'Top Float', x: 0, y: -68 });
    addGroup(doc, { parent: 'Top Float', name: 'Top Offset', x: 0, y: 0 });

    const topShadowPlane = addIsoPlane(doc, 'Top Offset', 'Top Shadow', 26);
    addShape(doc, {
      parent: topShadowPlane,
      kind: 'rectangle',
      name: 'Top Shadow',
      x: 0,
      y: 0,
      width: 210,
      height: 148,
      cornerRadius: 20,
      fill: '#00000066',
    });

    const topBevelPlane = addIsoPlane(doc, 'Top Offset', 'Top Bevel', 10);
    addShape(doc, {
      parent: topBevelPlane,
      kind: 'rectangle',
      name: 'Top Bevel',
      x: 0,
      y: 0,
      width: 210,
      height: 148,
      cornerRadius: 20,
      stroke: '#00e5bb55',
      strokeWidth: 1.5,
    });
    applyThemeColor(doc, 'Top Bevel', 'Deck Side');

    const topPlane = addIsoPlane(doc, 'Top Offset', 'Top Card', 0);
    addShape(doc, {
      parent: topPlane,
      kind: 'rectangle',
      name: 'Top Card',
      x: 0,
      y: 0,
      width: 210,
      height: 148,
      cornerRadius: 20,
      stroke: '#00e5bbcc',
      strokeWidth: 2.5,
    });
    applyThemeColor(doc, 'Top Card', 'Deck Top');

    // Window controls on Top Card
    addShape(doc, { parent: topPlane, kind: 'ellipse', name: 'Window Dot 1', x: -78, y: -50, width: 10, height: 10, fill: '#ff5f56' });
    addShape(doc, { parent: topPlane, kind: 'ellipse', name: 'Window Dot 2', x: -62, y: -50, width: 10, height: 10, fill: '#ffbd2e' });
    addShape(doc, { parent: topPlane, kind: 'ellipse', name: 'Window Dot 3', x: -46, y: -50, width: 10, height: 10, fill: '#27c93f' });

    // Code / workflow rows on left of Top Card
    addShape(doc, { parent: topPlane, kind: 'rectangle', name: 'Code Line 1', x: -44, y: -22, width: 82, height: 10, cornerRadius: 5 });
    applyThemeColor(doc, 'Code Line 1', 'Ink');
    addShape(doc, { parent: topPlane, kind: 'rectangle', name: 'Code Line 2', x: -32, y: -2, width: 96, height: 9, cornerRadius: 4.5 });
    applyThemeColor(doc, 'Code Line 2', 'Primary');
    addShape(doc, { parent: topPlane, kind: 'rectangle', name: 'Code Line 3', x: -48, y: 18, width: 72, height: 9, cornerRadius: 4.5 });
    applyThemeColor(doc, 'Code Line 3', 'Accent');
    addShape(doc, { parent: topPlane, kind: 'rectangle', name: 'Code Line 4', x: -38, y: 38, width: 88, height: 9, cornerRadius: 4.5 });
    applyThemeColor(doc, 'Code Line 4', 'Highlight');

    // Hero verification badge on right of Top Card
    addShape(doc, {
      parent: topPlane,
      kind: 'rectangle',
      name: 'Hero Badge',
      x: 52,
      y: 8,
      width: 68,
      height: 68,
      cornerRadius: 18,
    });
    applyThemeColor(doc, 'Hero Badge', 'Primary');

    const checkIcon = addPath(doc, {
      parent: 'Hero Badge',
      name: 'Check Icon',
      x: 0,
      y: 0,
      closed: false,
      fill: null,
      points: [
        { x: -16, y: 2 },
        { x: -4, y: 14 },
        { x: 18, y: -12 },
      ],
    });
    const [checkStroke, checkSolid] = solidStroke(checkIcon.id, 0xffffffff, 5.5);
    checkStroke.props.cap = 1;
    checkStroke.props.join = 1;
    ab.objects.push(checkStroke, checkSolid);
    applyThemeColor(doc, 'Check Icon', 'Ink', 'Stroke');

    // Clipped diagonal holographic sheen across Top Card
    addGroup(doc, { parent: topPlane, name: 'Top Shine Group', x: 0, y: 0 });
    addPath(doc, {
      parent: 'Top Shine Group',
      name: 'Top Shine',
      x: -180,
      y: 0,
      closed: true,
      fill: '#ffffff36',
      points: [
        { x: -24, y: -110 },
        { x: 22, y: -110 },
        { x: -58, y: 110 },
        { x: -104, y: 110 },
      ],
    });
    addShape(doc, {
      parent: topPlane,
      kind: 'rectangle',
      name: 'Top Card Mask',
      x: 0,
      y: 0,
      width: 210,
      height: 148,
      cornerRadius: 20,
      fill: null,
    });
    addClip(doc, { object: 'Top Shine Group', source: 'Top Card Mask' });

    // -------------------------------------------------------------------------
    // 5. Orbit Layer: Floating Satellites & Shockwave Ring (36% pointer shift)
    // -------------------------------------------------------------------------
    addGroup(doc, { name: 'Orbit Parallax', x: 300, y: 265 });
    addDistanceConstraint(doc, { object: 'Orbit Parallax', target: 'Stack Anchor', distance: 0, strength: 0.64 });
    addGroup(doc, { parent: 'Orbit Parallax', name: 'Orbit Float', x: 0, y: -85 });

    // Isometric shockwave ring triggered on click
    const pulsePlane = addIsoPlane(doc, 'Orbit Float', 'Pulse Ring', 60);
    const pulseRing = addShape(doc, {
      parent: pulsePlane,
      kind: 'rectangle',
      name: 'Pulse Ring',
      x: 0,
      y: 0,
      width: 230,
      height: 170,
      cornerRadius: 26,
      fill: null,
      stroke: '#00e5bb',
      strokeWidth: 4,
    });
    pulseRing.props.opacity = 0;
    applyThemeColor(doc, 'Pulse Ring', 'Accent', 'Stroke');

    // Floating top-right status pill ("LIVE")
    addGroup(doc, { parent: 'Orbit Float', name: 'Live Satellite', x: 148, y: -18 });
    addShape(doc, {
      parent: 'Live Satellite',
      kind: 'rectangle',
      name: 'Live Pill',
      x: 0,
      y: 0,
      width: 86,
      height: 32,
      cornerRadius: 16,
      stroke: '#00e5bb88',
      strokeWidth: 1.5,
    });
    applyThemeColor(doc, 'Live Pill', 'Deck Top');
    addShape(doc, {
      parent: 'Live Satellite',
      kind: 'ellipse',
      name: 'Live Dot',
      x: -24,
      y: 0,
      width: 10,
      height: 10,
    });
    applyThemeColor(doc, 'Live Dot', 'Accent');
    addShape(doc, {
      parent: 'Live Satellite',
      kind: 'rectangle',
      name: 'Live Label Bar',
      x: 10,
      y: 0,
      width: 38,
      height: 7,
      cornerRadius: 3.5,
    });
    applyThemeColor(doc, 'Live Label Bar', 'Ink');

    // Floating bottom-left prism satellite
    addGroup(doc, { parent: 'Orbit Float', name: 'Prism Satellite', x: -156, y: 64 });
    addShape(doc, {
      parent: 'Prism Satellite',
      kind: 'polygon',
      name: 'Prism Hex',
      x: 0,
      y: 0,
      width: 48,
      height: 48,
      points: 6,
      cornerRadius: 6,
      stroke: '#a855f7aa',
      strokeWidth: 2,
    });
    applyThemeColor(doc, 'Prism Hex', 'Deck Mid');
    addShape(doc, {
      parent: 'Prism Satellite',
      kind: 'star',
      name: 'Prism Core',
      x: 0,
      y: 0,
      width: 24,
      height: 24,
      points: 4,
      innerRadius: 0.45,
    });
    applyThemeColor(doc, 'Prism Core', 'Highlight');

    // -------------------------------------------------------------------------
    // Timelines
    // -------------------------------------------------------------------------
    // 1. Intro: staggered 3D assembly
    addAnimation(doc, { name: 'Intro', duration: 1.2, loop: 'oneShot' });
    const ki = (object: string, property: string, keys: Parameters<typeof addKeyframes>[1]['keys']) =>
      addKeyframes(doc, { animation: 'Intro', object, property, keys });

    for (const [node, restY, startFrame] of [
      ['Bottom Float', 52, 0],
      ['Middle Float', -6, 10],
      ['Top Float', -68, 20],
      ['Orbit Float', -85, 28],
    ] as const) {
      ki(node, 'y', [
        { frame: 0, value: restY + 60 },
        { frame: startFrame, value: restY + 60, ease: 'easeOutBack' },
        { frame: startFrame + 34, value: restY },
      ]);
      ki(node, 'opacity', [
        { frame: 0, value: 0 },
        { frame: startFrame, value: 0, ease: 'easeOut' },
        { frame: startFrame + 18, value: 1 },
      ]);
      for (const s of ['scaleX', 'scaleY'] as const) {
        ki(node, s, [
          { frame: 0, value: 0.72 },
          { frame: startFrame, value: 0.72, ease: 'easeOutBack' },
          { frame: startFrame + 34, value: 1 },
        ]);
      }
    }
    ki('Top Shine', 'x', [
      { frame: 0, value: -180 },
      { frame: 36, value: -180, ease: 'easeInOut' },
      { frame: 70, value: 260 },
    ]);

    // 2. Float: continuous levitation + live streaming telemetry
    addAnimation(doc, { name: 'Float', duration: 3.0, loop: 'loop' });
    const kf = (object: string, property: string, keys: Parameters<typeof addKeyframes>[1]['keys']) =>
      addKeyframes(doc, { animation: 'Float', object, property, keys });

    kf('Bottom Float', 'y', [
      { frame: 0, value: 52, ease: 'easeInOut' },
      { frame: 90, value: 46, ease: 'easeInOut' },
      { frame: 180, value: 52 },
    ]);
    kf('Middle Float', 'y', [
      { frame: 0, value: -6, ease: 'easeInOut' },
      { frame: 90, value: -15, ease: 'easeInOut' },
      { frame: 180, value: -6 },
    ]);
    kf('Top Float', 'y', [
      { frame: 0, value: -68, ease: 'easeInOut' },
      { frame: 90, value: -80, ease: 'easeInOut' },
      { frame: 180, value: -68 },
    ]);
    kf('Live Satellite', 'y', [
      { frame: 0, value: -18, ease: 'easeInOut' },
      { frame: 90, value: -28, ease: 'easeInOut' },
      { frame: 180, value: -18 },
    ]);
    kf('Prism Satellite', 'y', [
      { frame: 0, value: 64, ease: 'easeInOut' },
      { frame: 90, value: 52, ease: 'easeInOut' },
      { frame: 180, value: 64 },
    ]);
    kf('Prism Core', 'rotationDegrees', [
      { frame: 0, value: 0, ease: 'linear' },
      { frame: 180, value: 360 },
    ]);

    // Continuous data stream around Bottom Trace
    kf('Bottom Trace Trim', 'offset', [
      { frame: 0, value: 0, ease: 'linear' },
      { frame: 180, value: 1 },
    ]);

    // Animated telemetry bars
    for (const [bar, peak, midFrame] of [
      ['Bar 1', 1.32, 60],
      ['Bar 2', 0.72, 90],
      ['Bar 3', 1.4, 110],
      ['Bar 4', 0.82, 75],
      ['Bar 5', 1.25, 130],
    ] as const) {
      kf(bar, 'scaleY', [
        { frame: 0, value: 1, ease: 'easeInOut' },
        { frame: midFrame, value: peak, ease: 'easeInOut' },
        { frame: 180, value: 1 },
      ]);
    }

    // Live dot breathing
    for (const s of ['scaleX', 'scaleY'] as const) {
      kf('Live Dot', s, [
        { frame: 0, value: 1, ease: 'easeInOut' },
        { frame: 45, value: 1.45, ease: 'easeInOut' },
        { frame: 90, value: 1, ease: 'easeInOut' },
        { frame: 135, value: 1.45, ease: 'easeInOut' },
        { frame: 180, value: 1 },
      ]);
    }

    // 3. Hover layer: Collapsed vs. Expanded (3D exploded view)
    addAnimation(doc, { name: 'Collapsed', duration: 0.3, loop: 'oneShot' });
    addKeyframes(doc, { animation: 'Collapsed', object: 'Bottom Offset', property: 'y', keys: [{ frame: 0, value: 0 }] });
    addKeyframes(doc, { animation: 'Collapsed', object: 'Middle Offset', property: 'y', keys: [{ frame: 0, value: 0 }] });
    addKeyframes(doc, { animation: 'Collapsed', object: 'Top Offset', property: 'y', keys: [{ frame: 0, value: 0 }] });
    for (const s of ['scaleX', 'scaleY'] as const) {
      addKeyframes(doc, { animation: 'Collapsed', object: 'Top Offset', property: s, keys: [{ frame: 0, value: 1 }] });
      addKeyframes(doc, { animation: 'Collapsed', object: 'Middle Offset', property: s, keys: [{ frame: 0, value: 1 }] });
    }
    addKeyframes(doc, { animation: 'Collapsed', object: 'Gauge Trim', property: 'end', keys: [{ frame: 0, value: 0.68 }] });
    addKeyframes(doc, { animation: 'Collapsed', object: 'Top Shine', property: 'x', keys: [{ frame: 0, value: -180 }] });

    addAnimation(doc, { name: 'Expanded', duration: 0.45, loop: 'oneShot' });
    addKeyframes(doc, {
      animation: 'Expanded',
      object: 'Bottom Offset',
      property: 'y',
      keys: [
        { frame: 0, value: 0, ease: 'easeOutBack' },
        { frame: 24, value: 22 },
      ],
    });
    addKeyframes(doc, {
      animation: 'Expanded',
      object: 'Middle Offset',
      property: 'y',
      keys: [
        { frame: 0, value: 0, ease: 'easeOutBack' },
        { frame: 24, value: -8 },
      ],
    });
    addKeyframes(doc, {
      animation: 'Expanded',
      object: 'Top Offset',
      property: 'y',
      keys: [
        { frame: 0, value: 0, ease: 'easeOutBack' },
        { frame: 24, value: -34 },
      ],
    });
    for (const s of ['scaleX', 'scaleY'] as const) {
      addKeyframes(doc, {
        animation: 'Expanded',
        object: 'Middle Offset',
        property: s,
        keys: [
          { frame: 0, value: 1, ease: 'easeOutBack' },
          { frame: 24, value: 1.04 },
        ],
      });
      addKeyframes(doc, {
        animation: 'Expanded',
        object: 'Top Offset',
        property: s,
        keys: [
          { frame: 0, value: 1, ease: 'easeOutBack' },
          { frame: 24, value: 1.08 },
        ],
      });
    }
    addKeyframes(doc, {
      animation: 'Expanded',
      object: 'Gauge Trim',
      property: 'end',
      keys: [
        { frame: 0, value: 0.68, ease: 'easeOutBack' },
        { frame: 27, value: 0.92 },
      ],
    });
    addKeyframes(doc, {
      animation: 'Expanded',
      object: 'Top Shine',
      property: 'x',
      keys: [
        { frame: 0, value: -180, ease: 'easeInOut' },
        { frame: 27, value: 260 },
      ],
    });

    // 4. Click layer: Pulse Idle vs. Pulse Burst
    addAnimation(doc, { name: 'Pulse Idle', duration: 0.1, loop: 'oneShot' });
    addKeyframes(doc, { animation: 'Pulse Idle', object: 'Pulse Ring', property: 'opacity', keys: [{ frame: 0, value: 0 }] });
    for (const s of ['scaleX', 'scaleY'] as const) {
      addKeyframes(doc, { animation: 'Pulse Idle', object: 'Pulse Ring', property: s, keys: [{ frame: 0, value: 0.5 }] });
      addKeyframes(doc, { animation: 'Pulse Idle', object: 'Hero Badge', property: s, keys: [{ frame: 0, value: 1 }] });
    }
    addKeyframes(doc, { animation: 'Pulse Idle', object: 'Hero Badge', property: 'rotationDegrees', keys: [{ frame: 0, value: 0 }] });

    addAnimation(doc, { name: 'Pulse Burst', duration: 0.65, loop: 'oneShot' });
    addKeyframes(doc, {
      animation: 'Pulse Burst',
      object: 'Pulse Ring',
      property: 'opacity',
      keys: [
        { frame: 0, value: 1, ease: 'easeOut' },
        { frame: 39, value: 0 },
      ],
    });
    for (const s of ['scaleX', 'scaleY'] as const) {
      addKeyframes(doc, {
        animation: 'Pulse Burst',
        object: 'Pulse Ring',
        property: s,
        keys: [
          { frame: 0, value: 0.55, ease: 'easeOut' },
          { frame: 39, value: 1.75 },
        ],
      });
      addKeyframes(doc, {
        animation: 'Pulse Burst',
        object: 'Hero Badge',
        property: s,
        keys: [
          { frame: 0, value: 1, ease: 'easeOut' },
          { frame: 8, value: 0.84, ease: 'easeOutBack' },
          { frame: 24, value: 1.28, ease: 'easeInOut' },
          { frame: 39, value: 1 },
        ],
      });
    }
    addKeyframes(doc, {
      animation: 'Pulse Burst',
      object: 'Hero Badge',
      property: 'rotationDegrees',
      keys: [
        { frame: 0, value: 0, ease: 'easeOutBack' },
        { frame: 39, value: 360 },
      ],
    });

    // -------------------------------------------------------------------------
    // State Machine (3 layers: Main motion, Hover exploded view, Click pulse)
    // -------------------------------------------------------------------------
    addStateMachine(doc, { name: 'Hero Stack' });
    addInput(doc, { type: 'boolean', name: 'isHovered' });
    addInput(doc, { type: 'trigger', name: 'pulse' });

    const machine = ab.stateMachines[0];
    machine.children!.find((c) => c.type === 'StateMachineLayer')!.props.name = 'Motion';
    addState(doc, { layer: 'Motion', animation: 'Intro', x: 180, y: 20 });
    addState(doc, { layer: 'Motion', animation: 'Float', x: 380, y: 20 });
    addTransition(doc, { layer: 'Motion', from: 'entry', to: 'Intro' });
    addTransition(doc, { layer: 'Motion', from: 'Intro', to: 'Float', exitTimeMs: 1200, durationMs: 250 });

    addLayer(doc, 'Hero Stack', 'Hover');
    addState(doc, { layer: 'Hover', animation: 'Collapsed', x: 180, y: 20 });
    addState(doc, { layer: 'Hover', animation: 'Expanded', x: 380, y: 20 });
    addTransition(doc, { layer: 'Hover', from: 'entry', to: 'Collapsed' });
    addTransition(doc, { layer: 'Hover', from: 'Collapsed', to: 'Expanded', durationMs: 220, conditions: [{ input: 'isHovered', value: true }] });
    addTransition(doc, { layer: 'Hover', from: 'Expanded', to: 'Collapsed', durationMs: 260, conditions: [{ input: 'isHovered', value: false }] });

    addLayer(doc, 'Hero Stack', 'Click');
    addState(doc, { layer: 'Click', animation: 'Pulse Idle', x: 180, y: 20 });
    addState(doc, { layer: 'Click', animation: 'Pulse Burst', x: 380, y: 20 });
    addTransition(doc, { layer: 'Click', from: 'entry', to: 'Pulse Idle' });
    addTransition(doc, { layer: 'Click', from: 'any', to: 'Pulse Burst', conditions: [{ input: 'pulse' }] });
    addTransition(doc, { layer: 'Click', from: 'Pulse Burst', to: 'Pulse Idle', exitTimeMs: 650, durationMs: 120 });

    // Full-artboard hit area drawn at the back for pointer tracking, hover, and click
    const hit = addShape(doc, {
      kind: 'rectangle',
      name: 'Hit Area',
      x: 300,
      y: 250,
      width: 600,
      height: 500,
      fill: '#ffffff00',
    });
    moveBefore(ab, hit.id, null, ab.artboard.id);

    addListener(doc, {
      target: 'Hit Area',
      event: 'move',
      name: 'Parallax Tilt',
      actions: [
        { alignTarget: 'Shadow Parallax' },
        { alignTarget: 'Bottom Parallax' },
        { alignTarget: 'Middle Parallax' },
        { alignTarget: 'Top Parallax' },
        { alignTarget: 'Orbit Parallax' },
      ],
    });
    addListener(doc, {
      target: 'Hit Area',
      event: 'enter',
      name: 'Expand Stack',
      actions: [{ input: 'isHovered', value: true }],
    });
    addListener(doc, {
      target: 'Hit Area',
      event: 'exit',
      name: 'Collapse Stack',
      actions: [{ input: 'isHovered', value: false }],
    });
    addListener(doc, {
      target: 'Hit Area',
      event: 'click',
      name: 'Trigger Pulse',
      actions: [{ input: 'pulse' }],
    });

    // Themes: Midnight (default) + Daylight
    doc.editor!.themes[0].name = 'Midnight';
    const daylight = addTheme(doc, 'Daylight');
    const swatchId = (n: string) => doc.editor!.swatches.find((s) => s.name === n)!.id;
    setSwatchColor(doc, swatchId('Background'), 0xfff1f5f9, daylight.id);
    setSwatchColor(doc, swatchId('Deck Base'), 0xffdbe4f3, daylight.id);
    setSwatchColor(doc, swatchId('Deck Side'), 0xff94a3b8, daylight.id);
    setSwatchColor(doc, swatchId('Deck Mid'), 0xffffffff, daylight.id);
    setSwatchColor(doc, swatchId('Deck Top'), 0xffffffff, daylight.id);
    setSwatchColor(doc, swatchId('Panel'), 0xffe2e8f0, daylight.id);
    setSwatchColor(doc, swatchId('Primary'), 0xff2563eb, daylight.id);
    setSwatchColor(doc, swatchId('Accent'), 0xff059669, daylight.id);
    setSwatchColor(doc, swatchId('Highlight'), 0xff7c3aed, daylight.id);
    setSwatchColor(doc, swatchId('Ink'), 0xff0f172a, daylight.id);
    setSwatchColor(doc, swatchId('Muted'), 0xff64748b, daylight.id);
    applyTheme(doc, doc.editor!.themes[0].id);

    return doc;
  },
};

export const heroBotMascot: Template = {
  id: 'hero-bot-mascot',
  name: 'Interactive Drone Companion',
  description: 'A 2.5D hovering AI robot mascot that turns its head and visor toward your cursor, blinks, beams with happy eyes on hover, and does a 360° boost jump on click.',
  learn: ['2.5D character head-turn rig', 'Multi-depth cursor tracking', '4-layer character state machine', 'Autonomous blink & expression morph'],
  build() {
    const doc = base('Interactive Drone Companion', 600, 500, '#090d18');
    const ab = getArtboard(doc);

    // Theme palette: Cyber Titanium (default dark) + Solar Light
    defineColor(doc, 'Shell Main', '#e2e8f0');
    defineColor(doc, 'Shell Rim', '#94a3b8');
    defineColor(doc, 'Shell Dark', '#1e293b');
    defineColor(doc, 'Visor', '#0b1120');
    defineColor(doc, 'Energy', '#00f0ff');
    defineColor(doc, 'Accent', '#3b82f6');
    defineColor(doc, 'Beacon', '#ff4d8d');
    defineColor(doc, 'Halo', '#a855f7');

    // Central anchor for 2.5D spherical head/body turn parallax
    addGroup(doc, { name: 'Bot Anchor', x: 300, y: 245 });

    // -------------------------------------------------------------------------
    // 1. Ground Shadow & Thruster Reflection (4% pointer shift)
    // -------------------------------------------------------------------------
    addGroup(doc, { name: 'Ground Parallax', x: 300, y: 245 });
    addDistanceConstraint(doc, { object: 'Ground Parallax', target: 'Bot Anchor', distance: 0, strength: 0.96 });
    addGroup(doc, { parent: 'Ground Parallax', name: 'Ground Float', x: 0, y: 176 });

    addShape(doc, {
      parent: 'Ground Float',
      kind: 'ellipse',
      name: 'Ground Aura',
      x: 0,
      y: 0,
      width: 310,
      height: 68,
      fill: '#00f0ff1c',
    });
    addShape(doc, {
      parent: 'Ground Float',
      kind: 'ellipse',
      name: 'Ground Shadow',
      x: 0,
      y: 0,
      width: 168,
      height: 32,
      fill: '#00000088',
    });
    addShape(doc, {
      parent: 'Ground Float',
      kind: 'ellipse',
      name: 'Thruster Floor Ring',
      x: 0,
      y: 0,
      width: 96,
      height: 18,
      fill: null,
      stroke: '#00f0ff66',
      strokeWidth: 2.5,
    });
    applyThemeColor(doc, 'Thruster Floor Ring', 'Energy', 'Stroke');

    // -------------------------------------------------------------------------
    // 2. Backdrop Energy Halo & Shockwave Ring (7% pointer shift)
    // -------------------------------------------------------------------------
    addGroup(doc, { name: 'Halo Parallax', x: 300, y: 245 });
    addDistanceConstraint(doc, { object: 'Halo Parallax', target: 'Bot Anchor', distance: 0, strength: 0.93 });
    addGroup(doc, { parent: 'Halo Parallax', name: 'Halo Float', x: 0, y: 4 });

    addShape(doc, {
      parent: 'Halo Float',
      kind: 'ellipse',
      name: 'Back Aura',
      x: 0,
      y: -10,
      width: 340,
      height: 340,
      fill: '#3b82f614',
    });

    const orbitTilt = addGroup(doc, { parent: 'Halo Float', name: 'Orbit Ring Tilt', x: 0, y: 18 });
    orbitTilt.props.rotation = (-16 * Math.PI) / 180;
    const orbitSquash = addGroup(doc, { parent: 'Orbit Ring Tilt', name: 'Orbit Ring Squash', x: 0, y: 0 });
    orbitSquash.props.scaleY = 0.36;

    addShape(doc, {
      parent: 'Orbit Ring Squash',
      kind: 'ellipse',
      name: 'Orbit Ring Track',
      x: 0,
      y: 0,
      width: 356,
      height: 356,
      fill: null,
      stroke: '#38bdf82e',
      strokeWidth: 4,
    });
    const orbitPulse = addShape(doc, {
      parent: 'Orbit Ring Squash',
      kind: 'ellipse',
      name: 'Orbit Ring Pulse',
      x: 0,
      y: 0,
      width: 356,
      height: 356,
      fill: null,
    });
    const [orbitStroke, orbitSolid] = solidStroke(orbitPulse.id, 0xff00f0ff, 5);
    orbitStroke.props.cap = 1;
    const orbitTrim = obj('TrimPath', {
      name: 'Orbit Trim',
      parentId: orbitStroke.id,
      start: 0,
      end: 0.28,
      offset: 0,
      modeValue: 1,
    });
    ab.objects.push(orbitStroke, orbitSolid, orbitTrim);
    applyThemeColor(doc, 'Orbit Ring Pulse', 'Energy', 'Stroke');

    const shockwave = addShape(doc, {
      parent: 'Halo Float',
      kind: 'ellipse',
      name: 'Salute Shockwave',
      x: 0,
      y: -16,
      width: 220,
      height: 220,
      fill: null,
      stroke: '#00f0ff',
      strokeWidth: 5,
    });
    shockwave.props.opacity = 0;
    applyThemeColor(doc, 'Salute Shockwave', 'Energy', 'Stroke');

    // -------------------------------------------------------------------------
    // 3. Hover Torso, Jet Thruster & Floating Hands (13% pointer shift)
    // -------------------------------------------------------------------------
    addGroup(doc, { name: 'Body Parallax', x: 300, y: 245 });
    addDistanceConstraint(doc, { object: 'Body Parallax', target: 'Bot Anchor', distance: 0, strength: 0.87 });
    addGroup(doc, { parent: 'Body Parallax', name: 'Body Float', x: 0, y: 78 });
    addGroup(doc, { parent: 'Body Float', name: 'Body Action', x: 0, y: 0 });

    // Jet thruster plume & nozzle underneath torso
    addShape(doc, {
      parent: 'Body Action',
      kind: 'ellipse',
      name: 'Thruster Flame Outer',
      x: 0,
      y: 68,
      width: 36,
      height: 48,
    });
    applyThemeColor(doc, 'Thruster Flame Outer', 'Energy');

    addShape(doc, {
      parent: 'Body Action',
      kind: 'ellipse',
      name: 'Thruster Flame Core',
      x: 0,
      y: 62,
      width: 18,
      height: 28,
      fill: '#ffffff',
    });

    addShape(doc, {
      parent: 'Body Action',
      kind: 'rectangle',
      name: 'Thruster Nozzle',
      x: 0,
      y: 46,
      width: 54,
      height: 20,
      cornerRadius: 8,
    });
    applyThemeColor(doc, 'Thruster Nozzle', 'Shell Dark');

    // Torso 3D bevel & main capsule
    addShape(doc, {
      parent: 'Body Action',
      kind: 'rectangle',
      name: 'Torso Shadow',
      x: 0,
      y: 7,
      width: 128,
      height: 92,
      cornerRadius: 44,
    });
    applyThemeColor(doc, 'Torso Shadow', 'Shell Rim');

    addShape(doc, {
      parent: 'Body Action',
      kind: 'rectangle',
      name: 'Torso Shell',
      x: 0,
      y: 0,
      width: 124,
      height: 88,
      cornerRadius: 42,
      stroke: '#ffffff55',
      strokeWidth: 2,
    });
    applyThemeColor(doc, 'Torso Shell', 'Shell Main');

    // Chest reactor bay
    addShape(doc, {
      parent: 'Body Action',
      kind: 'rectangle',
      name: 'Chest Panel',
      x: 0,
      y: 4,
      width: 78,
      height: 46,
      cornerRadius: 20,
    });
    applyThemeColor(doc, 'Chest Panel', 'Visor');

    addShape(doc, {
      parent: 'Body Action',
      kind: 'ellipse',
      name: 'Reactor Ring',
      x: 0,
      y: 4,
      width: 30,
      height: 30,
      fill: null,
      stroke: '#00f0ff',
      strokeWidth: 3,
    });
    applyThemeColor(doc, 'Reactor Ring', 'Energy', 'Stroke');

    addShape(doc, {
      parent: 'Body Action',
      kind: 'ellipse',
      name: 'Reactor Core',
      x: 0,
      y: 4,
      width: 14,
      height: 14,
    });
    applyThemeColor(doc, 'Reactor Core', 'Energy');

    // Floating Left Hand
    const handL = addGroup(doc, { parent: 'Body Action', name: 'Hand Left Group', x: -94, y: 4 });
    handL.props.rotation = (15 * Math.PI) / 180;
    addShape(doc, {
      parent: 'Hand Left Group',
      kind: 'rectangle',
      name: 'Hand Left Shadow',
      x: 0,
      y: 5,
      width: 30,
      height: 52,
      cornerRadius: 15,
    });
    applyThemeColor(doc, 'Hand Left Shadow', 'Shell Rim');
    addShape(doc, {
      parent: 'Hand Left Group',
      kind: 'rectangle',
      name: 'Hand Left',
      x: 0,
      y: 0,
      width: 28,
      height: 48,
      cornerRadius: 14,
    });
    applyThemeColor(doc, 'Hand Left', 'Shell Main');
    addShape(doc, {
      parent: 'Hand Left Group',
      kind: 'ellipse',
      name: 'Hand Left Pad',
      x: 6,
      y: 0,
      width: 8,
      height: 18,
    });
    applyThemeColor(doc, 'Hand Left Pad', 'Energy');

    // Floating Right Hand
    const handR = addGroup(doc, { parent: 'Body Action', name: 'Hand Right Group', x: 94, y: 4 });
    handR.props.rotation = (-15 * Math.PI) / 180;
    addShape(doc, {
      parent: 'Hand Right Group',
      kind: 'rectangle',
      name: 'Hand Right Shadow',
      x: 0,
      y: 5,
      width: 30,
      height: 52,
      cornerRadius: 15,
    });
    applyThemeColor(doc, 'Hand Right Shadow', 'Shell Rim');
    addShape(doc, {
      parent: 'Hand Right Group',
      kind: 'rectangle',
      name: 'Hand Right',
      x: 0,
      y: 0,
      width: 28,
      height: 48,
      cornerRadius: 14,
    });
    applyThemeColor(doc, 'Hand Right', 'Shell Main');
    addShape(doc, {
      parent: 'Hand Right Group',
      kind: 'ellipse',
      name: 'Hand Right Pad',
      x: -6,
      y: 0,
      width: 8,
      height: 18,
    });
    applyThemeColor(doc, 'Hand Right Pad', 'Energy');

    // -------------------------------------------------------------------------
    // 4. Head Dome, Acoustic Ears & Antenna (23% pointer shift)
    // -------------------------------------------------------------------------
    addGroup(doc, { name: 'Head Parallax', x: 300, y: 245 });
    addDistanceConstraint(doc, { object: 'Head Parallax', target: 'Bot Anchor', distance: 0, strength: 0.77 });
    addGroup(doc, { parent: 'Head Parallax', name: 'Head Float', x: 0, y: -38 });
    addGroup(doc, { parent: 'Head Float', name: 'Head Action', x: 0, y: 0 });

    // Top Antenna
    addGroup(doc, { parent: 'Head Action', name: 'Antenna Group', x: 0, y: -76 });
    addShape(doc, {
      parent: 'Antenna Group',
      kind: 'rectangle',
      name: 'Antenna Stem',
      x: 0,
      y: -6,
      width: 8,
      height: 30,
      cornerRadius: 4,
    });
    applyThemeColor(doc, 'Antenna Stem', 'Shell Rim');
    addShape(doc, {
      parent: 'Antenna Group',
      kind: 'rectangle',
      name: 'Antenna Base',
      x: 0,
      y: 10,
      width: 36,
      height: 14,
      cornerRadius: 7,
    });
    applyThemeColor(doc, 'Antenna Base', 'Shell Dark');

    const sigRing = addShape(doc, {
      parent: 'Antenna Group',
      kind: 'ellipse',
      name: 'Signal Ring',
      x: 0,
      y: -24,
      width: 28,
      height: 28,
      fill: null,
      stroke: '#ff4d8d',
      strokeWidth: 3,
    });
    sigRing.props.opacity = 0;
    applyThemeColor(doc, 'Signal Ring', 'Beacon', 'Stroke');

    addShape(doc, {
      parent: 'Antenna Group',
      kind: 'ellipse',
      name: 'Antenna Orb',
      x: 0,
      y: -24,
      width: 22,
      height: 22,
    });
    applyThemeColor(doc, 'Antenna Orb', 'Beacon');
    addShape(doc, {
      parent: 'Antenna Group',
      kind: 'ellipse',
      name: 'Antenna Glint',
      x: -4,
      y: -28,
      width: 7,
      height: 7,
      fill: '#ffffff',
    });

    // Side Ear Pods
    addShape(doc, {
      parent: 'Head Action',
      kind: 'rectangle',
      name: 'Ear Left',
      x: -102,
      y: 2,
      width: 28,
      height: 56,
      cornerRadius: 14,
      stroke: '#00f0ff66',
      strokeWidth: 2,
    });
    applyThemeColor(doc, 'Ear Left', 'Shell Dark');

    addShape(doc, {
      parent: 'Head Action',
      kind: 'rectangle',
      name: 'Ear Right',
      x: 102,
      y: 2,
      width: 28,
      height: 56,
      cornerRadius: 14,
      stroke: '#00f0ff66',
      strokeWidth: 2,
    });
    applyThemeColor(doc, 'Ear Right', 'Shell Dark');

    // Main 3D Helmet Shell
    addShape(doc, {
      parent: 'Head Action',
      kind: 'rectangle',
      name: 'Head Shadow',
      x: 0,
      y: 9,
      width: 196,
      height: 138,
      cornerRadius: 62,
    });
    applyThemeColor(doc, 'Head Shadow', 'Shell Rim');

    addShape(doc, {
      parent: 'Head Action',
      kind: 'rectangle',
      name: 'Head Shell',
      x: 0,
      y: 0,
      width: 192,
      height: 134,
      cornerRadius: 60,
      stroke: '#ffffff66',
      strokeWidth: 2,
    });
    applyThemeColor(doc, 'Head Shell', 'Shell Main');

    addShape(doc, {
      parent: 'Head Action',
      kind: 'ellipse',
      name: 'Head Specular',
      x: 0,
      y: -46,
      width: 116,
      height: 20,
      fill: '#ffffff66',
    });

    // -------------------------------------------------------------------------
    // 5. Curved Glass Visor Screen (33% pointer shift for 2.5D head rotation)
    // -------------------------------------------------------------------------
    addGroup(doc, { name: 'Visor Parallax', x: 300, y: 245 });
    addDistanceConstraint(doc, { object: 'Visor Parallax', target: 'Bot Anchor', distance: 0, strength: 0.67 });
    addGroup(doc, { parent: 'Visor Parallax', name: 'Visor Float', x: 0, y: -36 });
    addGroup(doc, { parent: 'Visor Float', name: 'Visor Action', x: 0, y: 0 });

    addShape(doc, {
      parent: 'Visor Action',
      kind: 'rectangle',
      name: 'Visor Rim',
      x: 0,
      y: 3,
      width: 158,
      height: 96,
      cornerRadius: 42,
    });
    applyThemeColor(doc, 'Visor Rim', 'Accent');

    addShape(doc, {
      parent: 'Visor Action',
      kind: 'rectangle',
      name: 'Visor Screen',
      x: 0,
      y: 0,
      width: 154,
      height: 92,
      cornerRadius: 40,
      stroke: '#00f0ff77',
      strokeWidth: 2,
    });
    applyThemeColor(doc, 'Visor Screen', 'Visor');

    const cheekL = addShape(doc, {
      parent: 'Visor Action',
      kind: 'ellipse',
      name: 'Visor Cheek Left',
      x: -48,
      y: 22,
      width: 22,
      height: 11,
    });
    cheekL.props.opacity = 0.25;
    applyThemeColor(doc, 'Visor Cheek Left', 'Beacon');

    const cheekR = addShape(doc, {
      parent: 'Visor Action',
      kind: 'ellipse',
      name: 'Visor Cheek Right',
      x: 48,
      y: 22,
      width: 22,
      height: 11,
    });
    cheekR.props.opacity = 0.25;
    applyThemeColor(doc, 'Visor Cheek Right', 'Beacon');

    // Clipped holographic visor reflection
    addGroup(doc, { parent: 'Visor Action', name: 'Visor Sheen Group', x: 0, y: 0 });
    addPath(doc, {
      parent: 'Visor Sheen Group',
      name: 'Visor Sheen',
      x: -130,
      y: 0,
      closed: true,
      fill: '#ffffff24',
      points: [
        { x: -18, y: -60 },
        { x: 18, y: -60 },
        { x: -34, y: 60 },
        { x: -70, y: 60 },
      ],
    });
    addShape(doc, {
      parent: 'Visor Action',
      kind: 'rectangle',
      name: 'Visor Screen Mask',
      x: 0,
      y: 0,
      width: 154,
      height: 92,
      cornerRadius: 40,
      fill: null,
    });
    addClip(doc, { object: 'Visor Sheen Group', source: 'Visor Screen Mask' });

    // -------------------------------------------------------------------------
    // 6. Expressive Eyes & Smile Layer (42% pointer shift inside visor)
    // -------------------------------------------------------------------------
    addGroup(doc, { name: 'Eyes Parallax', x: 300, y: 245 });
    addDistanceConstraint(doc, { object: 'Eyes Parallax', target: 'Bot Anchor', distance: 0, strength: 0.58 });
    addGroup(doc, { parent: 'Eyes Parallax', name: 'Eyes Float', x: 0, y: -36 });
    addGroup(doc, { parent: 'Eyes Float', name: 'Eyes Action', x: 0, y: 0 });
    addGroup(doc, { parent: 'Eyes Action', name: 'Eyes Blink', x: 0, y: -4 });

    for (const [side, ex] of [
      ['Left', -35],
      ['Right', 35],
    ] as const) {
      addGroup(doc, { parent: 'Eyes Blink', name: `Eye ${side} Group`, x: ex, y: 0 });
      addShape(doc, {
        parent: `Eye ${side} Group`,
        kind: 'ellipse',
        name: `Eye Glow ${side}`,
        x: 0,
        y: 0,
        width: 40,
        height: 46,
        fill: '#00f0ff26',
      });
      addGroup(doc, { parent: `Eye ${side} Group`, name: `Eye Normal ${side}`, x: 0, y: 0 });
      addShape(doc, {
        parent: `Eye Normal ${side}`,
        kind: 'rectangle',
        name: `Eye ${side}`,
        x: 0,
        y: 0,
        width: 26,
        height: 36,
        cornerRadius: 13,
      });
      applyThemeColor(doc, `Eye ${side}`, 'Energy');
      addShape(doc, {
        parent: `Eye Normal ${side}`,
        kind: 'ellipse',
        name: `Eye Glint ${side}`,
        x: -5,
        y: -8,
        width: 9,
        height: 9,
        fill: '#ffffff',
      });
      addShape(doc, {
        parent: `Eye Normal ${side}`,
        kind: 'ellipse',
        name: `Eye Subglint ${side}`,
        x: 5,
        y: 8,
        width: 4.5,
        height: 4.5,
        fill: '#ffffffbb',
      });

      const happyArc = addPath(doc, {
        parent: `Eye ${side} Group`,
        name: `Eye Happy ${side}`,
        x: 0,
        y: 2,
        closed: false,
        fill: null,
        points: [
          { x: -13, y: 6 },
          { x: 0, y: -8, inX: -8, inY: 0, outX: 8, outY: 0 },
          { x: 13, y: 6 },
        ],
      });
      happyArc.props.opacity = 0;
      const [hStroke, hSolid] = solidStroke(happyArc.id, 0xff00f0ff, 6);
      hStroke.props.cap = 1;
      hStroke.props.join = 1;
      ab.objects.push(hStroke, hSolid);
      applyThemeColor(doc, `Eye Happy ${side}`, 'Energy', 'Stroke');
    }

    const smile = addPath(doc, {
      parent: 'Eyes Action',
      name: 'Mouth Smile',
      x: 0,
      y: 22,
      closed: false,
      fill: null,
      points: [
        { x: -11, y: -2 },
        { x: 0, y: 5, inX: -6, inY: 0, outX: 6, outY: 0 },
        { x: 11, y: -2 },
      ],
    });
    const [smileStroke, smileSolid] = solidStroke(smile.id, 0xff00f0ff, 4);
    smileStroke.props.cap = 1;
    smileStroke.props.join = 1;
    ab.objects.push(smileStroke, smileSolid);
    applyThemeColor(doc, 'Mouth Smile', 'Energy', 'Stroke');

    // -------------------------------------------------------------------------
    // 7. Foreground Hologram Chat Bubble & Sparkles (52% pointer shift)
    // -------------------------------------------------------------------------
    addGroup(doc, { name: 'Holo Parallax', x: 300, y: 245 });
    addDistanceConstraint(doc, { object: 'Holo Parallax', target: 'Bot Anchor', distance: 0, strength: 0.48 });
    addGroup(doc, { parent: 'Holo Parallax', name: 'Holo Float', x: 0, y: -112 });

    addGroup(doc, { parent: 'Holo Float', name: 'Chat Bubble Group', x: 138, y: -8 });
    addShape(doc, {
      parent: 'Chat Bubble Group',
      kind: 'triangle',
      name: 'Chat Tail',
      x: -28,
      y: 18,
      width: 14,
      height: 14,
      rotation: -135,
    });
    applyThemeColor(doc, 'Chat Tail', 'Shell Dark');
    addShape(doc, {
      parent: 'Chat Bubble Group',
      kind: 'rectangle',
      name: 'Chat Pill',
      x: 0,
      y: 0,
      width: 78,
      height: 36,
      cornerRadius: 18,
      stroke: '#00f0ffaa',
      strokeWidth: 2,
    });
    applyThemeColor(doc, 'Chat Pill', 'Shell Dark');

    for (const [idx, dx, col] of [
      [1, -18, 'Energy'],
      [2, 0, 'Energy'],
      [3, 18, 'Beacon'],
    ] as const) {
      addShape(doc, {
        parent: 'Chat Bubble Group',
        kind: 'ellipse',
        name: `Typing Dot ${idx}`,
        x: dx,
        y: 0,
        width: 8.5,
        height: 8.5,
      });
      applyThemeColor(doc, `Typing Dot ${idx}`, col);
    }

    addShape(doc, {
      parent: 'Holo Float',
      kind: 'star',
      name: 'Sparkle Left',
      x: -144,
      y: 18,
      width: 24,
      height: 24,
      points: 4,
      innerRadius: 0.35,
    });
    applyThemeColor(doc, 'Sparkle Left', 'Energy');

    addShape(doc, {
      parent: 'Holo Float',
      kind: 'star',
      name: 'Sparkle Right',
      x: 152,
      y: 102,
      width: 20,
      height: 20,
      points: 4,
      innerRadius: 0.35,
    });
    applyThemeColor(doc, 'Sparkle Right', 'Halo');

    // -------------------------------------------------------------------------
    // Timelines
    // -------------------------------------------------------------------------
    // 1. Intro: aerial drop-in + spring hover + friendly wave
    addAnimation(doc, { name: 'Intro', duration: 1.1, loop: 'oneShot' });
    const ki = (object: string, property: string, keys: Parameters<typeof addKeyframes>[1]['keys']) =>
      addKeyframes(doc, { animation: 'Intro', object, property, keys });

    for (const [node, restY, startF] of [
      ['Body Float', 78, 0],
      ['Head Float', -38, 6],
      ['Visor Float', -36, 8],
      ['Eyes Float', -36, 10],
      ['Holo Float', -112, 18],
    ] as const) {
      ki(node, 'y', [
        { frame: 0, value: restY - 90 },
        { frame: startF, value: restY - 90, ease: 'easeOutBack' },
        { frame: startF + 36, value: restY },
      ]);
      ki(node, 'opacity', [
        { frame: 0, value: 0 },
        { frame: startF, value: 0, ease: 'easeOut' },
        { frame: startF + 16, value: 1 },
      ]);
    }
    ki('Hand Right Group', 'rotationDegrees', [
      { frame: 0, value: -15 },
      { frame: 20, value: -145, ease: 'easeInOut' },
      { frame: 34, value: -110, ease: 'easeInOut' },
      { frame: 48, value: -145, ease: 'easeOutBack' },
      { frame: 66, value: -15 },
    ]);

    // 2. Hover Loop: continuous anti-gravity levitation, thruster flicker & typing dots
    addAnimation(doc, { name: 'Hover Loop', duration: 2.8, loop: 'loop' });
    const kf = (object: string, property: string, keys: Parameters<typeof addKeyframes>[1]['keys']) =>
      addKeyframes(doc, { animation: 'Hover Loop', object, property, keys });

    kf('Body Float', 'y', [
      { frame: 0, value: 78, ease: 'easeInOut' },
      { frame: 84, value: 66, ease: 'easeInOut' },
      { frame: 168, value: 78 },
    ]);
    for (const [node, restY] of [
      ['Head Float', -38],
      ['Visor Float', -36],
      ['Eyes Float', -36],
    ] as const) {
      kf(node, 'y', [
        { frame: 0, value: restY, ease: 'easeInOut' },
        { frame: 84, value: restY - 14, ease: 'easeInOut' },
        { frame: 168, value: restY },
      ]);
    }
    kf('Holo Float', 'y', [
      { frame: 0, value: -112, ease: 'easeInOut' },
      { frame: 84, value: -124, ease: 'easeInOut' },
      { frame: 168, value: -112 },
    ]);
    kf('Hand Left Group', 'y', [
      { frame: 0, value: 4, ease: 'easeInOut' },
      { frame: 84, value: -8, ease: 'easeInOut' },
      { frame: 168, value: 4 },
    ]);
    kf('Hand Right Group', 'y', [
      { frame: 0, value: 4, ease: 'easeInOut' },
      { frame: 84, value: -8, ease: 'easeInOut' },
      { frame: 168, value: 4 },
    ]);
    kf('Thruster Flame Outer', 'scaleY', [
      { frame: 0, value: 1, ease: 'easeInOut' },
      { frame: 28, value: 1.28, ease: 'easeInOut' },
      { frame: 56, value: 0.88, ease: 'easeInOut' },
      { frame: 84, value: 1.32, ease: 'easeInOut' },
      { frame: 112, value: 0.92, ease: 'easeInOut' },
      { frame: 140, value: 1.24, ease: 'easeInOut' },
      { frame: 168, value: 1 },
    ]);
    kf('GroundShadow' in ab ? 'Ground Shadow' : 'Ground Shadow', 'scaleX', [
      { frame: 0, value: 1, ease: 'easeInOut' },
      { frame: 84, value: 0.84, ease: 'easeInOut' },
      { frame: 168, value: 1 },
    ]);
    kf('Orbit Trim', 'offset', [
      { frame: 0, value: 0, ease: 'linear' },
      { frame: 168, value: 1 },
    ]);
    kf('Sparkle Left', 'rotationDegrees', [
      { frame: 0, value: 0, ease: 'linear' },
      { frame: 168, value: 180 },
    ]);
    kf('Sparkle Right', 'rotationDegrees', [
      { frame: 0, value: 0, ease: 'linear' },
      { frame: 168, value: -180 },
    ]);

    for (const [dot, startF] of [
      ['Typing Dot 1', 10],
      ['Typing Dot 2', 26],
      ['Typing Dot 3', 42],
    ] as const) {
      kf(dot, 'y', [
        { frame: 0, value: 0 },
        { frame: startF, value: 0, ease: 'easeOut' },
        { frame: startF + 16, value: -6, ease: 'easeIn' },
        { frame: startF + 32, value: 0 },
        { frame: 168, value: 0 },
      ]);
    }

    // 3. Blink Loop: autonomous natural eye blinks
    addAnimation(doc, { name: 'Blink Loop', duration: 3.6, loop: 'loop' });
    addKeyframes(doc, {
      animation: 'Blink Loop',
      object: 'Eyes Blink',
      property: 'scaleY',
      keys: [
        { frame: 0, value: 1 },
        { frame: 96, value: 1, ease: 'easeIn' },
        { frame: 101, value: 0.08, ease: 'easeOut' },
        { frame: 108, value: 1 },
        { frame: 190, value: 1, ease: 'easeIn' },
        { frame: 195, value: 0.08, ease: 'easeOut' },
        { frame: 201, value: 1, ease: 'easeIn' },
        { frame: 207, value: 0.08, ease: 'easeOut' },
        { frame: 214, value: 1 },
        { frame: 216, value: 1 },
      ],
    });

    // 4. Mood Layer: Calm vs. Excited (Hover state)
    addAnimation(doc, { name: 'Calm', duration: 0.25, loop: 'oneShot' });
    for (const side of ['Left', 'Right'] as const) {
      addKeyframes(doc, { animation: 'Calm', object: `Eye Normal ${side}`, property: 'opacity', keys: [{ frame: 0, value: 1 }] });
      addKeyframes(doc, { animation: 'Calm', object: `Eye Normal ${side}`, property: 'scaleY', keys: [{ frame: 0, value: 1 }] });
      addKeyframes(doc, { animation: 'Calm', object: `Eye Happy ${side}`, property: 'opacity', keys: [{ frame: 0, value: 0 }] });
      addKeyframes(doc, { animation: 'Calm', object: ` Visor Cheek ${side}`.trim(), property: 'opacity', keys: [{ frame: 0, value: 0.25 }] });
    }
    for (const s of ['scaleX', 'scaleY'] as const) {
      addKeyframes(doc, { animation: 'Calm', object: 'Mouth Smile', property: s, keys: [{ frame: 0, value: 1 }] });
      addKeyframes(doc, { animation: 'Calm', object: 'Chat Bubble Group', property: s, keys: [{ frame: 0, value: 1 }] });
      addKeyframes(doc, { animation: 'Calm', object: 'Antenna Orb', property: s, keys: [{ frame: 0, value: 1 }] });
    }
    addKeyframes(doc, { animation: 'Calm', object: 'Visor Sheen', property: 'x', keys: [{ frame: 0, value: -130 }] });

    addAnimation(doc, { name: 'Excited', duration: 0.4, loop: 'oneShot' });
    for (const side of ['Left', 'Right'] as const) {
      addKeyframes(doc, {
        animation: 'Excited',
        object: `Eye Normal ${side}`,
        property: 'opacity',
        keys: [
          { frame: 0, value: 1, ease: 'easeOut' },
          { frame: 10, value: 0 },
        ],
      });
      addKeyframes(doc, {
        animation: 'Excited',
        object: `Eye Normal ${side}`,
        property: 'scaleY',
        keys: [
          { frame: 0, value: 1, ease: 'easeOut' },
          { frame: 10, value: 0.2 },
        ],
      });
      addKeyframes(doc, {
        animation: 'Excited',
        object: `Eye Happy ${side}`,
        property: 'opacity',
        keys: [
          { frame: 0, value: 0, ease: 'easeOut' },
          { frame: 10, value: 1 },
        ],
      });
      addKeyframes(doc, {
        animation: 'Excited',
        object: `Visor Cheek ${side}`,
        property: 'opacity',
        keys: [
          { frame: 0, value: 0.25, ease: 'easeOut' },
          { frame: 16, value: 0.85 },
        ],
      });
    }
    for (const s of ['scaleX', 'scaleY'] as const) {
      addKeyframes(doc, {
        animation: 'Excited',
        object: 'Mouth Smile',
        property: s,
        keys: [
          { frame: 0, value: 1, ease: 'easeOutBack' },
          { frame: 18, value: 1.38 },
        ],
      });
      addKeyframes(doc, {
        animation: 'Excited',
        object: 'Chat Bubble Group',
        property: s,
        keys: [
          { frame: 0, value: 1, ease: 'easeOutBack' },
          { frame: 20, value: 1.15 },
        ],
      });
      addKeyframes(doc, {
        animation: 'Excited',
        object: 'Antenna Orb',
        property: s,
        keys: [
          { frame: 0, value: 1, ease: 'easeOutBack' },
          { frame: 18, value: 1.32 },
        ],
      });
    }
    addKeyframes(doc, {
      animation: 'Excited',
      object: 'Visor Sheen',
      property: 'x',
      keys: [
        { frame: 0, value: -130, ease: 'easeInOut' },
        { frame: 24, value: 185 },
      ],
    });

    // 5. Action Layer: Action Idle vs. Jump Spin (Click trigger)
    addAnimation(doc, { name: 'Action Idle', duration: 0.1, loop: 'oneShot' });
    for (const node of ['Body Action', 'Head Action', 'Visor Action', 'Eyes Action'] as const) {
      addKeyframes(doc, { animation: 'Action Idle', object: node, property: 'y', keys: [{ frame: 0, value: 0 }] });
      addKeyframes(doc, { animation: 'Action Idle', object: node, property: 'rotationDegrees', keys: [{ frame: 0, value: 0 }] });
    }
    addKeyframes(doc, { animation: 'Action Idle', object: 'Salute Shockwave', property: 'opacity', keys: [{ frame: 0, value: 0 }] });
    addKeyframes(doc, { animation: 'Action Idle', object: 'Signal Ring', property: 'opacity', keys: [{ frame: 0, value: 0 }] });

    addAnimation(doc, { name: 'Jump Spin', duration: 0.75, loop: 'oneShot' });
    for (const node of ['Body Action', 'Head Action', 'Visor Action', 'Eyes Action'] as const) {
      addKeyframes(doc, {
        animation: 'Jump Spin',
        object: node,
        property: 'y',
        keys: [
          { frame: 0, value: 0, ease: 'easeOut' },
          { frame: 8, value: 16, ease: 'easeOutBack' },
          { frame: 24, value: -34, ease: 'easeInOut' },
          { frame: 45, value: 0 },
        ],
      });
      addKeyframes(doc, {
        animation: 'Jump Spin',
        object: node,
        property: 'rotationDegrees',
        keys: [
          { frame: 0, value: 0, ease: 'easeInOut' },
          { frame: 8, value: -8, ease: 'easeOutBack' },
          { frame: 42, value: 360 },
        ],
      });
    }
    addKeyframes(doc, {
      animation: 'Jump Spin',
      object: 'Salute Shockwave',
      property: 'opacity',
      keys: [
        { frame: 0, value: 1, ease: 'easeOut' },
        { frame: 42, value: 0 },
      ],
    });
    for (const s of ['scaleX', 'scaleY'] as const) {
      addKeyframes(doc, {
        animation: 'Jump Spin',
        object: 'Salute Shockwave',
        property: s,
        keys: [
          { frame: 0, value: 0.5, ease: 'easeOut' },
          { frame: 42, value: 1.85 },
        ],
      });
      addKeyframes(doc, {
        animation: 'Jump Spin',
        object: 'Signal Ring',
        property: s,
        keys: [
          { frame: 0, value: 0.8, ease: 'easeOut' },
          { frame: 42, value: 2.6 },
        ],
      });
    }
    addKeyframes(doc, {
      animation: 'Jump Spin',
      object: 'Signal Ring',
      property: 'opacity',
      keys: [
        { frame: 0, value: 1, ease: 'easeOut' },
        { frame: 42, value: 0 },
      ],
    });

    // -------------------------------------------------------------------------
    // State Machine (4 independent layers: Motion, Blink, Mood, Action)
    // -------------------------------------------------------------------------
    addStateMachine(doc, { name: 'Hero Bot' });
    addInput(doc, { type: 'boolean', name: 'isHovered' });
    addInput(doc, { type: 'trigger', name: 'boop' });

    const machine = ab.stateMachines[0];
    machine.children!.find((c) => c.type === 'StateMachineLayer')!.props.name = 'Motion';
    addState(doc, { layer: 'Motion', animation: 'Intro', x: 180, y: 20 });
    addState(doc, { layer: 'Motion', animation: 'Hover Loop', x: 380, y: 20 });
    addTransition(doc, { layer: 'Motion', from: 'entry', to: 'Intro' });
    addTransition(doc, { layer: 'Motion', from: 'Intro', to: 'Hover Loop', exitTimeMs: 1100, durationMs: 220 });

    addLayer(doc, 'Hero Bot', 'Blink');
    addState(doc, { layer: 'Blink', animation: 'Blink Loop', x: 180, y: 20 });
    addTransition(doc, { layer: 'Blink', from: 'entry', to: 'Blink Loop' });

    addLayer(doc, 'Hero Bot', 'Mood');
    addState(doc, { layer: 'Mood', animation: 'Calm', x: 180, y: 20 });
    addState(doc, { layer: 'Mood', animation: 'Excited', x: 380, y: 20 });
    addTransition(doc, { layer: 'Mood', from: 'entry', to: 'Calm' });
    addTransition(doc, { layer: 'Mood', from: 'Calm', to: 'Excited', durationMs: 180, conditions: [{ input: 'isHovered', value: true }] });
    addTransition(doc, { layer: 'Mood', from: 'Excited', to: 'Calm', durationMs: 220, conditions: [{ input: 'isHovered', value: false }] });

    addLayer(doc, 'Hero Bot', 'Action');
    addState(doc, { layer: 'Action', animation: 'Action Idle', x: 180, y: 20 });
    addState(doc, { layer: 'Action', animation: 'Jump Spin', x: 380, y: 20 });
    addTransition(doc, { layer: 'Action', from: 'entry', to: 'Action Idle' });
    addTransition(doc, { layer: 'Action', from: 'any', to: 'Jump Spin', conditions: [{ input: 'boop' }] });
    addTransition(doc, { layer: 'Action', from: 'Jump Spin', to: 'Action Idle', exitTimeMs: 750, durationMs: 120 });

    // Full-artboard hit area drawn at the back for 360° pointer tracking, hover, and click
    const hit = addShape(doc, {
      kind: 'rectangle',
      name: 'Hit Area',
      x: 300,
      y: 250,
      width: 600,
      height: 500,
      fill: '#ffffff00',
    });
    moveBefore(ab, hit.id, null, ab.artboard.id);

    addListener(doc, {
      target: 'Hit Area',
      event: 'move',
      name: 'Look At Pointer',
      actions: [
        { alignTarget: 'Ground Parallax' },
        { alignTarget: 'Halo Parallax' },
        { alignTarget: 'Body Parallax' },
        { alignTarget: 'Head Parallax' },
        { alignTarget: 'Visor Parallax' },
        { alignTarget: 'Eyes Parallax' },
        { alignTarget: 'Holo Parallax' },
      ],
    });
    addListener(doc, {
      target: 'Hit Area',
      event: 'enter',
      name: 'Greet User',
      actions: [{ input: 'isHovered', value: true }],
    });
    addListener(doc, {
      target: 'Hit Area',
      event: 'exit',
      name: 'Calm Down',
      actions: [{ input: 'isHovered', value: false }],
    });
    addListener(doc, {
      target: 'Hit Area',
      event: 'click',
      name: 'Boop Jump',
      actions: [{ input: 'boop' }],
    });

    // Themes: Cyber Titanium (default dark) + Solar Light
    doc.editor!.themes[0].name = 'Cyber Titanium';
    const solar = addTheme(doc, 'Solar Light');
    const swatchId = (n: string) => doc.editor!.swatches.find((s) => s.name === n)!.id;
    setSwatchColor(doc, swatchId('Background'), 0xfff1f5f9, solar.id);
    setSwatchColor(doc, swatchId('Shell Main'), 0xffffffff, solar.id);
    setSwatchColor(doc, swatchId('Shell Rim'), 0xffcbd5e1, solar.id);
    setSwatchColor(doc, swatchId('Shell Dark'), 0xff1e293b, solar.id);
    setSwatchColor(doc, swatchId('Visor'), 0xff0f172a, solar.id);
    setSwatchColor(doc, swatchId('Energy'), 0xff00e5ff, solar.id);
    setSwatchColor(doc, swatchId('Accent'), 0xff2563eb, solar.id);
    setSwatchColor(doc, swatchId('Beacon'), 0xfff43f5e, solar.id);
    setSwatchColor(doc, swatchId('Halo'), 0xff7c3aed, solar.id);
    applyTheme(doc, doc.editor!.themes[0].id);

    return doc;
  },
};
