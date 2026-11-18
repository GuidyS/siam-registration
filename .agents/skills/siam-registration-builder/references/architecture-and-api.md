# Suggested architecture, data and API contracts

This is a suggested blueprint, not a mandate to replace existing infrastructure. Inspect current code first.

## System

React client -> authenticated REST API (PHP/PDO/MySQL) -> services (AI retrieval, ticket, queue, conversation) -> DB. Authenticated WebSocket/SSE sends events; REST stores writes and provides canonical reads and replay. WebSocket server may be a separate process if PHP hosting requires it.

## Tables (minimal fields; refine with migrations)

- `users(id, university_user_id, display_name, role, password_hash_or_sso_id, created_at)` — never store plaintext passwords.
- `conversations(id, student_id, mode, assigned_staff_id, status, created_at, updated_at)`.
- `messages(id, conversation_id, sender_id, sender_role, body, created_at, client_message_id)` with idempotent `client_message_id` unique per sender/conversation.
- `tickets(id, student_id, conversation_id, category, subject, description, status, assigned_staff_id, assigned_teacher_id, created_at, updated_at)`.
- `queue_entries(id, ticket_id_nullable, conversation_id, student_id, queue_date, queue_number, status, assigned_staff_id, created_at, called_at, started_at, ended_at)` unique `(queue_date,queue_number)`; optionally enforce only one active waiting entry per student.
- `knowledge_documents(id, title, source_url, effective_from, effective_to, approved_by, approval_status, revision, updated_at)`.
- `knowledge_chunks(id, document_id, content, retrieval_key_or_embedding_ref)`.
- `audit_logs(id, actor_id, action, entity_type, entity_id, created_at, metadata_json)`; store minimal safe metadata.

Indexes: `(student_id, created_at)`, `(status, created_at)`, `(conversation_id, created_at, id)`; unique idempotency key and queue sequence constraints. Use utf8mb4. Store timestamps in UTC; format to Asia/Bangkok in UI.

## Endpoint sketches

- `GET /api/me` — authenticated user identity and role.
- `POST /api/ai/chat` `{conversationId?, message, clientMessageId}` -> persisted message and evidence-backed answer or escalation suggestion.
- `GET /api/conversations/:id/messages?cursor=...` — authorized message history.
- `POST /api/tickets` `{conversationId, subject, description, category}` -> created ticket with ID.
- `GET /api/tickets` and `GET /api/tickets/:id` — scope by identity/authorization.
- `POST /api/queue` `{conversationId}` -> queue entry; idempotency required.
- `GET /api/queue/me` -> queue status, rank/position if known; avoid fabricated ETAs.
- `DELETE /api/queue/:id` -> cancel own waiting entry.
- `GET /api/staff/queue` -> allowed entries.
- `POST /api/staff/queue/:id/claim` -> one atomic staff assignment, HTTP 409 on conflict.
- `POST /api/conversations/:id/messages` `{body, clientMessageId}` -> saved message, then event fanout.
- `POST /api/staff/tickets/:id/assign` / `resolve` -> auditable changes.
- `GET/POST/PATCH /api/admin/knowledge` -> only admin role; version and approve sources.

API shape can be adapted; avoid returning student personal data to anonymous clients. Prefer CSRF protection for cookie sessions; validate user-generated content server-side.

## Real-time event contract

- `queue.updated {queueId, status, position?, version}`
- `conversation.message.created {conversationId, messageId, senderRole, createdAt}`
- `conversation.mode.changed {conversationId, mode}`
- `ticket.updated {ticketId, status, updatedAt}`

Authorize subscriptions. On reconnect, re-fetch canonical state and missed messages by cursor rather than assuming every event arrived.

## Queue transaction sketch

In a DB transaction: verify student not already queued; allocate daily queue number using locked sequence row (not MAX+1), create waiting queue entry; commit; then publish change. Claim queue with conditional update `WHERE status='waiting'` and verify one row changed; optionally select oldest unclaimed entry with `FOR UPDATE` and skip locked if supported. Avoid lost updates and duplicate claims.

## AI / retrieval adapter

Use an interface `answer(question, userContext) -> {answer, citations, confidenceStatus, needsHandoff}`. Production adapter retrieves only currently approved, in-force policies. Local mock adapter must be clearly marked and never imitate verified university regulations. Never pass other students' records to AI.
