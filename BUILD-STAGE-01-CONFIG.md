# BUILD-STAGE-01-CONFIG: Tooling lock-in for Stage 1

*Tooling decisions for the Stage 1 scaffold, locked. A sub-agent must not invent alternatives.*

**Status:** 2026-05-19, pre-spawn.
**Companion:** `BUILD-STAGE-01-SPEC.md`.

Default policy: **match polygraph and chainblocks where they agree.** SI is the third sibling library aimed at the same audience (government, regulated, embeddable, OSS), and consistency across the three projects is a feature.

---

## Language & runtime

| Choice | Value | Rationale |
|--------|-------|-----------|
| Language | TypeScript 5.6.x or 6.x (whichever is on disk via `tsc --version`) | Match polygraph + chainblocks; strict mode on |
| Target | ES2022 | Match siblings |
| Module system | ESM-only (no CJS dual-package) | Simpler than chainblocks' dual export; the SI consumer is always our own code, never legacy CJS |
| Node engines | `>=20` | Per REQ-SI-NF-030 |
| Build tool | `tsup` ^8.0.0 | Match siblings |
| Test runner | `vitest` ^4.0.0 (or ^2.0.0 if 4 is not yet on disk) | Match siblings; v4 if available |
| Coverage provider | `@vitest/coverage-v8` | Match siblings |
| Package manager | `npm` | Match siblings; no pnpm for v0.1 |
| Linter | `eslint` ^9.0.0 with `@typescript-eslint/eslint-plugin` ^8.0.0 | Per REQ-SI-NF-050 |
| Formatter | `prettier` ^3.0.0 | Per REQ-SI-NF-050 |

If the exact versions above are not on disk, use the closest installed major version and note it in `BUILD-STAGE-01-FINDINGS.md`. Do not silently upgrade or downgrade across major-version boundaries without surfacing.

---

## Standard `package.json` template (per repo)

```jsonc
{
  "name": "@solution-intelligence/<short-name>",
  "version": "0.1.0-pre",
  "description": "<one-line per-repo purpose from the table in BUILD-STAGE-01-SPEC.md>",
  "author": "William Fredricks",
  "license": "Apache-2.0",
  "repository": {
    "type": "git",
    "url": "https://github.com/wfredricks/<repo-name>.git"
  },
  "homepage": "https://github.com/wfredricks/<repo-name>#readme",
  "bugs": {
    "url": "https://github.com/wfredricks/<repo-name>/issues"
  },
  "keywords": [
    "solution-intelligence",
    "knowledge-graph",
    "audit",
    "provenance",
    "typescript",
    "<repo-specific keyword>"
  ],
  "type": "module",
  "main": "dist/index.js",
  "module": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "files": ["dist", "LICENSE", "README.md", "CHANGELOG.md", "SECURITY.md"],
  "engines": { "node": ">=20" },
  "scripts": {
    "build": "tsup",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src tests",
    "lint:fix": "eslint src tests --fix",
    "format": "prettier --write src tests",
    "format:check": "prettier --check src tests",
    "clean": "rm -rf dist coverage",
    "prepublishOnly": "npm run typecheck && npm run lint && npm run test && npm run build"
  },
  "dependencies": {
    /* inter-repo dependencies via file: — see BUILD-STAGE-01-SPEC.md §Architecture */
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@typescript-eslint/eslint-plugin": "^8.0.0",
    "@typescript-eslint/parser": "^8.0.0",
    "@vitest/coverage-v8": "^4.0.0",
    "eslint": "^9.0.0",
    "prettier": "^3.0.0",
    "tsup": "^8.0.0",
    "typescript": "^5.6.0",
    "vitest": "^4.0.0"
  }
}
```

Substitute `<short-name>`, `<repo-name>`, and the description per the eight-repo table in `BUILD-STAGE-01-SPEC.md`.

The repos that have a CLI (only `solution-intelligence-cli` for now) get an additional `bin` entry — but that doesn't apply to Stage 1; the CLI repo's `bin` is added in Stage 2.

---

## Standard `tsconfig.json`

```jsonc
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "dist",
    "rootDir": "src",
    "resolveJsonModule": true,
    "allowSyntheticDefaultImports": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests", "**/*.test.ts"]
}
```

