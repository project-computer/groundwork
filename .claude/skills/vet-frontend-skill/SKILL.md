---
name: vet-frontend-skill
description: Use when working on VET frontend (React client in client/ directory). Feature-first React architecture using Tailwind + shadcn. Covers component patterns, feature boundaries, state ownership, testing, routing, and migration from @radix-ui/themes.
---

# VET Frontend Development

## Core Philosophy

Architecture goal is NOT:
> "perfect structure"

Architecture goal IS:
> "easy to change safely"

Priorities:
- fast iteration
- delete-friendly code
- low mental overhead
- clear ownership
- minimal abstraction
- scalable enough without enterprise complexity

Good architecture allows:
- deleting a feature folder safely
- replacing implementation with minimal ripple effects
- onboarding developers quickly
- moving fast without spaghetti

---

# Project Structure

```txt
client/src/
├── app/                    # bootstrap/providers/router
├── pages/                  # route composition layer
├── features/               # business capability modules
├── shared/                 # reusable non-business code
├── styles/
└── main.tsx
```

Example:

```txt
client/src/
├── app/
│
├── pages/
│   ├── login/
│   ├── dashboard/
│   └── course/
│
├── features/
│   ├── auth/
│   ├── classroom/
│   ├── quiz/
│   ├── course/
│   └── payment/
│
├── shared/
│   ├── ui/
│   ├── hooks/
│   ├── lib/
│   ├── utils/
│   ├── types/
│   └── config/
│
└── styles/
```

---

# Layer Responsibility

| Layer | Responsibility | Cannot Do |
|---|---|---|
| app | bootstrap/providers/router | business implementation |
| pages | route composition/layout | deep business logic |
| features | business capability | depend on other features directly |
| shared | generic reusable code | know business domain |

---

# Import Direction

```txt
shared -> feature  ❌
feature -> shared  ✅
feature -> feature ⚠️ avoid
pages -> feature   ✅
```

Feature-to-feature imports create tight coupling and spaghetti.

Compose multiple features together at the page layer instead.

BAD:
```ts
features/quiz imports features/course
```

GOOD:
```ts
pages/course compose both features together
```

---

# Shared Rule

Before putting something into `shared`, ask:

> "Can another feature realistically reuse this?"

If NOT:
→ keep it inside the feature.

Avoid turning `shared/` into a trash can.

---

# Feature Structure

Each feature owns:
- api
- components
- hooks
- store
- schemas
- types
- utils
- forms
- tests

Example:

```txt
features/quiz/
├── api/
│   ├── get-quiz.ts
│   └── submit-quiz.ts
│
├── components/
│   ├── quiz-card.tsx
│   ├── quiz-result.tsx
│   └── quiz-timer.tsx
│
├── hooks/
│   └── use-quiz-session.ts
│
├── forms/
│   └── quiz-answer-form.tsx
│
├── store/
│   └── quiz.store.ts
│
├── schemas/
│   └── quiz.schema.ts
│
├── utils/
│   └── calculate-score.ts
│
├── types/
│   └── quiz.ts
│
├── tests/
│
└── index.ts
```

---

# Feature Public API

Every feature exposes a public API through `index.ts`.

Example:

```ts
export { QuizCard } from "./components/quiz-card";
export { useQuizSession } from "./hooks/use-quiz-session";
```

Import ONLY from:

```ts
@/features/quiz
```

Avoid:

```ts
@/features/quiz/components/quiz-card
```

Benefits:
- safer refactor
- hidden internals
- easier rewrites
- clearer ownership

---

# State Strategy

## Server State

Use Apollo / TanStack Query for:
- fetched data
- caching
- loading state
- synchronization

Examples:
- course data
- quiz data
- profile data

DO NOT store server state in Zustand.

---

## Client State

Use Zustand for:
- UI state
- temporary interaction state
- cross-component coordination

Examples:
- sidebar open
- modal state
- filters
- draft state

Keep state close to the feature.

Avoid giant global stores.

Good globals:
- auth user
- theme
- locale
- notifications

Everything else:
→ feature-local.

---

# API Strategy

API logic belongs INSIDE the feature.

GOOD:

```txt
features/quiz/api/get-quiz.ts
```

BAD:

```txt
shared/api/quiz.ts
shared/api/course.ts
```

Benefits:
- ownership clarity
- easier deletion
- better isolation

---

# Component Strategy

Only 3 levels.

---

## 1. Shared UI

Pure reusable UI.

```tsx
<Button />
<Input />
<Card />
```

Rules:
- no business logic
- no auth knowledge
- no quiz knowledge

GOOD:

```tsx
<Button variant="default" />
```

BAD:

```tsx
<QuizSubmitButton />
```

---

## 2. Feature Components

Business-aware UI.

```tsx
<QuizCard />
<CourseSidebar />
<LoginForm />
```

---

## 3. Page Composition

Route-level assembly.

```tsx
<CoursePage />
```

Pages compose features together.

Pages should:
- handle layouts
- route params
- feature composition

Pages should NOT:
- contain deep business logic
- become giant components

---

# Component Convention

Prefer one component per file.

GOOD:

```txt
quiz-card.tsx
```

BAD:

```txt
index.tsx everywhere
```

Naming:
- PascalCase component
- kebab-case filename

Example:

```tsx
QuizCard -> quiz-card.tsx
```

---

# Hooks Rules

Hooks should:
- encapsulate behavior
- avoid rendering JSX
- expose stable API
- avoid hidden side effects

GOOD:

```ts
useQuizSession()
```

BAD:
- hooks that navigate automatically
- hooks rendering UI
- hooks with hidden mutations

---

# Form Strategy

Forms live INSIDE features.

Example:

