# Constraints

Distance constraints control how far one node stays from another at runtime.

1. Select the node that should be constrained.
2. In the Inspector, open **Constraints** and choose **Add distance…**, then choose the target node.
3. Pick **Closer than**, **Farther than**, or **Exact distance** and set a distance and strength.

The constraint is part of the `.riv` file and is evaluated by the Rive runtime. Existing constraint types that OpenRive
does not edit are preserved when the file is opened and saved.

OpenRive supports root and child bone authoring, bone skin binding, and per-vertex influence editing for weighted
paths. With Select active, drag a root bone's base handle to position it, drag a bone's shaft to rotate it around its
joint, or drag its tip to change its length and angle together. Child bones stay attached to their parent's tip. Edit
length, rotation, scale, and root position precisely in the Inspector. Drag with the Bone tool to add a root bone or
extend any visible, unlocked bone from its tip. The **Parent** control links a bone at the chosen parent's tip or
detaches it to the artboard while keeping its current position. Cycles and collapsed parent transforms are rejected.

## Skin and weights

1. Select a PointsPath or existing image mesh. In **Skin**, choose the bones and click **Bind selected bones**.
2. Use **Auto weight** for nearby bone influences or **Smooth weights** to average neighboring points. Mesh smoothing
   follows triangle connectivity.
3. Click **Paint weights** (Shift+B), select the bone, radius, strength, and point/handle target, then paint on the canvas.
   Hold Alt to subtract. Each stroke is one undo step; Escape or pointer cancellation restores the starting weights.
4. Select a vertex to edit up to four normalized influences. Cubic in/out handles can have independent weights.

**Rebind pose** captures the current contour and joints as a new bind pose. **Unbind skin** removes the binding and
keeps the current contour. Deleting a bound bone also bakes affected contours so exported files contain no dangling
tendons. These operations capture the current design pose; they do not bake an entire animation into vertex keyframes.
Structural skin and parent edits require Design mode and editing access. Bone transforms and length can be animated.

Existing mesh vertices and weights can be edited; creating image mesh topology is not supported. IK and other
constraint types outside the distance-constraint controls are preserved and evaluated by the official runtime.
