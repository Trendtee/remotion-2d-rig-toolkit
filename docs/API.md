# API reference (v0.2.0)

All functions are pure and deterministic. Coordinates: screen space, **positive y down**. Angles: degrees, **positive = clockwise on screen**. Every export comes from the package root:

```ts
import {solveTwoBoneArm, createArticulatedHand /* … */} from 'remotion-2d-rig-toolkit';
```

## Geometry (`src/geometry.ts`)

| Export | Description |
| --- | --- |
| `Point` | `Readonly<{x, y}>` |
| `point(x, y)` | Creates a point |
| `add`, `subtract`, `multiply(p, s)`, `length`, `distance` | Vector helpers |
| `lerp(a, b, t)`, `mix(p, q, t)`, `clamp(v, min, max)` | Interpolation helpers |
| `easeInOut(t)` | Smoothstep easing, with `t` clamped to [0, 1] |
| `rotate(p, degrees)` | Rotates around the origin |
| `angleBetween(a, b)` | Direction from `a` to `b` in degrees |
| `fromAngle(degrees, len = 1)` | Vector of length `len` pointing along `degrees` |
| `angleDelta(a, b)` | Shortest signed difference `b − a` in (−180, 180] |
| `lerpAngle(a, b, t)` | Interpolates along the shortest arc |
| `isFinitePoint(p)` | Returns `true` if both coordinates are finite |

## Arm IK (`src/ik.ts`)

### `solveTwoBoneArm(arm, target): ArmSolution`

```ts
interface TwoBoneArm {
  shoulder: Point;
  upperArmLength: number;   // > 0
  forearmLength: number;    // > 0
  elbowBend?: 'clockwise' | 'counterclockwise';  // default 'clockwise'
  elbowSide?: 'left' | 'right';                  // deprecated, see below
}
interface ArmSolution {
  shoulder, elbow, wrist, requestedWrist: Point;
  reachError: number;        // distance between requested and solved wrist
  targetReachable: boolean;
  upperArmAngle: number;     // shoulder → elbow, degrees
  forearmAngle: number;      // elbow → wrist, degrees (use it to orient the hand)
  elbowAngle: number;        // interior angle: 180 = straight
}
```

- Bone lengths are preserved exactly. A target that is too far away, or too close (nearer than `|upper − forearm|`), is clamped along the same ray, and the solver reports `targetReachable: false`.
- `elbowBend: 'clockwise'` puts the elbow on the clockwise side of the shoulder→wrist line. For an arm reaching right, that is **below** the line.
- `elbowSide` is kept from v0.1.0. `'left'` equals `'clockwise'` and `'right'` equals `'counterclockwise'`. The old names do not match the on-screen side, which is why they are deprecated.
- The solver throws `RangeError` on non-finite input or non-positive lengths.

## Jointed hands (`src/fingers.ts`)

### Model

This is a lateral (thumb-side) view of a hand. In local coordinates the wrist is at (0, 0), +x points toward the knuckles (about 40 units away at scale 1), and +y is the palm side. Each digit has three hinge joints: MCP, PIP and DIP for the fingers, and CMC, MCP and IP for the thumb. Flexion curls the fingers toward the palm and the thumb toward the fingers.

### `createArticulatedHand(options): ArticulatedHand`

```ts
interface ArticulatedHandOptions {
  pose: HandPresetName | HandPose;
  side?: 'left' | 'right';      // default 'right'
  wrist?: Point;                // default (0, 0)
  forwardDegrees?: number;      // wrist → knuckles direction; default 0 (right) / 180 (left)
  scale?: number;               // default 1
  contact?: 'palm' | 'wrap' | 'pinch';  // how gripPoint is computed
}
interface ArticulatedHand {
  side, wrist, forwardDegrees, scale, contact;
  palm: Point[];                // closed outline
  digits: ArticulatedDigit[];   // thumb, index, middle, ring, pinky
  gripPoint: Point;             // where an object's grip anchor should sit
}
interface ArticulatedDigit {
  digit: 'thumb' | 'index' | 'middle' | 'ring' | 'pinky';
  joints: [base, joint1, joint2, tip];  // world space
  widths: [number, number, number];     // suggested stroke widths (scaled)
  curl: [number, number, number];       // applied flexion after clamping
  layer: 'front' | 'back';
  clamped: boolean;                     // requested curl exceeded a joint limit
}
```

**Mirroring:** a `left` hand at `forwardDegrees = 180 − θ` is the exact mirror image of a `right` hand at `θ`.

**Grip point rules:** `pinch` is the midpoint between the thumb and index tips. `wrap` is the centre of the curled middle finger's loop. `palm` is a point in front of the palm. Presets choose a rule automatically, and custom poses default to `wrap`.