```txt
features/auth/
├── forms/
├── schemas/
└── api/
```

Preferred stack:
- react-hook-form
- zod

Schema is source of truth.

---

# Shared Structure

Shared = generic reusable things.

NOT business logic.

---

## shared/ui/

Reusable dumb UI components.

```txt
shared/ui/
├── button.tsx
├── input.tsx
├── card.tsx
├── modal.tsx
└── table.tsx
```

---

## shared/hooks/

Generic reusable hooks only.

GOOD:

```ts
useDebounce()
useMediaQuery()
useLocalStorage()
```

BAD:

```ts
useQuizSubmission()
```

---

## shared/lib/

Third-party setup/configuration.

```txt
shared/lib/
├── apollo.ts
├── query-client.ts
├── dayjs.ts
├── zod.ts
└── env.ts
```

---

## shared/utils/

Pure utility functions.

```txt
shared/utils/
├── cn.ts
├── format-date.ts
├── currency.ts
└── sleep.ts
```

---

# Styling Rules

## Target Stack

- Tailwind CSS
- shadcn/ui
- native semantic HTML

Avoid:
- @radix-ui/themes
- heavy custom CSS
- inline styles
- arbitrary Tailwind spam

---

# Migration: @radix-ui/themes → shadcn

Core principle:
> Use native HTML + Tailwind.

| Radix | Replacement |
|---|---|
| `<Box>` | `<div>` |
| `<Flex>` | `<div className="flex">` |
| `<Heading>` | semantic `h1-h6` |
| `<Text>` | semantic `p/span` |
| `<Card>` | shadcn `Card` |
| `<Badge>` | shadcn `Badge` |
| `<Separator>` | shadcn `Separator` |
| `<Skeleton>` | shadcn `Skeleton` |

Examples:

```tsx
<Flex direction="column" gap="4">
```

↓

```tsx
<div className="flex flex-col gap-4">
```

---

# shadcn Components

Import ONLY from:

```ts
@/shared/ui/*
```

Example:

```tsx
import { Button } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
```

Do NOT duplicate existing shadcn components.

---

# Performance Guidelines

Avoid premature optimization.

Prefer:
- simple components
- local state
- readable code

Optimize ONLY when:
- rerenders measurable
- expensive lists exist
- visible lag appears

Avoid:
- wrapping everything in useMemo/useCallback
- premature memoization
- complex optimization patterns early

---

# Testing Strategy

## Unit Test

Test:
- hooks
- utils
- pure business logic

Avoid:
- implementation detail tests
- snapshot spam

---

## Component Test

Test:
- rendering behavior
- user interaction
- loading/error states

---

## E2E Test

Only test critical flows.

Examples:
- login
- payment
- quiz submission
- enrollment

Avoid excessive E2E coverage.

---

# Error Handling

Handle errors near feature boundaries.

Prefer:
- typed errors
- local fallback UI
- recoverable toast feedback

Avoid:
- giant global try/catch
- swallowing errors silently

---

# Async Naming Convention

Use verb-based naming.

GOOD:

```ts
getQuiz()
submitQuiz()
updateProfile()
deleteCourse()
```

BAD:

```ts
quizManager()
processHandler()
dataService()
```

---

# Import Order

```ts
// 1. external libraries
import { useQuery } from "@tanstack/react-query";

// 2. shared
import { Button } from "@/shared/ui/button";

// 3. feature/local
import { getQuiz } from "../api/get-quiz";

// 4. types
import type { Quiz } from "../types/quiz";
```

---

# Optimization Rule

Prefer duplication over premature abstraction.

Rule:
- once → duplicate
- twice → maybe extract
- three times → shared candidate

Do NOT abstract future possibilities.

---

# Function Style

Always use arrow functions.

GOOD:

```ts
const getQuiz = () => {
  // ...
}

const QuizCard = () => {
  return <div />
}
```

BAD:

```ts
function getQuiz() {
  // ...
}

function QuizCard() {
  return <div />
}
```

Applies to:
- components
- hooks
- utils
- handlers
- callbacks

---

# Tech Stack

- React 18+
- TypeScript
- React Router v7
- Tailwind CSS
- shadcn/ui
- Apollo Client
- TanStack Query
- Zustand
- Vitest
- Playwright
- Phosphor Icons

---

# Commands

```bash
pnpm dev
pnpm build
pnpm lint
pnpm test
```

Add shadcn component:

```bash
pnpm dlx shadcn@latest add button
```

Check migration progress:

```bash
grep -r "@radix-ui/themes" src/ | wc -l
```

Should return:

```bash
0
```

---

# Common Pitfalls

| Pitfall | Why Bad |
|---|---|
| feature importing feature | tight coupling |
| giant shared folder | becomes trash can |
| business logic in shared/ui | breaks separation |
| storing server state in Zustand | cache inconsistency |
| premature abstraction | slows development |
| deep relative imports | poor maintainability |
| excessive memoization | complexity without gain |
| giant pages | hard to maintain |

---

# Avoid Early

- massive global `components/`
- giant root `utils/`
- enterprise patterns
- factory managers
- over-layered architecture
- magic abstractions

You do NOT need:
```txt
BaseRepositoryFactoryManager
```

---

# Migration Checklist

- [ ] remove `@radix-ui/themes`
- [ ] replace `<Box>` with semantic HTML
- [ ] replace `<Flex>` with Tailwind flex
- [ ] replace `<Heading>` with semantic headings
- [ ] replace `<Text>` with semantic text tags
- [ ] move reusable UI into `shared/ui`
- [ ] remove Theme wrappers if unnecessary
- [ ] use `@/` aliases
- [ ] expose feature public APIs via `index.ts`
- [ ] keep business logic inside features
