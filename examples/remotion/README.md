# Remotion example

`InteractionDemo.tsx` is an optional original drawing demo built with SVG and Remotion's `useCurrentFrame()`.

## Try in an existing Remotion 4.x project

1. Extract this toolkit locally, then run `npm install && npm run build` in the toolkit directory.
2. Copy `examples/remotion/InteractionDemo.tsx` to your Remotion project's source folder.
3. Install the toolkit from the local path: `npm install /path/to/remotion-2d-rig-toolkit` (or copy `dist/` next to the example and adjust its import).
4. Change the example import from `../../dist/index.js` to `remotion-2d-rig-toolkit`.
5. Register a composition in your existing Remotion root:

```tsx
import {Composition} from 'remotion';
import {InteractionDemo} from './InteractionDemo';

export const Root = () => <Composition id="InteractionDemo" component={InteractionDemo}
  width={1080} height={1080} fps={30} durationInFrames={105}/>;
```

This example illustrates math, attachment and layer ordering—not production-quality artwork, collision detection, or a complete five-finger grasp. Run visual playback QC before reusing it in a real animation.
