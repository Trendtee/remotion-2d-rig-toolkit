# Architecture

## Modules

| File | Responsibility |
| --- | --- |
| `src/geometry.ts` | Points, vectors, angles, easing. No state. |
| `src/ik.ts` | Planar two-bone IK. It preserves bone lengths, clamps unreachable targets and reports joint angles. |
| `src/fingers.ts` | Jointed hand: forward kinematics per digit, joint limits, presets, blending, grip points, wrist-bend limits. |
| `src/hands.ts` | The simple v0.1 hand (one segment per digit). Kept for compatibility. |
| `src/props.ts` | Anchor-based prop placement, ownership transfer (rest → hand → world) and continuity checks. |
| `src/timeline.ts` | Keyframe sampling with smooth, linear and hold interpolation. |
| `src/layers.ts` | Depth-order labels for hand/object drawing. |

The library has no runtime dependencies. Remotion appears only in `examples/`.

## Conventions

- **Screen space:** positive y points down, and angles are in degrees with positive values turning clockwise on screen.
- **Determinism:** the same inputs and frame always give the same output. There is no `Date`, no randomness and no mutable module state, which is what Remotion's parallel, out-of-order rendering requires.
- **Fail loudly:** non-finite numbers, non-positive lengths and out-of-order keyframes throw. Physically impossible requests (an unreachable target, a joint past its limit, too much wrist bend) are **clamped and reported** (`targetReachable`, `clamped`, `wristCorrection`), so a test can catch them.

## Why contact is explicit

Blending an object's position from the table into the hand hides a bug: for a few frames the object is held by nothing. This toolkit does not blend ownership. The object is either resting, held at exactly the hand's grip point, or released. If the hand is not on the handle at `pickupFrame`, the object jumps, and `checkPickupContact()` reports the jump in pixels before you render. The same applies to release with `checkReleaseContact()`.

The recommended pattern (used in the demo):

1. Keyframe the **grip point** you want, not the wrist.
2. Compute the wrist with `wristForGrip()` for the **closed** grip pose, so the fingers close in place.
3. Solve the arm to that wrist, and attach the hand with a wrist-bend limit.
4. Let the object follow the **closed pose's grip point at the solved wrist**. If the IK had to clamp, the object follows the real hand and QC reports the mismatch instead of hiding it.

## Hand model

The hand is a lateral (thumb-side) 2D view. Each digit is a chain of three rigid segments with hinge joints that bend in the drawing plane. Segment lengths and knuckle positions are neutral cartoon proportions (about 40 units from the wrist to the knuckles at scale 1). The four fingers are staggered slightly so they remain readable when they overlap.

Joint limits approximate human ranges (fingers MCP −20…90°, PIP 0…110°, DIP 0…80°). They prevent impossible poses but are not anatomically exact.

Each joint has a radius, so a digit is a chain of tapered capsules. The same geometry is used for drawing (`digitSegments`) and for measuring contact (`measureDigitContacts`), so what QC measures is what the viewer sees.

**Pinch.** `tools/tune-pinch.mjs` searches thumb and index angles under explicit constraints: tips ahead of the knuckles, a thumb→index axis perpendicular to the hand, an exact surface gap, and no thumb, index or palm overlap with an object placed between the tips. `batteryPinch` and `pinchTight` come from that search. `solvePinchGrip` then interpolates along the family to fit any object width, and places the hand using the object's surface normals.

### Known limitations

- There is no out-of-plane rotation (no palm turning toward the camera) and no finger spread perpendicular to the drawing plane.
- Contact is *measured* (`measureDigitContacts`), not *resolved*: the toolkit does not push fingers out of objects automatically. Depth is handled with `layer` (`front`/`back`) and draw order; fingers drawn behind an object may overlap it.
- There are no physics. Released objects stay put or are placed at `finalBase`.
- Objects can turn with the hand while held (`heldAngleAtFrame`), but there is no physics: nothing tips over or slides on its own.

## Testing strategy

- `tests/*.test.mjs` cover the library: bone-length invariants across target sweeps, mirroring at many angles, joint limits, blend continuity, exact grip placement, contact checks and the v0.1.0 regressions.
- `examples/remotion-demo/qc/continuity.test.mjs` runs the demo's real rig code for every frame and fails on contact errors, slipping, large per-frame jumps, unreachable targets, excessive wrist bend or a locked elbow.
- Visual review: the demo can render guides (`showGuides`), and contact sheets were reviewed for each change to the demo.
