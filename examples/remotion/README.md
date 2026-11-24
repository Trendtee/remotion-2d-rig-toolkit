# Minimal v0.1 example

`InteractionDemo.tsx` is the original single-file example from v0.1.0. It uses the simple
one-segment `createHandGeometry()` hand.

For a complete, runnable Remotion project with jointed fingers, two scenes and automated continuity QC,
see [`../remotion-demo`](../remotion-demo/README.md).

## Use in an existing Remotion 4 project

1. Install the toolkit: `npm install /path/to/remotion-2d-rig-toolkit` (after `npm run build` in the toolkit).
2. Copy `InteractionDemo.tsx` into your project and change its import from `../../dist/index.js` to `remotion-2d-rig-toolkit`.
3. Register it:

```tsx
import {Composition} from 'remotion';
import {InteractionDemo} from './InteractionDemo';

export const Root = () => <Composition id="InteractionDemo" component={InteractionDemo}
  width={1080} height={1080} fps={30} durationInFrames={105}/>;
```
