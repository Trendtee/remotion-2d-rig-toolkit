# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/). Before 1.0.0, minor versions may contain breaking changes;
they are listed explicitly.

## [Unreleased]

### Added
- **Precision pinch with real thumb–index opposition.** `solvePinchGrip()` fits the pinch opening to an object and places the hand so the thumb and index tips touch two contact points, using the surface normals so oblique grips do not penetrate. Supporting pieces: `placeHandForPinch()`, `pinchPoseForGap()`, `pinchTips()`, and the `pinchWide` → `batteryPinch` → `pinchTight` pose family.
- **Contact measurement.** `measureDigitContacts()` measures each digit (as tapered capsules) and the palm against an object outline; `signedDistanceToConvexPolygon()`.
- **Joint radii.** Each digit now has a radius per joint (`radii`), and `digitSegments()` draws tapered digits with one continuous outline.
- **Elbow constraints.** `minElbowAngle` / `maxElbowAngle` on `TwoBoneArm`, `elbowLimited` on the solution, and `reachForElbowAngle()`.
- **Smooth multi-waypoint paths.** `sampleSmoothPoint()` / `sampleSmoothScalar()` (cubic Hermite, velocity carried through waypoints, `stop` keys).
- **Objects that turn with the hand.** `heldAngleAtFrame` on `PropInteraction`; transfer checks report `angleErrorDegrees`.
- Pinch contact anchors on props: `pinchContacts`, `pinchNormals`, `propPinchContacts()`, `propPinchNormals()`, `propOutline()`.
- Hand-local coordinates for rigid attachment: `toHandLocal()` / `fromHandLocal()`.
- `tools/tune-pinch.mjs`: the deterministic search used to tune the pinch poses.

### Changed
- **Hand proportions (visual change).** The fingers are shorter (middle finger ≈ 0.8 × palm), thicker and tapered. The thumb is thicker and starts at a thenar mound. The palm outline is rounded. The `relaxed` pose is curled, so it no longer hangs straight.
- `palmPath()` now returns a smoothed path (quadratic curves) instead of straight segments.
- `widths` on digits is now the mean diameter of each segment (derived from `radii`).
- `batteryPinch` and `paperPinch` were re-tuned as members of the new pinch family.

## [0.2.0] - 2026-11-24

### Added
- Jointed hands (`createArticulatedHand`): five digits × three segments, joint limits, exact left/right mirroring.
- Nine hand presets: `open`, `relaxed`, `fist`, `point`, `mugHandle`, `controller`, `batteryPinch`, `paperPinch`, `cableWrap`.
- `blendHandPoses`, `wristForGrip`, `gripOffset`, `limitWristBend`, `attachHandToArm`, `clampDigitCurl`, `digitPath`, `palmPath`.
- `solveTwoBoneArm` now returns `upperArmAngle`, `forearmAngle` and `elbowAngle`, and accepts `elbowBend: 'clockwise' | 'counterclockwise'`.
- `checkReleaseContact` and `inspectPropInteraction` for automated continuity QC.
- Geometry helpers: `angleBetween`, `fromAngle`, `angleDelta`, `lerpAngle`.
- `palmAngle` on the simple v0.1 hand.
- Runnable Remotion demo (`examples/remotion-demo`) with two scenes and per-frame QC.
- API reference, quick-start guide, issue/PR templates, Dependabot and a CI matrix (Node 22 and 24).

### Fixed
- `createHandGeometry`: a left hand was not the mirror image of a right hand when `wristAngle` ≠ 0.
- `samplePropInteraction`: `finalBase` was ignored when `settleFrames` was 0 or omitted.
- `samplePropInteraction`: a non-finite frame returned `'released'` instead of throwing.
- Published source maps pointed at `src/` files that were not included in the package.

### Changed
- **Possibly breaking:** objects with a `finalBase` and no `settleFrames` are now placed at `finalBase` on the release frame. Previously they stayed where they were released.
- `elbowSide` is deprecated in favour of `elbowBend`. Its behaviour is unchanged; the old names did not match the on-screen side.
- `elbowSide`/`elbowBend` is now optional (defaults to clockwise, the same as the v0.1.0 `'left'`).
- Minimum Node.js version is now 22 (Node.js 20 reached end of life in April 2026).

## [0.1.0] - 2026

### Added
- Initial release: two-bone IK, simple five-digit hand geometry, prop anchors, pickup/carry/release sampling, pickup contact check, keyframe sampling, layer ordering and a minimal Remotion example.

[Unreleased]: https://github.com/Trendtee/remotion-2d-rig-toolkit/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/Trendtee/remotion-2d-rig-toolkit/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/Trendtee/remotion-2d-rig-toolkit/releases/tag/v0.1.0
