import React from 'react';
import {Composition} from 'remotion';
import {PickupScene} from './Scene';
import {BATTERY_SCENE, MUG_SCENE} from './rig';

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id={MUG_SCENE.id} component={PickupScene} defaultProps={{scene: MUG_SCENE, showGuides: false}}
      durationInFrames={MUG_SCENE.durationInFrames} fps={30} width={1080} height={1080} />
    <Composition id={BATTERY_SCENE.id} component={PickupScene} defaultProps={{scene: BATTERY_SCENE, showGuides: false}}
      durationInFrames={BATTERY_SCENE.durationInFrames} fps={30} width={1080} height={1080} />
  </>
);