---

## Standard `tsup.config.ts`

```typescript
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'es2022',
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  treeshake: true,
});
```

---

## Standard `vitest.config.ts`

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/index.ts'],
    },
  },
});
```

**Note on the coverage `exclude`:** Stage 1's only source file is `src/index.ts` which contains only a `VERSION` constant. Excluding it from coverage prevents the smoke test from being graded against a single trivial export. When real product code lands in later stages, that exclusion will be removed.

---

## Standard `.eslintrc.json`

```jsonc
{
  "root": true,
  "parser": "@typescript-eslint/parser",
  "parserOptions": {
    "ecmaVersion": 2022,
    "sourceType": "module",
    "project": "./tsconfig.json"
  },
  "plugins": ["@typescript-eslint"],
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended"
  ],
  "rules": {
    "@typescript-eslint/no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }],
    "@typescript-eslint/no-explicit-any": "warn",
    "prefer-const": "error"
  },
  "ignorePatterns": ["dist", "coverage", "node_modules"]
}
```

---

## Standard `.prettierrc.json`

```json
{
  "tabWidth": 2,
  "useTabs": false,
  "singleQuote": true,
  "semi": true,
  "trailingComma": "all",
  "printWidth": 100,
  "endOfLine": "lf"
}
```

---

## Standard `.gitignore`

```
# dependencies
node_modules/

# build output
dist/
*.tsbuildinfo

# coverage
coverage/

# OS
.DS_Store

# env + secrets
.env
.env.*
!.env.example

# logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# editor
.vscode/
.idea/
*.swp
*.swo
```

---

## Standard CI workflow (`.github/workflows/ci.yml`)

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
jobs:
  build:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: ['20.x', '22.x']
    steps:
      - uses: actions/checkout@v4
      - name: Use Node.js ${{ matrix.node-version }}
        uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
      - name: Install dependencies
        run: npm install
      - name: Lint
        run: npm run lint
      - name: Typecheck
        run: npm run typecheck
      - name: Test
        run: npm run test:coverage
      - name: Build
        run: npm run build
```

**Note on `npm install` vs `npm ci`:** Stage 1 uses `npm install` (not `ci`) in CI because the `file:` cross-repo dependencies will not resolve under `npm ci` (which strictly requires `package-lock.json` and is intolerant of non-registry sources). When the dependencies are eventually published, Stage 7 will swap CI back to `npm ci`.

---

## What is intentionally NOT in this Stage

These come in later stages and the sub-agent must not introduce them prematurely:

- Real source code (Stage 2+ depending on the repo).
- JSDoc-coverage checking script (`scripts/check-jsdoc-coverage.ts`) — Stage 1 only has a `VERSION` export, JSDoc coverage is trivially 100%, no point in scripting it yet. Added in the first stage that produces real exports.
- Test categories beyond `smoke.test.ts` (Stage 2+ adds `unit/`, `integration/`, `req/`, `scenario/` per the playbook).
- Docker images (Stages 4+ for service repos).
- Pre-commit hooks via `husky`/`lint-staged` (Stage 7 polish).
- `prepare` script that runs build on install (chainblocks does this for self-contained distribution; SI repos are workspace-internal until publish; defer to Stage 7).
- `npm publish` configuration (Stage 7).

---

## Spawn instructions

The sub-agent is spawned with:

- **Working directory:** `~/.openclaw/workspace/artifacts/`
- **Task:** "Execute BUILD-STAGE-01-SPEC.md for Solution Intelligence v0.1. Read the spec and this config first. Verify by running, not by reading. Surface failures immediately. Produce BUILD-STAGE-01-REPORT.md at completion."
- **Model:** Opus 4.7 (or current Opus default)
- **Context:** isolated (not forked from the requester transcript; the spec docs are the input contract)
- **Timeout:** none — runs to completion or until the hard ceiling of 4 hours noted in the spec
- **Allowed tools:** all (the sub-agent will need exec, write, edit, read, file_fetch, file_write — the standard build toolchain)

---

*BUILD-STAGE-01-CONFIG.md v0.1 — Solution Intelligence. Tooling lock for Stage 1 of the v0.1 build.*
