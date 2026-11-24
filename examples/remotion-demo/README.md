# Remotion demo: pickup, carry, place and release

Two compositions built with `remotion-2d-rig-toolkit` and original, neutral artwork:

| Composition | What it shows |
| --- | --- |
| `MugPickup` | Reach → open hand → contact on the mug handle → fingers close → lift → carry → place on the table → fingers open → return to a relaxed pose |
| `BatteryPinch` | The same sequence with a precision pinch on a small battery |

![Mug pickup demo](../../docs/media/mug-pickup.gif)

## Run it

```bash
# 1. Build the toolkit (the demo depends on it via "file:../..")
cd ../..
npm install
npm run build

# 2. Install and open the demo
cd examples/remotion-demo
npm install
npm run studio          # opens Remotion Studio
```

Render to MP4:

```bash
npm run render:mug       # out/mug-pickup.mp4
npm run render:battery   # out/battery-pinch.mp4
```

Remotion downloads Chrome Headless Shell on first render. To use an existing Chrome instead, set
`REMOTION_BROWSER_EXECUTABLE=/path/to/chrome`.

To see the grip point, elbow and object phase on every frame, pass `--props='{"showGuides":true}'`.

## Automated continuity QC

```bash
npm run qc
```

`qc/continuity.test.mjs` runs the exact rig code used by the video (`src/rig.ts`) for every frame and fails if:

- the hand is not on the object's grip anchor at the pickup frame,
- the object would float or snap to the table after release,
- the object slips relative to the hand while held,
- the object or wrist jumps more than a set number of pixels in one frame,
- an IK target is out of reach, the wrist bends past its limit, or the elbow locks straight.

Current result (verified locally with Node 22.23, Remotion 4.0.546):

| Scene | Pickup error | Release error | Max object step | Max wrist step | Elbow range |
| --- | --- | --- | --- | --- | --- |
| MugPickup | 0.000 px | 0.000 px | 8.9 px | 13.9 px | 29°–140° |
| BatteryPinch | 0.000 px | 0.000 px | 7.9 px | 14.4 px | 41°–139° |

The QC test needs TypeScript type stripping in Node.js (22.18+ or 24+).

## How the scene is built

`src/rig.ts` keyframes three things per scene: the **grip point** (where the object's handle should be),
the **hand angle**, and the **finger closure**. For each frame it:

1. computes the wrist position that puts the *closed* grip pose on the grip point (`wristForGrip`),
2. solves the two-bone arm to that wrist (`solveTwoBoneArm`),
3. attaches a jointed hand and blends `relaxed → open → mugHandle` (`attachHandToArm`, `blendHandPoses`),
4. samples the object's ownership from the hand's actual grip point (`samplePropInteraction`).

Because the wrist is placed for the closed pose, the fingers close around the handle without the palm moving.

## Known limitations

- The hand is a planar, lateral-view cartoon hand. Fingers are drawn behind the object around contact;
  there is no automatic collision detection between fingers and object outlines.
- The battery is small relative to the hand at this scale, so the pinch reads less clearly than the mug grip.
- The character art is deliberately simple placeholder art for demonstrating the rig.

## Licensing

The demo code and artwork are MIT-licensed with the rest of this repository.
Remotion itself is **not** MIT-licensed: it is free for individuals and small companies, and larger
companies need a company license. Check [remotion.dev/license](https://www.remotion.dev/license) before commercial use.
