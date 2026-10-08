# Constraints

Distance constraints control how far one node stays from another at runtime.

1. Select the node that should be constrained.
2. In the Inspector, open **Constraints** and choose **Add distance…**, then choose the target node.
3. Pick **Closer than**, **Farther than**, or **Exact distance** and set a distance and strength.

The constraint is part of the `.riv` file and is evaluated by the Rive runtime. Existing constraint types that OpenRive
does not edit are preserved when the file is opened and saved.

OpenRive's current rigging work starts with distance constraints. Bone creation, skinning and weight painting are
still planned.
