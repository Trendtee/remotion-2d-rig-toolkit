# Quick start: a reach, grip, lift and place scene

This guide builds the core of the [mug demo](../examples/remotion-demo) in about 60 lines. Every step is a pure function of the frame number, so it works in Remotion, on a canvas, or in a unit test.

Coordinates are screen pixels with **positive y pointing down**. Angles are in degrees, and positive angles turn **clockwise on screen**.

## 1. Describe the object with anchors

```ts
import {point, type PropDefinition} from 'remotion-2d-rig-toolkit';

// Coordinates are in the artwork's own units, relative to its top-left corner.
const MUG: PropDefinition = {
  width: 150, height: 140,
  gripAnchor: point(18, 72),  // middle of the handle bar: where the fingers close
  baseAnchor: point(92, 138)  // bottom centre: where it touches the table
};
```

## 2. Keyframe the grip point, hand angle and finger closure

```ts
import {placePropAtBase, worldAnchor, type FrameKey, type Point} from 'remotion-2d-rig-toolkit';

const START = point(570, 712);  // table positions of the mug's base
const END = point(790, 712);
const gripAtStart = worldAnchor(placePropAtBase(MUG, START), MUG.gripAnchor);
const gripAtEnd = worldAnchor(placePropAtBase(MUG, END), MUG.gripAnchor);

const grip: FrameKey<Point>[] = [
  {frame: 0, value: point(360, 840)},              // hand at rest
  {frame: 54, value: gripAtStart},                 // contact
  {frame: 66, value: gripAtStart, interpolation: 'hold'},
  {frame: 92, value: point(gripAtStart.x + 20, gripAtStart.y - 130)},  // lift
  {frame: 140, value: point(gripAtEnd.x - 20, gripAtEnd.y - 130)},     // carry
  {frame: 162, value: gripAtEnd}                   // place
];
const closure: FrameKey<number>[] = [
  {frame: 48, value: 0}, {frame: 66, value: 1},    // close the fingers on contact
  {frame: 162, value: 1, interpolation: 'hold'}, {frame: 174, value: 0}  // open after placing
];
```

An `interpolation` set on a key controls the segment that **ends** at that key. It can be `'smooth'` (the default ease in/out), `'linear'` or `'hold'`.

## 3. Solve the arm and the hand for a frame

```ts
import {
  solveTwoBoneArm, wristForGrip, attachHandToArm, blendHandPoses, createArticulatedHand,
  samplePoint, sampleScalar
} from 'remotion-2d-rig-toolkit';

const ARM = {shoulder: point(318, 486), upperArmLength: 190, forearmLength: 180, elbowBend: 'clockwise'} as const;
const SCALE = 2.1;

function rigAt(frame: number) {
  const target = samplePoint(grip, frame);
  const handAngle = 0;
  // Place the wrist for the CLOSED pose, so the fingers close without the palm moving.
  const wrist = wristForGrip(target, {pose: 'mugHandle', forwardDegrees: handAngle, scale: SCALE});
  const arm = solveTwoBoneArm(ARM, wrist);
  const pose = blendHandPoses('open', 'mugHandle', sampleScalar(closure, frame));
  const hand = attachHandToArm(arm, {pose, handAngle, scale: SCALE, maxWristBend: 80});
  // The point the object must follow: the closed pose at the actual solved wrist.
  const gripPoint = createArticulatedHand({pose: 'mugHandle', wrist: arm.wrist, forwardDegrees: hand.forwardDegrees, scale: SCALE}).gripPoint;
  return {arm, hand, gripPoint};
}
```

## 4. Hand the object over and check continuity

```ts
import {samplePropInteraction, inspectPropInteraction} from 'remotion-2d-rig-toolkit';

const interaction = {
  prop: MUG, initialBase: START, finalBase: END,
  pickupFrame: 66, releaseFrame: 162,
  gripAtFrame: (f: number) => rigAt(f).gripPoint
};

// In a test or before rendering:
const report = inspectPropInteraction(interaction, 0, 239, {tolerancePx: 0.5, maxJumpPx: 14});
if (!report.ok) throw new Error(`Continuity problem: ${JSON.stringify(report)}`);
```

If the hand cannot reach `END`, the arm clamps, the object is released away from the table, and `report.release.errorPx` shows how far it would jump. That is exactly what happened in the first draft of the demo, before the scene was adjusted.

## 5. Draw it in Remotion

```tsx
import {useCurrentFrame} from 'remotion';
import {digitPath, palmPath} from 'remotion-2d-rig-toolkit';

export const Scene: React.FC = () => {
  const frame = useCurrentFrame();
  const {arm, hand} = rigAt(frame);
  const {pose} = samplePropInteraction(interaction, frame);
  const back = hand.digits.filter(d => d.layer === 'back');
  const front = hand.digits.filter(d => d.layer === 'front');
  return (
    <svg viewBox="0 0 1080 1080">
      <path d={`M${arm.shoulder.x} ${arm.shoulder.y} L${arm.elbow.x} ${arm.elbow.y} L${arm.wrist.x} ${arm.wrist.y}`}
        stroke="#4f8fba" strokeWidth={46} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      {back.map(d => <path key={d.digit} d={digitPath(d)} stroke="#ddb994" strokeWidth={d.widths[0]} fill="none" strokeLinecap="round" />)}
      <g transform={`translate(${pose.topLeft.x} ${pose.topLeft.y})`}>{/* your mug artwork */}</g>
      <path d={palmPath(hand)} fill="#f2d4b3" />
      {front.map(d => <path key={d.digit} d={digitPath(d)} stroke="#f2d4b3" strokeWidth={d.widths[0]} fill="none" strokeLinecap="round" />)}
    </svg>
  );
};
```

The depth order is: rear fingers, then the object, then the palm, then the front fingers and thumb. The full demo adds outlines, a character and a table. See [`examples/remotion-demo/src/Scene.tsx`](../examples/remotion-demo/src/Scene.tsx).
