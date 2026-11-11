---
name: Generic JSX compatibility
description: A development-preview instrumentation incompatibility with explicit component type arguments.
---

Avoid explicit type arguments in JSX component openings in this web artifact; let TypeScript infer them from literal-typed props.

**Why:** The preview instrumentation transformed a valid generic `Tabs` opening into malformed JSX by injecting `data-component-name` before its type arguments. TypeScript passed, but the running Vite/Babel server returned a compiler overlay.

**How to apply:** Use inferred generics with literal `id` values typed `as const`. When TypeScript passes but preview compilation fails, inspect the instrumented error and request the affected source module from the running Vite server as a cheap confirmation before repeating a browser flow.
