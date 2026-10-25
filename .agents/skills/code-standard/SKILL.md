---
name: code-standard
description: VetCare code style standards, starting with the arrow function rule — declare functions as arrow function expressions, not function declarations. Use when writing, reviewing, or refactoring TypeScript/JavaScript in this repo, or when the user asks about code style, conventions, or formatting.
---

# Code Standard — VetCare

Apply these rules when writing or reviewing any TypeScript/JavaScript in this
repo. They override personal or library defaults.

## Arrow functions

**All functions are declared as arrow function expressions**, assigned to
`const`. Never use `function` declarations or methods defined with shorthand
syntax where a plain callback works.

```ts
// ✅ Correct
const calculateNextDueDate = (protocol: VaccineProtocol): Date => {
  return addDays(protocol.startDate, protocol.intervalDays)
}

const getActiveLots = (item: InventoryItem) =>
  item.lots.filter((lot) => lot.status === 'active')
```

```ts
// ❌ Wrong
function calculateNextDueDate(protocol: VaccineProtocol): Date { ... }

export default function PatientSearch() { ... }
```

Details:

- **Named exports with arrows**: `export const createVisit = (...) => ...`.
  Prefer explicit `export const` over `export default`.
- **Parameters**: always wrap in parentheses, even for a single param —
  `(owner) => ...`, not `owner => ...`.
- **Return style**: use an expression body (`=> x + 1`) when it fits on one
  line; use a block body with an explicit `return` otherwise.
- **`this`**: arrow functions already capture lexical `this` — do not add
  `.bind(this)` or `const self = this` workarounds.
- **Exception — React components**: still arrow functions
  (`const PatientCard = (props: PatientCardProps) => ...`), typed with explicit
  prop types. Do not use `React.FC`.
- **Exception — object/class methods**: method shorthand in interfaces, types,
  and class bodies is fine (`{ applyDiscount(order: Order): Money }`); the rule
  targets standalone function declarations.
- **Hoisting**: because arrow functions are not hoisted, define before use in
  module order; do not rely on calling a function earlier in the file.

## Applies to all code

These rules are **universal** — no file, directory, or package is exempt:

- **New code**: written to this standard from the first keystroke.
- **Existing code**: when you touch a file for any reason, convert every
  violation in it to the standard in the same change (opportunistic
  modernisation). Do not leave a file half-migrated.
- **Generated/vendor code**: only files that we cannot edit (lockfiles, build
  output, third-party patches) are exempt.
- **Tests, scripts, and config** follow the same rules as app code.
- A codebase-wide migration to the current standard must be run whenever a new
  rule is added, so the whole repo stays aligned — never allow two eras of
  style to coexist.

When reviewing diffs, flag any `function` declaration that can be converted,
and convert it while in the file — do not leave mixed styles.

## Extending

This file is the canonical style reference. New rules (naming, imports, error
handling) get appended here as sections, following the same
rule → ✅/❌ example format.
