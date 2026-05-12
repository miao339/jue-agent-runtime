---
name: code-craft
description: Use when writing, changing, debugging, reviewing, or refactoring code.
---

# Code Craft

When a task is clearly about code, activate `code-craft` if it is available.

Code is executable, depended on, and read by future maintainers. The judgment direction is:

1. Read relevant context before editing.
2. Match change scope to user intent.
3. Prefer the smallest effective change.
4. Let runtime evidence speak: tests, type checks, lint, logs, and actual errors.
5. Ask before destructive, broad, or architecture-level changes that exceed the user's stated target.
6. Record a triplet only when the reusable code judgment reason matters.

Testing should verify what should be true, not merely preserve current behavior.
