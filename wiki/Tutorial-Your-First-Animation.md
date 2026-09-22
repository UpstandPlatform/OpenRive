Build a bouncing ball from scratch. You'll learn shapes, timelines, keyframes and easing. It takes about ten minutes.

**You'll need:** OpenRive running ([Getting Started](Getting-Started)).

## 1. Create a file

On the Files page choose **New file**, pick a size (500 × 500 is fine), and open it. A new file comes with an
artboard, a timeline and a state machine.

## 2. Draw the ball

1. Press `O` (Ellipse tool) and drag on the artboard while holding `Shift` to draw a circle about 80 px wide.
2. In the **Inspector** (right), set the fill color, and rename the shape to **Ball** with `F2`.
3. Draw a wide, flat rectangle (`R`) at the bottom as the **Floor**.

Tip: names matter. They show up in the timeline, the state machine and the embed code.

## 3. Animate it

1. Press `Tab` to switch to **Animate** mode. The timeline panel opens at the bottom.
2. Select the timeline in the list (or create one with **New timeline**) and set **Duration** to 1 second.
3. Set the loop mode to **Ping pong**, so the ball goes down and back up.
4. With the playhead at frame **0**, select **Ball** and press `K` to key its transform. Diamonds appear in the
   timeline.
5. Move the playhead to the end (`End`) and drag the ball down onto the floor. Auto-key records the new position.
6. Press `Enter` to play. The ball moves, but it looks mechanical.

## 4. Add easing

1. Click the first keyframe of the ball's **Y** position.
2. In the Inspector, under **Interpolation (to next key)**, choose **Ease In**. Objects speed up as they fall.
3. Play again (`Enter`). With ping-pong, the way back up mirrors the curve.

Try **Ease Out Back** for a playful overshoot, or edit the curve by dragging its handles.

## 5. Squash and stretch (optional)

At the frame where the ball hits the floor, set **Scale** to about `1.2 × 0.8`. A few frames before, set it back to
`1 × 1`. Squash sells the impact.

## 6. Preview and export

- **Preview** (`Ctrl P`): with no state machine logic, choose the timeline (or **All timelines**) from the menu at the
  top.
- **Export** (`Ctrl E`) downloads the `.riv`.

## What you learned

| Concept | Where |
| --- | --- |
| Shapes, names | Design mode, Inspector, `F2` |
| Timelines, duration, loop | Animate mode, timeline panel |
| Keyframes and auto-key | `K`, change properties at the playhead |
| Easing | Keyframe › Interpolation |

Next: make it interactive in [Tutorial: Interactive Button](Tutorial-Interactive-Button). Compare your result with
the **Bouncing Ball** template.
