# Remotion 2D Rig Toolkit

**Small, original TypeScript helpers for deterministic 2D character arms and object interactions.**

This open-source starter project provides:

- **Two-bone arm IK** with stable shoulder, elbow and wrist points, fixed bone lengths, and unreachable-target handling.
- **Five-digit neutral cartoon hand geometry**, including left/right mirroring and a few starter grip poses.
- **Prop anchors** for a resting base and a hand grip point.
- **Pickup / carry / release** state sampling with optional post-release settling.
- **Pickup-contact validation** to catch object snapping before rendering.
- **Frame-based interpolation** suitable for Remotion and other deterministic renderers.
- **Layer-order helpers** for placing fingers behind and in front of a prop.
- A simple **Remotion SVG example** with no proprietary art or voice assets.

> Status: **v0.1.0 prototype**. The TypeScript core and unit tests have been checked locally. The optional Remotion scene is an illustrative example, not a fully rendered production demonstration. It does not include physics, collision detection, image sprites or a complete character system.

## Getting started

Requires Node.js 20+ and TypeScript 5.8.x. No hosted service or API keys required.

```bash
npm install
npm test
```

In your Remotion project, you can install this toolkit as a local dependency:

```bash
npm install /path/to/remotion-2d-rig-toolkit
```

The math and scene state are pure functions: there is no dependency on `useCurrentFrame()` inside the core. Read the current frame in your Remotion component and pass it to `samplePropInteraction()`.

## Two-bone arm example

```ts
import {point, solveTwoBoneArm} from 'remotion-2d-rig-toolkit';

const pose = solveTwoBoneArm({
  shoulder: point(120, 180),
  upperArmLength: 85,
  forearmLength: 90,
  elbowSide: 'left',
}, point(250, 245));

// SVG or canvas: shoulder -> elbow -> wrist
console.log(pose.shoulder, pose.elbow, pose.wrist, pose.targetReachable);
```

## Prop interaction example

```ts
import {
  point, placePropAtBase, worldAnchor,
  checkPickupContact, samplePropInteraction
} from 'remotion-2d-rig-toolkit';

const battery = {
  width: 60,
  height: 20,
  gripAnchor: point(30, 10),
  baseAnchor: point(30, 20)
};
const restBase = point(300, 440);
const gripAtRest = worldAnchor(placePropAtBase(battery, restBase), battery.gripAnchor);

const interaction = {
  prop: battery,
  initialBase: restBase,
  pickupFrame: 20,
  releaseFrame: 50,
  gripAtFrame: (frame: number) =>
    frame <= 20 ? gripAtRest : point(gripAtRest.x, gripAtRest.y - (frame - 20) * 2)
};

// Ensure the hand reaches the object's grip anchor at the pickup frame.
if (!checkPickupContact(interaction).ok) throw new Error('Hand misses the object');

const atFrame35 = samplePropInteraction(interaction, 35);
console.log(atFrame35.phase, atFrame35.pose.topLeft);
```

To display five-digit hand geometry, call `createHandGeometry('handle', 'right')`, then `moveHandGeometry()` to place it at the solved wrist. Implement your own character art and finger paths.

## Optional Remotion demo

See [the Remotion SVG demo](examples/remotion/README.md) for an original cartoon mug interaction. The demo uses a generic arm silhouette and a simple mug, without any existing production characters.

## Key limitation: contact is explicit

The hand **must be at the prop's grip anchor at `pickupFrame`**. The toolkit intentionally reports a mismatch instead of silently blending through a floating object. Likewise, release is anchored to the hand's last frame; choose a final surface base position and settling duration to stage the placement.

This v0.1 library is a solid foundation for hand-and-prop continuity checks, not a drop-in cure for anatomy or a substitute for visual review.

## Development

```bash
npm run typecheck
npm test
```

The `tests/` suite covers arm lengths, out-of-range targets, degenerate target positions, anchor consistency, pickup discontinuities, release continuity, left/right hand geometry, keyframes and layer ordering.

## Open source and privacy

All code and artwork in this repository were prepared as **standalone generic examples**. No private character artwork, scripts, voices, private animation source, account details, paid assets, or confidential production documents should be added.

Contributions are welcome; see [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT for the code in this repository. Remotion, when used as an optional host renderer, has its own separate license and requirements; see [Remotion's documentation](https://www.remotion.dev/docs/).
