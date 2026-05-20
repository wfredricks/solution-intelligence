# build-history/

*Provenance trail for the SI v0.1 build.*

This directory holds the sub-agent briefs and findings reports produced during the SI v0.1 build. They are kept for traceability — if someone reads the methodology paper and wonders *"how did the SI team actually use sub-agents to produce the 8 v0.1 repos?"*, the answer lives here.

These files are **not the methodology**. They are the **trail of the build**. The canonical methodology corpus lives at the repo root: [`STORY.md`](../STORY.md), [`REQUIREMENTS.md`](../REQUIREMENTS.md), [`MODEL.md`](../MODEL.md), [`BUILD-PLAN.md`](../BUILD-PLAN.md), [`BUILD-STAGE-01-SPEC.md`](../BUILD-STAGE-01-SPEC.md), [`BUILD-STAGE-01-CONFIG.md`](../BUILD-STAGE-01-CONFIG.md), and the [`docs/`](../docs/) bundle.

## Index

| File | What it is |
|------|------------|
| [`BUILD-STAGE-01A-BRIEF.md`](./BUILD-STAGE-01A-BRIEF.md) | The sub-agent brief used to spawn Stage 1a (3 standalone-publishable repos). Hardened against the failure modes of an earlier Stage 1 run that died silently. |
| [`BUILD-STAGE-01A-FINDINGS.md`](./BUILD-STAGE-01A-FINDINGS.md) | The findings report for Stage 1a. Records what succeeded, what failed, what was inherited from a partial sub-agent run, and the recovery sequence (copy-and-substitute from `chainblocks/` after a content-filter block on direct generation). |

## Lessons logged here (preserved for the methodology)

The Stage 1a build surfaced two real failure modes that any SI consumer using sub-agents should know about:

1. **Sub-agents at large surface area silently fail.** The first Stage 1 attempt asked one sub-agent to produce all 8 v0.1 repos (≈120-150 files). It ran for ≈2.5 minutes and died mid-write of a large generator script. No exception fired; the runtime reported "completed." The result was a partial-but-plausible-looking directory state that would have failed CI silently if not inspected by hand. Decomposition into Stage 1a (3 repos) + Stage 1b (5 repos) is the working pattern.
2. **Content-filter blocks during recovery are real.** When the orchestrator attempted to finish the partial work in-session by generating long file bodies (LICENSE, governance docs), it hit Anthropic's content classifier. The working recovery pattern is **copy-and-substitute from sibling repos** (`chainblocks/`, `polygraph/`, `bangauth/`) rather than generate boilerplate from scratch.

Both lessons are now embedded in `BUILD-PLAN.md` §"What goes wrong if we try to spawn this as one sub-agent" and `BUILD-STAGE-01-SPEC.md` §"🛑 The six non-negotiable rules."
