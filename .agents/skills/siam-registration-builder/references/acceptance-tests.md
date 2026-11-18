# Acceptance and regression tests

Use existing framework (Vitest/React Testing Library/Playwright, PHPunit or existing tests) rather than installing a new stack unnecessarily. Automated tests are preferred for critical behavior.

## Student assistant

- First visit shows greeting and quick questions; desktop/mobile controls fit screen.
- Approved add/drop question yields grounded answer with current source reference.
- Unverified deadline or unknown policy does not produce an invented claim; offers handoff.
- Account-specific failure creates exactly one ticket on a repeated submit (idempotency), with server-returned ID and student-visible status.

## Queue

- First join gets queue ID; repeated clicks/retries do not add duplicate entries.
- Two students joining concurrently receive unique numbers.
- Student cannot cancel another student's queue.
- Two staff claiming same queue: exactly one succeeds; loser sees conflict/state refresh.
- Called student is notified; queue position is derived from real records.
- Canceled/completed queue is excluded from pending list without losing audit trail.
- Reconnect/refresh preserves queue and ticket state.

## Live Chat (must pass)

- On staff claim, student conversation moves to `human`; AI must not interject.
- Student sends message -> appears in staff Live Chat (same conversation ID).
- Staff sends reply -> appears in student chat, correct sender and timestamp.
- Refresh either view -> both messages load from the shared server store.
- Escape HTML/script input safely; long Thai text displays without clipping.
- Message body and author remain readable: WCAG AA target, explicit foreground/background, no unwanted opacity. Check both roles, light/dark mode, idle/active states.
- Network failure shows unsent/retry and no false delivery confirmation; reconnection replays missed messages without duplication.

## Ticket and role security

- Assigned staff/teacher can view appropriate ticket and action history; unassigned/unauthorized users cannot.
- A student cannot enumerate peers' ticket IDs, private message history or queue details.
- Transfer and resolve actions are audited and reflected on student screen.
- API enforces access regardless of hidden/disabled frontend buttons.
- Rate limiting, input validation, CSRF/cookie security as applicable.

## Report in final implementation summary

Describe actual tests executed, pass/fail, any skipped tests, required environment secrets (names only), and what remains a mock. Never claim production readiness from a browser-only prototype.
