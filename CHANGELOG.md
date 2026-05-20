# Changelog

All notable changes to Solution Intelligence will be documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.0.1-bookend] — 2026-05-20

Initial public publication of the left bookend (the design corpus + the bookend SIG + Stage 1 specs + Stage 1a output references).

### Bookend complete

- **STORY.md** (40 KB) — the methodology as story, with the four-perspective Dramatica analysis preserved in `docs/STORY-MIND.md`.
- **REQUIREMENTS.md** (29 KB) — 111 requirements, functional + non-functional, with the canonical REQ-SI-NNN / REQ-SI-NF-NNN identifiers.
- **MODEL.md** (44 KB) — the data model: three-tier schema (solution-universal / solution-domain / implementation-paradigm), edge types, DSL contract, audit payloads, role permission matrix.
- **BUILD-PLAN.md** — the right bookend's 7-stage decomposition.
- **`docs/`** — USE-CASES (12 happy-path + 6 alternative-flow), FEATURES (16 features mapped to REQs and UCs), OVERVIEW (structured reference), PIPELINE (graphviz architecture), STORY-CONCEPT + STORY-MIND + STORY-V0-ORIGINAL (the working documents that produced the canonical STORY).
- **`sig/`** — the bookend SIG, PolyGraph-backed. The methodology's first concrete consumer is its own design corpus.

### Sibling repos

The Stage 1a output — three standalone-publishable libraries that SI builds atop — has been published as sibling repos:

- [`solution-intelligence-graph-adapter`](https://github.com/wfredricks/solution-intelligence-graph-adapter) — SI/G adapter (Stage 3)
- [`solution-intelligence-parsers`](https://github.com/wfredricks/solution-intelligence-parsers) — parser library (Stage 4)
- [`solution-intelligence-analysts`](https://github.com/wfredricks/solution-intelligence-analysts) — analyst library (Stage 5)

Each is a TypeScript Apache-2.0 library with CI green on first push.
