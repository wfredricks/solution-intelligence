# Build SIG schema extensions (v0.3.5 — Option A)

*Adds first-class dom and imp nodes to the build SIG so the methodology can demonstrate itself end-to-end against the real source code shipped today. Authored 2026-05-20 in response to Bill's "fill in the rest of the SI SIG" request.*

This file documents the schema **deltas** beyond `sig-build/README.md`. Existing labels (`intended_behavior`, `sw.feature`, `sw.use_case`, `sw.repo`, `sw.stage`) keep their meaning.

---

## New Tier-2 (`sw.*`) labels — implementation-agnostic structural shape

| Label | What it represents | Key properties |
|-------|-------------------|----------------|
| `sw.file` | One source file in a repo (the "File" in Bill's dom model) | `path` (relative to repo root), `repo` (`sw.repo` id), `language` (typescript, css, json, dockerfile, ...) |
| `sw.function` | One exported function. The "Function (signature + return)" element. Internal helpers are NOT modeled (too noisy). | `name`, `signature` (e.g. `(text: string) => Float32Array`), `returnType`, `kind` (`function` \| `method` \| `arrow`), `isAsync` (boolean) |
| `sw.alt_flow` | One alternate or error path in a function (try/catch, early-return on bad input, fallback path). Bill's "Alternate/Error flows". | `name` (human label), `condition` (the failure case), `behavior` (what happens) |
| `sw.call_out` | One external invocation: HTTP request, Bedrock SDK call, file I/O, Docker API, child_process. Bill's "Call-outs". | `target` (what gets called — e.g. `bedrock.invokeModel`, `fs.readFileSync`), `kind` (`http` \| `sdk` \| `fs` \| `process` \| `docker`), `purpose` |

### New Tier-2 edges

| Edge | From → To | Meaning |
|------|-----------|---------|
| `LIVES_IN` | `sw.file` → `sw.repo` | File is in repo |
| `DECLARES` | `sw.file` → `sw.function` | File declares a function |
| `IMPLEMENTS_INTENT_OF` | `sw.function` → `sw.feature` | Function realizes a feature's intent (the methodology's core traceability edge) |
| `HAS_ALT_FLOW` | `sw.function` → `sw.alt_flow` | Function has an alternate-flow branch |
| `EMITS_CALLOUT` | `sw.function` → `sw.call_out` | Function makes an external invocation |
| `DEPENDS_ON` | `sw.file` → `sw.file` | One file imports another (intra-repo) |

---

## New Tier-3 (`cs_2026.*`) labels — paradigm-bound realization

Bill's clarification: "the implementation stack elements that /dom bit map to (e.g., API >> NextJS, File >> TS Class)". For the TypeScript-2026 era these are:

| Label | What it represents | Realizes (Tier-2 source) |
|-------|-------------------|--------------------------|
| `cs_2026.source_file` | A .ts file as a TypeScript compilation unit | `sw.file` |
| `cs_2026.function` | A TypeScript function declaration | `sw.function` |
| `cs_2026.class` | A TypeScript class | `sw.file` (when file's primary export is a class) |
| `cs_2026.interface` | A TypeScript interface | (typed shape; not always seam-mapped) |
| `cs_2026.type_alias` | A `type X = ...` declaration | (typed shape) |
| `cs_2026.endpoint` | A Hono route registration (`.get('/api/...')`) | `sw.call_out` of kind=http (incoming side) — actually NO, this realizes the dom-layer concept of "an API surface I expose" which isn't quite `sw.call_out` (those are outgoing). I'll model incoming HTTP endpoints as a NEW dom node: `sw.endpoint` (existing in MODEL.md), realized by `cs_2026.endpoint`. |
| `cs_2026.try_catch` | A try/catch block | `sw.alt_flow` |
| `cs_2026.early_return` | An if-guard early return | `sw.alt_flow` (kind=early-return) |
| `cs_2026.sdk_call` | An SDK invocation (e.g. BedrockClient.send) | `sw.call_out` (kind=sdk) |
| `cs_2026.fetch_call` | A `fetch()` invocation | `sw.call_out` (kind=http, outgoing) |
| `cs_2026.fs_call` | A `node:fs` call | `sw.call_out` (kind=fs) |

### New Tier-3 edges

| Edge | From → To | Meaning |
|------|-----------|---------|
| `REALIZES_FORM` | `cs_2026.*` → `sw.*` | Tier-3 node is the paradigm-bound realization of a Tier-2 dom node (the deployment-specifier seam edge) |
| `TRACED_TO` | `cs_2026.source_file` → string | Implicit: source file path. Stored as a property, not an edge, to keep edge count manageable. |

---

## Why this schema is the right cut

The dom layer answers: *what shape does the system have, paradigm-independent?* Files, functions with signatures, alt flows, call-outs. If we re-target to ServiceNow, the dom shape stays — files become "scripts," functions become "business rules" or "script includes," alt flows become "flow designer error branches," call-outs become "REST messages."

The imp layer answers: *what does that shape look like in this specific paradigm?* `cs_2026.source_file` for TypeScript today. A future `sn_2026.script_include` would realize the same `sw.function` if we deployed to ServiceNow.

The `REALIZES_FORM` edge is the deployment-specifier seam. Every Tier-3 node points to its Tier-2 progenitor. Walk the edges and you get the deploy contract for free.

---

## Feature-coverage payoff

Once loaded, `sw.function → sw.feature` IMPLEMENTS_INTENT_OF edges let an analyst (or just `/focus FT-SI-09`) answer:

> *"Which functions across the codebase implement the SI/W consumer window feature?"*

For features we've actually shipped (the chat drawer, the slash palette, segment slicing, the `polygraph-viz` Force renderer), the answer is a concrete subgraph of source files + their functions + the alt flows + the call-outs. That's the methodology's primary value proposition demonstrated against the substrate that proves it.

Empty for features we haven't shipped yet (FT-SI-01 lifecycle, FT-SI-05 GraphLoader, FT-SI-06 analysts, FT-SI-07 GraphReader). The build SIG correctly shows the gap.

---

## Open questions deferred to v0.4

- Internal (non-exported) helpers — modeled or not? Today: NOT. Future: a `sw.function` with `isInternal: true` property when the dom-traceability analyst needs them.
- Test coverage edges (`sw.test → sw.function` it covers). Future: yes, this is a real coverage analyst input.
- Cross-repo imports (`sw.file --DEPENDS_ON--> sw.file` across repo boundaries). Today: skipped for v0.3.5; intra-repo only.

🖇️ Schema spec for the Option A fill-in pass.
