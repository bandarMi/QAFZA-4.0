# Assets

Brand assets belong here, organised by section:

```
assets/
├── fonts/        Arabic TTF for PDF export (see fonts/README.md)
├── gallery/      Event photography
├── members/      Member portraits
└── initiatives/  Per-initiative imagery and icons
```

Everything in this directory is served at `/assets/...` by the API.

## Why this directory is empty of imagery

Phase 1 item 4 of the build brief asks for hero imagery and photography to be pulled from the SLS page and
the Impact Report into this library. **They could not be fetched**: every Misk-owned host
(`hub.misk.org.sa`, `content.cdnhub.misk.org.sa`, `brand.misk.org.sa`) is blocked by this build
environment's network egress policy, returning HTTP 403 at the proxy. See `docs/DESIGN_TOKENS_REPORT.md`.

These are official brand assets in any case, so downloading and committing them is a decision for the
program owner rather than something to do automatically. To add them: drop the files into the folders above
and reference them as `/assets/gallery/....`.

The dashboard is designed to look finished without photography — it uses the brand colour system, generated
SVG recap cards and vector charts rather than stock imagery.
