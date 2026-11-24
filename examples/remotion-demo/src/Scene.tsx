import React, {useMemo} from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {digitPath, palmPath, type ArticulatedDigit, type ArticulatedHand, type PropPose} from 'remotion-2d-rig-toolkit';
import {SHOULDER, TABLE_TOP, buildScene, type SceneConfig} from './rig';

// Original, neutral demo palette. No third-party characters or brand assets.
const INK = '#1d1b22';
const SKIN = '#f2d4b3';
const SKIN_SHADE = '#ddb994';
const SHIRT = '#4f8fba';
const SHIRT_SHADE = '#3c7299';
const BG = '#f6f1e7';
const WOOD = '#9a6b4f';

const Digit: React.FC<{d: ArticulatedDigit; shade?: boolean}> = ({d, shade}) => (
  <g>
    <path d={digitPath(d)} fill="none" stroke={INK} strokeWidth={d.widths[0] + 6} strokeLinecap="round" strokeLinejoin="round" />
    <path d={digitPath(d)} fill="none" stroke={shade ? SKIN_SHADE : SKIN} strokeWidth={d.widths[0]} strokeLinecap="round" strokeLinejoin="round" />
  </g>
);

const Mug: React.FC = () => (
  <g>
    <path d="M18 72 C18 36 50 34 50 34 M18 72 C18 108 50 110 50 110" fill="none" stroke={INK} strokeWidth={22} strokeLinecap="round" />
    <path d="M18 72 C18 36 50 34 50 34 M18 72 C18 108 50 110 50 110" fill="none" stroke="#e5704b" strokeWidth={12} strokeLinecap="round" />
    <path d="M44 16 H140 V118 Q140 138 118 138 H66 Q44 138 44 118 Z" fill="#e5704b" stroke={INK} strokeWidth={6} />
    <ellipse cx={92} cy={16} rx={48} ry={10} fill="#f3a183" stroke={INK} strokeWidth={6} />
    <path d="M64 44 V104" stroke="#f3a183" strokeWidth={8} strokeLinecap="round" />
  </g>
);

const Battery: React.FC = () => (
  <g>
    <rect x={13} y={0} width={14} height={8} rx={3} fill="#c9c9c9" stroke={INK} strokeWidth={4} />
    <rect x={2} y={6} width={36} height={90} rx={8} fill="#3d3d46" stroke={INK} strokeWidth={5} />
    <rect x={2} y={6} width={36} height={30} rx={8} fill="#7bc96f" stroke={INK} strokeWidth={5} />
    <path d="M20 54 V74 M12 64 H28" stroke="#f6f1e7" strokeWidth={4} strokeLinecap="round" />
  </g>
);

const PropArt: React.FC<{scene: SceneConfig; pose: PropPose}> = ({scene, pose}) => (
  <g transform={`translate(${pose.topLeft.x} ${pose.topLeft.y}) rotate(${pose.angleDegrees}) scale(${pose.scale})`}>
    {scene.prop === undefined ? null : scene.id === 'MugPickup' ? <Mug /> : <Battery />}
  </g>
);

const Hand: React.FC<{hand: ArticulatedHand; layer: 'back' | 'front'; fingersBehind: boolean}> = ({hand, layer, fingersBehind}) => {
  const thumb = hand.digits.find(d => d.digit === 'thumb')!;
  const fingers = hand.digits.filter(d => d.digit !== 'thumb');
  const isBack = (d: ArticulatedDigit) => fingersBehind || d.layer === 'back';
  if (layer === 'back') {
    // Furthest digit first (pinky), so nearer fingers overlap it.
    return <g>{[...fingers].reverse().filter(isBack).map(d => <Digit key={d.digit} d={d} shade />)}</g>;
  }
  return (
    <g>
      <path d={palmPath(hand)} fill={SKIN} stroke={INK} strokeWidth={6} strokeLinejoin="round" />
      {[...fingers].reverse().filter(d => !isBack(d)).map(d => <Digit key={d.digit} d={d} />)}
      <Digit d={thumb} />
    </g>
  );
};

