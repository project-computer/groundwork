---
name: component-testing
description: Component and screenshot testing for the React app with Vitest Browser Mode (Playwright/Chromium). Use when writing component tests, adding visual regression tests, updating snapshots, or debugging failing tests in apps/clinic.
---

# Component & Screenshot Testing (apps/clinic)

Two Vitest projects are defined in `apps/clinic/vitest.config.ts`:

| Project   | Environment          | File patterns                                          | Purpose                        |
| --------- | -------------------- | ------------------------------------------------------ | ------------------------------ |
| `unit`    | jsdom (fast, no GPU) | `src/**/*.{test,spec}.{ts,tsx}`                        | Logic + full-app DOM tests     |
| `browser` | real Chromium        | `src/**/*.{component,screenshot}.test.{ts,tsx}`        | Component behavior + visual QA |

`*.component.test.tsx` = behavior/interaction tests. `*.screenshot.test.tsx` = visual
regression via PNG baselines. Both run in Chromium.

## Running tests

```bash
cd apps/clinic

pnpm test                     # everything (unit + component + screenshot)
pnpm test:unit                # jsdom only, fast feedback
pnpm test:component           # browser component tests only
pnpm test:screenshot          # visual regression only
pnpm test:screenshot:update   # regenerate baselines after an intentional UI change
pnpm test:browser             # component + screenshot

# single file
npx vitest run src/components/ui/switch.component.test.tsx
```

From the repo root: `pnpm test:ts` runs every workspace's tests.

## Writing a component test (browser project)

- File **must** be `*.component.test.tsx`, otherwise it runs in jsdom where locators fail.
- Import `"@/index.css"` so Tailwind classes are applied — without it, elements sized only
  by utility classes can be 0×0 and Playwright reports "element is not visible".
- `render` from `vitest-browser-react` is **async** in v2+: always `await render(...)`.
- Use locators (`getByRole`, `getByLabelText`, `getByTestId`) and interactions
  (`click`, `fill`, `selectOptions`) rather than manual DOM events.

```tsx
import "@/index.css";
import { expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { Switch } from "@/components/ui/switch";

it("toggles when clicked", async () => {
  const screen = await render(<Switch aria-label="Reminders" />);
  const toggle = screen.getByRole("switch", { name: "Reminders" });

  await expect.element(toggle).toHaveAttribute("aria-checked", "false");
  await toggle.click();
  await expect.element(toggle).toHaveAttribute("aria-checked", "true");
});
```

Prefer role/label queries; fall back to `getByTestId` for layout wrappers.

## Writing a screenshot test (browser project)

- File **must** be `*.screenshot.test.tsx`.
- Wrap the subject in `<div className="bg-background p-8">` so theme variables resolve.
- Use the built-in `toMatchScreenshot` matcher — no custom snapshot helper needed.

```tsx
import "@/index.css";
import { expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { Button } from "@/components/ui/button";

it("Button variants", async () => {
  const screen = await render(
    <div className="bg-background p-8">
      <div className="flex gap-4" data-testid="variants">
        <Button>Save visit</Button>
        <Button variant="outline">Cancel</Button>
      </div>
    </div>,
  );
  await expect.element(screen.getByTestId("variants")).toMatchScreenshot("button-variants.png");
});
```

- Baselines live in `src/**/__screenshots__/<test-file>/<name>-chromium-linux.png`.
  **Commit baselines**; `.gitignore` excludes only `*-diff-*` / `*-failed-*` artifacts.
- Dark theme: add `document.documentElement.classList.add("dark")` before render and remove
  it after (see `button.screenshot.test.tsx`).
- Use `page.viewport(width, height)` (from `vitest/browser`) to test responsive layouts.
- Optional tolerance: `toMatchScreenshot("name.png", { comparatorOptions: { allowedMismatchedPixelRatio: 0.01 } })`.

## Troubleshooting

- **"No projects matched the filter"** — both projects need `extends: true`; project names
  are `unit` and `browser`.
- **"Browser Mode was enabled, but provider was not specified"** — Vitest 5 requires
  `import { playwright } from "@vitest/browser-playwright"` and `provider: playwright()`.
- **"Cannot read properties of null (reading 'useRef')"** — duplicate React copies from
  optimized deps. Keep `resolve.dedupe: ["react", "react-dom"]` and the `optimizeDeps.include`
  list in `vitest.config.ts`.
- **"element is not visible"** — missing `import "@/index.css"` in the test, or the element
  is intentionally hidden; use `click({ force: true })` only as a last resort.
- **Failed to resolve `@/...`** — the `browser` project carries its own `alias`; add new
  aliases there as well as at the root.
- **Snapshot diff after unrelated change** — usually font/Chromium version drift;
  re-baseline with `pnpm test:screenshot:update` and review the diff before committing.
- Playwright browsers: `npx playwright install chromium` (already cached in
  `~/.cache/ms-playwright` on this machine).
