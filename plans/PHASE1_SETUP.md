# Phase 1: Project Setup — `dkg-claude-code-memory`

**Duration:** ~2 hours  
**Goal:** Clean `npm run build` with zero errors. No functionality yet.

---

## Step 1: Create GitHub Repo

```bash
gh repo create drMurlly/dkg-claude-code-memory \
  --public \
  --description "MCP server giving Claude Code agents persistent, verifiable Working Memory on DKG v10" \
  --license Apache-2.0
```

## Step 2: Initialize Local Directory

```bash
mkdir /home/selon/dkg-claude-code-memory
cd /home/selon/dkg-claude-code-memory
git init
git remote add origin https://github.com/drMurlly/dkg-claude-code-memory.git
```

## Step 3: package.json

```json
{
  "name": "dkg-claude-code-memory",
  "version": "1.0.0",
  "description": "MCP server giving Claude Code agents persistent, verifiable Working Memory on DKG v10",
  "type": "module",
  "engines": { "node": ">=22.0.0" },
  "main": "./dist/index.js",
  "bin": { "dkg-claude-code-memory": "./dist/index.js" },
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "files": ["dist", "LICENSE", "README.md"],
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:coverage": "vitest run --coverage",
    "test:live": "vitest run tests/live-integration.test.ts",
    "prepublishOnly": "npm run build && npm test"
  },
  "keywords": ["dkg", "origintrail", "mcp", "working-memory", "claude-code", "knowledge-graph"],
  "author": "drMurlly",
  "license": "Apache-2.0",
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@vitest/coverage-v8": "^1.6.0",
    "typescript": "^5.4.0",
    "vitest": "^1.6.0"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0"
  }
}
```

**CRITICAL: NO postinstall / preinstall scripts.** Hard CI fail if present.

## Step 4: tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "exactOptionalPropertyTypes": true,
    "esModuleInterop": false,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

## Step 5: vitest.config.ts

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/live-integration.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts'],
    },
  },
});
```

## Step 6: Directory Structure

```bash
mkdir -p src/tools src/core src/types tests/unit/tools tests/unit/core docs .github/workflows
```

## Step 7: Copy Core Modules from Existing Project

Copy these files verbatim first, then adapt in Phase 2:

```bash
cp /home/selon/dkg-openclaw-working-memory/src/modules/dkg-wm-client.ts src/core/dkg-client.ts
cp /home/selon/dkg-openclaw-working-memory/src/modules/dedupe-store.ts src/core/dedupe-store.ts
cp /home/selon/dkg-openclaw-working-memory/src/modules/jsonld-serializer.ts src/core/serializers.ts
cp /home/selon/dkg-openclaw-working-memory/src/modules/secret-redactor.ts src/core/redactor.ts
cp /home/selon/dkg-openclaw-working-memory/src/modules/status-classifier.ts src/core/status-classifier.ts
cp /home/selon/dkg-openclaw-working-memory/src/modules/provenance-builder.ts src/core/provenance-builder.ts
cp /home/selon/dkg-openclaw-working-memory/src/modules/artifact-normalizer.ts src/core/normalizer.ts
cp /home/selon/dkg-openclaw-working-memory/src/types/artifact.ts src/types/artifact.ts
```

## Step 8: GitHub Actions Publish Workflow

File: `.github/workflows/publish.yml`

```yaml
name: Publish to npm

on:
  push:
    tags:
      - 'v*'

jobs:
  publish:
    runs-on: ubuntu-latest
    permissions:
      id-token: write  # Required for npm provenance
      contents: read
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          registry-url: 'https://registry.npmjs.org'
      - run: npm ci
      - run: npm run build
      - run: npm test
      - run: npm publish --provenance --access public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

## Step 9: LICENSE

Copy Apache-2.0 from existing project:
```bash
cp /home/selon/dkg-openclaw-working-memory/LICENSE .
```

## Deliverable Check

```bash
npm install
npm run build  # Must: 0 errors
```

If TypeScript complains about copied files importing OpenClaw types, stub them out temporarily (add empty type declarations) — full adaptation happens in Phase 2.
