# Constraints

Distance constraints control how far one node stays from another at runtime.

1. Select the node that should be constrained.
2. In the Inspector, open **Constraints** and choose **Add distance…**, then choose the target node.
3. Pick **Closer than**, **Farther than**, or **Exact distance** and set a distance and strength.

The constraint is part of the `.riv` file and is evaluated by the Rive runtime. Existing constraint types that OpenRive
does not edit are preserved when the file is opened and saved.

OpenRive supports root and child bone authoring, bone skin binding, and per-vertex influence editing for weighted
paths. Select a bone in the canvas to move its root; drag the highlighted tip to adjust its length and rotation, or
edit those values precisely in the Inspector. Drag with the Bone tool to add a root bone or extend a selected bone.

The current tools provide essential skeleton and skin editing, while advanced parity features such as dedicated
weight-paint brushes and broader rigging workflows are not yet available. Existing `.riv` content outside the supported
editing surface is preserved when saved.
