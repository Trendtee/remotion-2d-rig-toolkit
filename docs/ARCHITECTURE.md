# Architecture and constraints

- `src/ik.ts`: deterministic planar 2-bone inverse kinematics with bone-length preservation and unreachable-target clamping.
- `src/hands.ts`: neutral five-digit hand geometry and a basic finger-front/finger-back annotation for layering. It is a starting shape library, **not** a physically accurate hand simulation.
- `src/props.ts`: anchor-based prop placement, transfer from rest to hand ownership, and optional smooth settling back to a target surface.
- `src/timeline.ts`: frame-based interpolation, no clock dependence or random jitter.
- `src/layers.ts`: ordering labels for constructing SVG/React layers.

## Physical correctness assumptions

1. The animator drives the hand to the resting object's grip anchor **before** `pickupFrame`. `checkPickupContact()` detects separation but will not silently hide it.
2. The released object is frozen at the hand's final position, or interpolated smoothly to an explicitly provided final surface contact. No automatic rigid-body physics are implemented.
3. This package has no character rig, artwork, mouth shapes, sprite sheet, video renderer, or voice model. It works with any art as long as it supplies anchors.
4. Realistic finger wrapping, collisions, and 3D perspective are out of scope for v0.1. They require additional art and scene-specific tests.
5. Positive y points down, using pixels or any consistent 2D units.

## Open-source hygiene

No private character artwork, project scripts, personal account details, paid assets, proprietary fonts, or original private production source files are included.

## Licensing

The toolkit source is MIT-licensed. Remotion and any other optional host runtime retain their own licensing terms; please consult the relevant upstream documentation.
