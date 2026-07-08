---
name: verify
description: How to boot and drive this app end-to-end for runtime verification (web build + Playwright, mobile and desktop viewports)
---

# Verifying changes in credit-card-manager

The fastest runtime surface is the **web build** — it runs the entire backend
(same tRPC routers as Electron main) in-browser on sql.js + IndexedDB, so
renderer *and* router/domain changes are both observable without launching
Electron and without touching the real production DB the Electron dev build
shares.

## Boot

```bash
npm run dev:web -- --port 5199 --strictPort   # background
# app is served at http://localhost:5199/index.web.html  (NOT /)
```

Routes are hash-based: `#/cards`, `#/people`, `#/recommendations`, etc.

## Drive with Playwright

`playwright-core` + `channel: 'chrome'` works (Chrome is installed; no
browser download needed). Mobile context that matches the iOS app:

```js
browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
```

The app's mobile breakpoint is `sm` (48em); `(pointer: coarse)` matches under
this context, which exercises the touch-specific Select behavior.

## Seeding data

Each Playwright context starts with a fresh IndexedDB. The web entry exposes
the full tRPC bridge — seed through it instead of clicking through forms:

```js
await page.waitForFunction(() => !!window.trpcIpc)
await page.evaluate(async () => {
  const call = (path, input) => window.trpcIpc.request({ type: 'mutation', path, input })
  const p = await call('people.create', { name: 'Drew' })
  await call('cards.create', { rawCreditorName: 'Chase', ownerPersonId: p.id, status: 'open', openedDate: '2024-03-15' })
  localStorage.setItem('ccm.setupDone', '1')   // suppress first-run wizard
})
await page.waitForTimeout(600)  // debounced IndexedDB persist is 300ms
// then page.reload() and navigate
```

## Gotchas

- Card rows are labeled by creditor/product name only (`cardLabel`), not
  `rawAccountLabel` — pick selectors accordingly.
- Tables that stack into cards on mobile keep the `<table>` in the DOM
  (`visibleFrom="sm"`); wait on a visible `.mantine-Card-root` locator, not
  `text=`, or the hidden table cell wins the match.
- Overflow check for "no horizontal scrolling":
  `document.documentElement.scrollWidth === window.innerWidth`.
- `people.create` auto-creates a sole-proprietor business named after the
  person — expect it in `businesses.list`.
