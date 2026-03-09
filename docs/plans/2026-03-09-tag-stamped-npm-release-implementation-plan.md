# Tag-Stamped npm Release Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make `f1aire` publish npm packages from git tags while keeping the repo `package.json` version at `0.0.0`, then cut the next patch tag to trigger the release workflow.

**Architecture:** Add a small packaging script that stages a publishable npm directory, stamps the staged `package.json` from a required `VERSION` env var, and runs `npm pack` from that staged output in CI. Update the publish workflow to use the staged package instead of asserting that the repo `package.json` matches the tag.

**Tech Stack:** Bash, Node.js file mutation inside the packaging script, GitHub Actions YAML, Vitest or shell-based verification where appropriate.

---

### Task 1: Add Failing Tests for Tag-Stamped Packaging Metadata

**Files:**
- Create: `scripts/build-npm-package.test.ts`

**Step 1: Write the failing test**

Add tests that assert:
- a helper can derive `0.1.6` from `v0.1.6`
- invalid versions are rejected
- the staged package version becomes the stripped tag version while the repo `package.json` can remain `0.0.0`

**Step 2: Run test to verify it fails**

Run:
```bash
npm test -- scripts/build-npm-package.test.ts
```
Expected: FAIL because the helper/module does not exist yet.

**Step 3: Implement minimal helper**

Create the smallest reusable helper module needed by the packaging script so the tests can pass.

**Step 4: Run test to verify it passes**

Run:
```bash
npm test -- scripts/build-npm-package.test.ts
```
Expected: PASS.

**Step 5: Commit**

```bash
git add scripts/build-npm-package.test.ts scripts/build-npm-package.ts
git commit -m "feat: add tag-stamped npm packaging helper"
```

---

### Task 2: Add the Packaging Script and Switch Repo Version to `0.0.0`

**Files:**
- Create: `scripts/build-npm-package.sh`
- Modify: `package.json`

**Step 1: Write the failing verification**

Run:
```bash
VERSION=v0.1.6 ./scripts/build-npm-package.sh
```
Expected: FAIL because the script does not exist yet.

**Step 2: Implement the packaging script**

Create a script that:
- requires `VERSION`
- strips the leading `v`
- stages a publish directory under `dist/npm`
- copies the publish payload into it
- rewrites the staged `package.json` version only in the staged directory

Set the repo `package.json` version to `0.0.0`.

**Step 3: Run verification**

Run:
```bash
VERSION=v0.1.6 ./scripts/build-npm-package.sh
node --input-type=module -e "import { readFileSync } from 'node:fs'; const pkg = JSON.parse(readFileSync('dist/npm/package.json','utf8')); if (pkg.version !== '0.1.6') throw new Error(pkg.version);"
node --input-type=module -e "import { readFileSync } from 'node:fs'; const pkg = JSON.parse(readFileSync('package.json','utf8')); if (pkg.version !== '0.0.0') throw new Error(pkg.version);"
```
Expected: PASS.

**Step 4: Commit**

```bash
git add scripts/build-npm-package.sh package.json scripts/build-npm-package.ts scripts/build-npm-package.test.ts
git commit -m "feat: stage npm package version from tags"
```

---

### Task 3: Update Publish Workflow to Pack and Publish the Staged Package

**Files:**
- Modify: `.github/workflows/publish.yml`

**Step 1: Write the failing verification**

Inspect the workflow and confirm it still:
- checks `package.json` against the tag
- packs from the repo root

That is the expected failing baseline.

**Step 2: Implement the workflow change**

Update the workflow to:
- keep the tag trigger
- build/test as before
- run `VERSION=${GITHUB_REF_NAME} ./scripts/build-npm-package.sh`
- run `npm pack --silent ./dist/npm`
- publish the resulting tarball
- remove the old repo `package.json` equality check

**Step 3: Run verification**

Run:
```bash
VERSION=v0.1.6 ./scripts/build-npm-package.sh
npm pack --silent ./dist/npm
```
Expected: PASS and produces a tarball for version `0.1.6`.

**Step 4: Commit**

```bash
git add .github/workflows/publish.yml
git commit -m "feat: publish npm package from tag-stamped staging dir"
```

---

### Task 4: Full Verification and Patch Tag

**Files:**
- Modify only if verification uncovers issues

**Step 1: Run full verification**

Run:
```bash
npm test -- scripts/build-npm-package.test.ts
npm run typecheck
VERSION=v0.1.6 ./scripts/build-npm-package.sh
npm pack --silent ./dist/npm
```
Expected: PASS.

**Step 2: Commit any final fixes**

If verification exposed issues, make the minimal fix and commit it.

**Step 3: Create the patch tag**

Using the latest existing tag `v0.1.5`, create:

```bash
git tag v0.1.6
git push origin main
git push origin v0.1.6
```

Expected: the pushed `v0.1.6` tag kicks off the updated publish workflow.
