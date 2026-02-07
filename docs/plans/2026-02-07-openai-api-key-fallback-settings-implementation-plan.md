# OpenAI API Key Fallback + Settings Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** If `OPENAI_API_KEY` is not set, allow the user to paste an OpenAI API key in the TUI, persist it in an app config file, and provide a Settings screen to clear the stored key and revert to env-based auth.

**Architecture:** Add a small config module that reads/writes `config.json` under an OS-appropriate config directory. Resolve key precedence as `env > stored > none`. When launching the Engineer chat after a download, prompt for a key if none is available. Add Settings (`s`) to view key status and clear the stored key.

**Tech Stack:** TypeScript, Ink, `ink-text-input`, `ink-select-input`, Vitest.

---

### Task 1: Add Config Dir Helper (XDG / APPDATA)

**Files:**
- Modify: `src/core/xdg.ts`
- Modify: `src/core/xdg.test.ts`

**Step 1: Write failing tests**

Add tests for `getConfigDir(appName)`:
- On unix: uses `XDG_CONFIG_HOME/<app>/` when set.
- On unix: falls back to `~/.config/<app>/` when `XDG_CONFIG_HOME` is missing.
- On win32: uses `%APPDATA%\\<app>` (skip on non-win like existing tests).

**Step 2: Run test to verify it fails**

Run:
```bash
npm test -- src/core/xdg.test.ts
```
Expected: FAIL with `getConfigDir is not a function` (or similar).

**Step 3: Implement minimal `getConfigDir`**

Add `export function getConfigDir(appName: string): string` to `src/core/xdg.ts` with XDG_CONFIG_HOME / ~/.config behavior on unix and APPDATA on Windows.

**Step 4: Run test to verify it passes**

Run:
```bash
npm test -- src/core/xdg.test.ts
```
Expected: PASS.

**Step 5: Commit**

```bash
git add src/core/xdg.ts src/core/xdg.test.ts
git commit -m "feat: add config dir helper"
```

---

### Task 2: Persist Stored OpenAI Key In App Config

**Files:**
- Create: `src/core/config.ts`
- Create: `src/core/config.test.ts`

**Step 1: Write failing test**

Create `src/core/config.test.ts` verifying:
- `readAppConfig()` returns `{}` when config file is missing.
- `writeOpenAIApiKey()` persists a trimmed key, and `readAppConfig()` returns it.
- `clearStoredOpenAIApiKey()` removes the key and deletes the file when empty.

**Step 2: Run test to verify it fails**

Run:
```bash
npm test -- src/core/config.test.ts
```
Expected: FAIL (module not found).

**Step 3: Implement minimal config module**

Create `src/core/config.ts`:
- `readAppConfig(appName)`
- `writeOpenAIApiKey(appName, apiKey)`
- `clearStoredOpenAIApiKey(appName)`
- `getAppConfigPath(appName)` (for UI copy)

Use `getConfigDir()` and store plaintext JSON at `<configDir>/config.json`. Best-effort restrictive perms (`0700` dir, `0600` file) on unix.

**Step 4: Run test to verify it passes**

Run:
```bash
npm test -- src/core/config.test.ts
```
Expected: PASS.

**Step 5: Commit**

```bash
git add src/core/config.ts src/core/config.test.ts
git commit -m "feat: persist OpenAI API key in app config"
```

---

### Task 3: Add ApiKeyPrompt Screen (Paste Key)

**Files:**
- Create: `src/tui/screens/ApiKeyPrompt.tsx`
- Create: `src/tui/screens/ApiKeyPrompt.test.tsx`

**Step 1: Write failing test**

Create a render test that expects:
- Title text like `OpenAI API Key`
- Copy mentioning env overrides stored key

**Step 2: Run test to verify it fails**

Run:
```bash
npm test -- src/tui/screens/ApiKeyPrompt.test.tsx
```
Expected: FAIL (module not found).

**Step 3: Implement screen**

Implement a masked `TextInput` (`mask="*"`) with:
- `onSubmit` -> calls `onSave(key)`
- UI copy includes `configPath` and “env overrides stored key”.

**Step 4: Run test to verify it passes**

Run:
```bash
npm test -- src/tui/screens/ApiKeyPrompt.test.tsx
```
Expected: PASS.

**Step 5: Commit**

```bash
git add src/tui/screens/ApiKeyPrompt.tsx src/tui/screens/ApiKeyPrompt.test.tsx
git commit -m "feat: add API key paste screen"
```

---

### Task 4: Add Settings Screen (Status + Clear)

**Files:**
- Create: `src/tui/screens/Settings.tsx`
- Create: `src/tui/screens/Settings.test.tsx`

**Step 1: Write failing test**

Render `Settings` with a status prop and expect it to show:
- `Env key: present/absent`
- `Stored key: present/absent`
- `In use: env|stored|none`

**Step 2: Run test to verify it fails**

Run:
```bash
npm test -- src/tui/screens/Settings.test.tsx
```
Expected: FAIL (module not found).

**Step 3: Implement screen**

Use `SelectList` for actions:
- Paste key
- Clear stored key
- Back

**Step 4: Run test to verify it passes**

Run:
```bash
npm test -- src/tui/screens/Settings.test.tsx
```
Expected: PASS.

**Step 5: Commit**

```bash
git add src/tui/screens/Settings.tsx src/tui/screens/Settings.test.tsx
git commit -m "feat: add settings screen for OpenAI key"
```

---

### Task 5: Wire Screens + Key Precedence Into App

**Files:**
- Modify: `src/tui/navigation.ts`
- Modify: `src/tui/components/FooterHints.tsx`
- Modify: `src/app.tsx`

**Step 1: Write failing tests**

Add/update tests to verify:
- `FooterHints` shows `s settings` for non-chat screens.
- App prompts for key when env key missing and stored key missing (see existing `src/app.test.ts` patterns).

**Step 2: Run test to verify it fails**

Run:
```bash
npm test -- src/app.test.ts
```
Expected: FAIL (new behavior not implemented).

**Step 3: Implement wiring**

In `src/app.tsx`:
- Load stored key (into a ref) on startup.
- On download complete: if no env key and no stored key, store pending engineer init in a ref and route to `ApiKeyPrompt`.
- On save: persist key, update status, then either resume engineer init or return to settings.
- Settings hotkey: `s` from non-chat screens (exclude `downloading`, runtime-preparing, `engineer`, `apiKey`).
- Replace `openai(modelId)` with `createOpenAI({ apiKey: effectiveKey })(modelId)` when using stored key.

**Step 4: Run tests**

Run:
```bash
npm test
npm run typecheck
```
Expected: PASS.

**Step 5: Commit**

```bash
git add src/tui/navigation.ts src/tui/components/FooterHints.tsx src/app.tsx
git commit -m "feat: prompt for OpenAI key and allow clearing via settings"
```