### Presets: `HAND_POSES`, `HAND_POSE_CONTACT`

| Preset | Use | Contact |
| --- | --- | --- |
| `open` | Reaching and releasing | palm |
| `relaxed` | Idle and hanging at the side | palm |
| `fist` | Fist, or a closed hand without an object | wrap |
| `point` | Pointing with the index finger | wrap |
| `mugHandle` | Mug or cup handle, bag handle | wrap |
| `controller` | Game controller grip, thumb resting on top | wrap |
| `batteryPinch` | Small cylinders (≈12.5 local units between thumb and index tips) | pinch |
| `paperPinch` | Sheets and cards (≈3 units) | pinch |
| `cableWrap` | Thin cylinders: cables, rods, handles | wrap |

### Joint limits

Fingers: MCP −20°…90°, PIP 0°…110°, DIP 0°…80°. Thumb: CMC −20°…60°, MCP −10°…70°, IP −15°…80°. Use `clampDigitCurl(digit, curl)` to apply the limits yourself.

### Helpers

| Export | Description |
| --- | --- |
| `blendHandPoses(a, b, t)` | Interpolates every joint. A digit's `layer` switches from `a` to `b` at t = 0.5 |
| `wristForGrip(gripWorld, options)` | Wrist position that puts `gripPoint` exactly on `gripWorld`. Use it as the IK target |
| `gripOffset(options)` | Local wrist → grip vector for a pose and orientation |
| `limitWristBend(forearmAngle, desired, max = 70)` | Returns `{handAngle, bend, correction}` |
| `attachHandToArm(armSolution, options)` | Builds a hand at the solved wrist, keeps the wrist bend within `maxWristBend` (default 70°), and adds `wristCorrection` |
| `digitPath(digit)`, `palmPath(hand)` | SVG path data |
| `DIGITS` | `['thumb', 'index', 'middle', 'ring', 'pinky']` |

## Simple v0.1 hand (`src/hands.ts`)

`createHandGeometry(grip, side, wristAngle)` builds one straight segment per digit with the grips `'open' | 'handle' | 'pinch' | 'support'`. It is kept for compatibility and quick sketches. In v0.2.0 the left hand is an exact mirror at any `wristAngle`, and `palmAngle` was added. `moveHandGeometry(hand, wristWorld)` translates the result.

## Props (`src/props.ts`)

| Export | Description |
| --- | --- |
| `PropDefinition` | `{width, height, gripAnchor, baseAnchor}` in the artwork's local units |
| `PropPose` | `{topLeft, scale, angleDegrees}`. Apply it as `translate(topLeft) rotate(angle) scale(scale)` |
| `placePropAtBase(def, baseWorld, scale?, angle?)` | Pose with the base anchor on `baseWorld` |
| `placePropAtGrip(def, gripWorld, scale?, angle?)` | Pose with the grip anchor on `gripWorld` |
| `worldAnchor(pose, localAnchor)` | Where a local anchor lands in the world |
| `samplePropInteraction(i, frame)` | `{phase, pose}`. The phase is one of `'resting'`, `'held'`, `'settling'` or `'released'` |
| `checkPickupContact(i, tol = 1)` | Is the hand on the grip anchor at `pickupFrame`? |
| `checkReleaseContact(i, tol = 1)` | Is the object's base on `finalBase` at `releaseFrame`? |
| `inspectPropInteraction(i, from, to, {tolerancePx, maxJumpPx})` | Runs both checks and finds the largest per-frame jump |

```ts
interface PropInteraction {
  prop: PropDefinition;
  initialBase: Point;
  pickupFrame: number;          // first frame the hand owns the object
  releaseFrame: number;         // first frame the world owns it again
  gripAtFrame: (frame: number) => Point;
  finalBase?: Point;            // where it ends up after release
  settleFrames?: number;        // > 0: ease from the hand to finalBase; 0/omitted: placed on the release frame
  scale?: number;
  angleDegrees?: number;
}
```

**Changed in v0.2.0:** `finalBase` is now used when `settleFrames` is 0 or omitted (v0.1.0 ignored it), and a non-finite `frame` throws.

## Timeline (`src/timeline.ts`)

| Export | Description |
| --- | --- |
| `FrameKey<T>` | `{frame, value, interpolation?: 'smooth' \| 'linear' \| 'hold'}`. The interpolation applies to the segment ending at this key |
| `sampleScalar(keys, frame)` | Keys must have strictly increasing frames. Values clamp at both ends |
| `samplePoint(keys, frame)` | The same, for points |

## Layers (`src/layers.ts`)

`GRIP_LAYER_ORDER` is `rearArm → rearFingers → object → palm → frontFingers → frontArm`. `sortGripLayers(items)` sorts any `{layer}` items into that order and is stable for equal layers.
