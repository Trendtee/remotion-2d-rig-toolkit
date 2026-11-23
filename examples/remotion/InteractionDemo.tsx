import React from 'react';
import {useCurrentFrame} from 'remotion';
import {
  add, point, solveTwoBoneArm, samplePoint, placePropAtBase, worldAnchor,
  samplePropInteraction, createHandGeometry, moveHandGeometry, type FrameKey,
  type Point, type Finger
} from '../../dist/index.js';

const MUG = {
  width: 80, height: 88,
  // Drawn mug's outer handle (near x=68, y=37) and bottom contact (x=32, y=79).
  gripAnchor: point(68, 37),
  baseAnchor: point(32, 79)
};
const START_BASE = point(306, 456);
const END_BASE = point(396, 456);
const TARGET_GRIP_START = worldAnchor(placePropAtBase(MUG, START_BASE), MUG.gripAnchor);
const TARGET_GRIP_END = worldAnchor(placePropAtBase(MUG, END_BASE), MUG.gripAnchor);
const ARM = {shoulder: point(130, 285), upperArmLength: 160, forearmLength: 195, elbowSide: 'left' as const};
const KEYS: FrameKey<Point>[] = [
  {frame: 0, value: point(205, 315)},
  {frame: 20, value: TARGET_GRIP_START},
  {frame: 28, value: TARGET_GRIP_START, interpolation: 'hold'},
  {frame: 46, value: point(310, 285)},
  {frame: 70, value: TARGET_GRIP_END},
  {frame: 90, value: TARGET_GRIP_END, interpolation: 'hold'}
];

function rigAt(frame: number) {
  const wantedGrip = samplePoint(KEYS, frame);
  // The wrist is 20 px behind the palm's world grip point.
  const solution = solveTwoBoneArm(ARM, point(wantedGrip.x - 20, wantedGrip.y));
  return {solution, wrist: solution.wrist, grip: add(solution.wrist, point(20,0))};
}

const interaction = {
  prop: MUG, initialBase: START_BASE, finalBase: END_BASE,
  pickupFrame: 28, releaseFrame: 70, settleFrames: 10,
  gripAtFrame: (f: number) => rigAt(f).grip
};

function FingerPath({finger}: {finger: Finger}) {
  return <line x1={finger.base.x} y1={finger.base.y} x2={finger.tip.x} y2={finger.tip.y}
    stroke="#161616" strokeWidth={finger.thickness + 4} strokeLinecap="round" />;
}
function FingerFill({finger}: {finger: Finger}) {
  return <line x1={finger.base.x} y1={finger.base.y} x2={finger.tip.x} y2={finger.tip.y}
    stroke="#f0d9b8" strokeWidth={finger.thickness} strokeLinecap="round" />;
}
function FingerLayer({fingers}: {fingers: Finger[]}) {
  return <g>{fingers.map(f => <g key={f.digit}><FingerPath finger={f}/><FingerFill finger={f}/></g>)}</g>;
}

/**
 * Minimal original demo artwork: no user characters, private props, or voice assets.
 * Add to an existing Remotion composition with width=1080 height=1080, fps=30, duration=105.
 */
export const InteractionDemo: React.FC = () => {
  const frame = useCurrentFrame();
  const {solution, wrist} = rigAt(frame);
  const sampled = samplePropInteraction(interaction, frame);
  const gripType = frame < 22 || frame > 75 ? 'open' : 'handle';
  const hand = moveHandGeometry(createHandGeometry(gripType, 'right'), wrist);
  return <svg viewBox="0 0 550 580" width="100%" height="100%" style={{background:'#f8f3e9'}}>
    <text x="30" y="48" fill="#161616" fontFamily="system-ui" fontSize="21" fontWeight="bold">
      Hand + prop interaction (open-source demo)
    </text>
    <text x="30" y="75" fill="#525252" fontFamily="system-ui" fontSize="14">
      Frame {frame} · {sampled.phase}
    </text>
    <rect x="45" y="455" width="460" height="14" rx="6" fill="#6b5144"/>
    <rect x="60" y="469" width="24" height="78" fill="#6b5144"/>
    <rect x="468" y="469" width="24" height="78" fill="#6b5144"/>
    <circle cx={solution.shoulder.x} cy={solution.shoulder.y} r="19" fill="#bdcfd6" stroke="#161616" strokeWidth="5" />
    <path d={`M${solution.shoulder.x} ${solution.shoulder.y} L${solution.elbow.x} ${solution.elbow.y} L${wrist.x} ${wrist.y}`}
      fill="none" stroke="#161616" strokeWidth="20" strokeLinecap="round" strokeLinejoin="round"/>
    <path d={`M${solution.shoulder.x} ${solution.shoulder.y} L${solution.elbow.x} ${solution.elbow.y} L${wrist.x} ${wrist.y}`}
      fill="none" stroke="#f0d9b8" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round"/>
    <circle cx={solution.elbow.x} cy={solution.elbow.y} r="9" fill="#f0d9b8" stroke="#161616" strokeWidth="3"/>
    {/* Back fingers, held object, palm, then front fingers create depth. */}
    <FingerLayer fingers={hand.fingers.filter(f=>f.layer==='back')}/>
    <g transform={`translate(${sampled.pose.topLeft.x},${sampled.pose.topLeft.y})`}>
      <path d="M15 24 H55 V70 Q55 79 43 79 H28 Q15 79 15 70Z"
        fill="#7ac9cb" stroke="#161616" strokeWidth="4"/>
      <path d="M54 35 H66 Q77 35 77 49 Q77 63 55 63"
        fill="none" stroke="#161616" strokeWidth="9" strokeLinecap="round"/>
      <path d="M54 35 H66 Q77 35 77 49 Q77 63 55 63"
        fill="none" stroke="#7ac9cb" strokeWidth="5" strokeLinecap="round"/>
      <ellipse cx="35" cy="24" rx="20" ry="6" fill="#a9e9e8" stroke="#161616" strokeWidth="4"/>
    </g>
    <ellipse cx={hand.palmCenter.x} cy={hand.palmCenter.y}
      rx={hand.palmRadius.x} ry={hand.palmRadius.y} fill="#f0d9b8" stroke="#161616" strokeWidth="4"/>
    <FingerLayer fingers={hand.fingers.filter(f=>f.layer==='front')}/>
    <circle cx={wrist.x} cy={wrist.y} r="4" fill="#161616" />
    <text x="32" y="559" fill="#525252" fontFamily="system-ui" fontSize="13">
      Toy shapes only · explicit shoulder/elbow/wrist and object ownership
    </text>
  </svg>;
};
