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
length, rotation, and root position precisely in the Inspector. Drag with the Bone tool to add a root bone or extend
the selected bone from its tip.

The current tools provide essential skeleton and skin editing, while advanced parity features such as dedicated
weight-paint brushes and broader rigging workflows are not yet available. Existing `.riv` content outside the supported
editing surface is preserved when saved.
