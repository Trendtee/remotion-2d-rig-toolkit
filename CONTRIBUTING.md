# Contributing

Thanks for your interest! Issues and focused pull requests are welcome.

## Good first contributions

- A new hand preset for a real object (phone, pen, steering wheel…), with a test for its grip gap or grip point.
- A bug report with a minimal numeric reproduction.
- Documentation fixes and examples.

## Development

```bash
npm install
npm test                  # build + unit tests
npm run typecheck

# Remotion demo
cd examples/remotion-demo
npm install
npm run qc                # per-frame continuity QC
npm run studio            # visual check
```

## Guidelines

1. **Open an issue first** for anything larger than a small fix, so we can agree on the approach.
2. **Add tests** for behaviour changes, especially IK reach, joint limits, mirroring and pickup/release continuity.
3. **Keep it pure:** no clocks, randomness or global state in `src/`.
4. **Describe geometry in screen coordinates** (positive y down, positive angles clockwise).
5. **Update `CHANGELOG.md`** under `## [Unreleased]`.
6. **Licensing:** only contribute code and artwork you wrote or may redistribute under MIT. No characters, brands, voices or media you do not have rights to.

By participating you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).