const Character: React.FC<{blink: boolean; lookX: number}> = ({blink, lookX}) => (
  <g>
    {/* Rear arm hangs relaxed behind the body. */}
    <path d={`M${SHOULDER.x - 80} ${SHOULDER.y + 6} L${SHOULDER.x - 96} ${SHOULDER.y + 170} L${SHOULDER.x - 84} ${SHOULDER.y + 300}`}
      fill="none" stroke={INK} strokeWidth={56} strokeLinecap="round" strokeLinejoin="round" />
    <path d={`M${SHOULDER.x - 80} ${SHOULDER.y + 6} L${SHOULDER.x - 96} ${SHOULDER.y + 170} L${SHOULDER.x - 84} ${SHOULDER.y + 300}`}
      fill="none" stroke={SHIRT_SHADE} strokeWidth={44} strokeLinecap="round" strokeLinejoin="round" />
    {/* Body */}
    <path d="M150 1040 C140 760 160 470 255 450 C350 430 380 600 372 1040 Z" fill={SHIRT} stroke={INK} strokeWidth={7} />
    {/* Head */}
    <circle cx={262} cy={330} r={104} fill={SKIN} stroke={INK} strokeWidth={7} />
    <path d="M168 296 C176 220 250 196 318 214 C352 224 366 250 368 280 C330 262 280 250 230 262 C204 268 184 282 168 296 Z" fill="#5a3d33" stroke={INK} strokeWidth={6} />
    {blink ? (
      <>
        <path d={`M${300 + lookX} 334 h22`} stroke={INK} strokeWidth={6} strokeLinecap="round" />
        <path d={`M${246 + lookX} 334 h20`} stroke={INK} strokeWidth={6} strokeLinecap="round" />
      </>
    ) : (
      <>
        <ellipse cx={311 + lookX} cy={332} rx={10} ry={14} fill={INK} />
        <ellipse cx={256 + lookX} cy={332} rx={9} ry={13} fill={INK} />
      </>
    )}
    <path d="M286 382 Q306 396 326 380" fill="none" stroke={INK} strokeWidth={6} strokeLinecap="round" />
  </g>
);

const Arm: React.FC<{shoulder: {x: number; y: number}; elbow: {x: number; y: number}; wrist: {x: number; y: number}}> = ({shoulder, elbow, wrist}) => {
  const d = `M${shoulder.x} ${shoulder.y} L${elbow.x} ${elbow.y} L${wrist.x} ${wrist.y}`;
  return (
    <g>
      <path d={d} fill="none" stroke={INK} strokeWidth={58} strokeLinecap="round" strokeLinejoin="round" />
      <path d={d} fill="none" stroke={SHIRT} strokeWidth={46} strokeLinecap="round" strokeLinejoin="round" />
      {/* Bare wrist between the sleeve cuff and the palm. */}
      <circle cx={wrist.x} cy={wrist.y} r={21} fill={SKIN} stroke={INK} strokeWidth={6} />
    </g>
  );
};

export const PickupScene: React.FC<{scene: SceneConfig; showGuides?: boolean}> = ({scene, showGuides = false}) => {
  const frame = useCurrentFrame();
  const built = useMemo(() => buildScene(scene), [scene]);
  const f = built.frameAt(frame);
  const lookX = Math.max(-4, Math.min(8, (f.hand.gripPoint.x - 520) / 40));
  const blink = frame % 96 >= 90;
  return (
    <AbsoluteFill style={{backgroundColor: BG}}>
      <svg viewBox="0 0 1080 1080" width="100%" height="100%">
        <text x={60} y={86} fill={INK} fontFamily="Inter, system-ui, sans-serif" fontSize={40} fontWeight={800}>remotion-2d-rig-toolkit</text>
        <text x={60} y={132} fill="#5d5a66" fontFamily="Inter, system-ui, sans-serif" fontSize={28}>{scene.title}</text>
        <Character blink={blink} lookX={lookX} />
        {/* Table (behind the hand and the object) */}
        <rect x={420} y={TABLE_TOP} width={620} height={26} rx={10} fill={WOOD} stroke={INK} strokeWidth={6} />
        <rect x={470} y={TABLE_TOP + 26} width={30} height={330} fill={WOOD} stroke={INK} strokeWidth={6} />
        <rect x={960} y={TABLE_TOP + 26} width={30} height={330} fill={WOOD} stroke={INK} strokeWidth={6} />
        <Arm shoulder={f.arm.shoulder} elbow={f.arm.elbow} wrist={f.arm.wrist} />
        {/* Depth order: rear fingers → object → palm → front fingers → thumb */}
        <Hand hand={f.hand} layer="back" fingersBehind={f.fingersBehindObject} />
        <PropArt scene={scene} pose={f.prop.pose} />
        <Hand hand={f.hand} layer="front" fingersBehind={f.fingersBehindObject} />
        {showGuides ? (
          <g fontFamily="monospace" fontSize={22} fill={INK}>
            <circle cx={f.hand.gripPoint.x} cy={f.hand.gripPoint.y} r={6} fill="#e0245e" />
            <circle cx={f.arm.elbow.x} cy={f.arm.elbow.y} r={6} fill="#e0245e" />
            <text x={945} y={1040} textAnchor="end">frame {frame} · {f.prop.phase} · elbow {f.arm.elbowAngle.toFixed(0)}°</text>
          </g>
        ) : (
          <text x={945} y={1040} textAnchor="end" fill="#8a8794" fontFamily="Inter, system-ui, sans-serif" fontSize={24}>
            {f.prop.phase === 'held' ? 'held by hand' : f.prop.phase === 'resting' ? 'resting on table' : 'released'} · MIT-licensed demo
          </text>
        )}
      </svg>
    </AbsoluteFill>
  );
};
