# Product requirements and user flows

## Roles

| Role | Permissions |
|---|---|
| Student | Authenticate, ask AI, view own history, submit ticket, enter/cancel own queue, send/receive live messages, review own status |
| Staff | View authorized queue/tickets, claim one queue, participate in assigned chats, transfer, reply, resolve |
| Supervising teacher | View/respond to cases explicitly assigned or escalated, return guidance to staff |
| Admin | Configure staff, approved knowledge sources and university-defined hours, supervise reporting and audit |

## Pages/routes (adapt to existing router)

- `/login` (or existing university SSO): user authentication and role assignment.
- `/chat`: student AI conversation, suggested quick questions, reference links, escalation action.
- `/queue`: request/cancel live support queue, position, called state, active chat entry.
- `/tickets`: own ticket list and detail, timestamps, statuses.
- `/staff`: service overview (pending, active, resolved counts; do not invent metrics).
- `/staff/queue`: queue desk, atomic claim and calls, transfer, resolve.
- `/staff/live-chat/:conversationId`: two-way messaging, student context, staff actions.
- `/staff/tickets/:id`: ticket details, assigned staff/teacher, response and resolution.
- `/admin/knowledge`: upload/approve/revoke FAQ and policy entries with effective dates and source information.

## Student flow

1. Sign in and open the web assistant.
2. Ask add/drop question. RAG retrieves only approved applicable knowledge, cites source and validity dates.
3. If verified answer absent or issue is account-specific: AI clearly acknowledges limits, offers `Create ticket` or `Live staff chat`.
4. Ticket includes question, relevant context with consent/appropriate minimization, status and tracking ID; student can return later to inspect it.
5. Queue assigns unique ID, shows current position + notification when called. Queue is for **live chat**, not a course-registration queue.
6. Staff claims queue; student enters live chat, AI yields control. Both see the same messages.
7. Staff may escalate to teacher or other team; student sees status. Staff resolves case and confirms response delivered; student can leave feedback.

## Status models

- Queue: `waiting -> called -> active -> completed`; `waiting/called -> canceled`; `active -> transferred -> active` when another staff member takes over. Implement timeout/no-show per approved policy; never silently delete pending cases.
- Ticket: `open -> assigned -> in_progress -> waiting_student/waiting_teacher -> resolved -> closed`; allow `reopened` per policy.
- Conversation mode: `ai | waiting_staff | human | closed`.

## AI response rules

- Allowed: where to find official add/drop calendar, documented steps, prerequisites (only from approved docs), escalation, troubleshooting.
- Disallowed without a verified integration: claims about individual registration outcome, automatic add/drop actions, payment details, or promises of approval.
- If RAG returns no approved evidence: say "ตอนนี้ยังไม่มีข้อมูลที่ยืนยันได้ในระบบครับ ต้องการส่งคำถามให้เจ้าหน้าที่ตรวจสอบไหมครับ".
- Make handoff explicit: "ส่งเรื่องให้เจ้าหน้าที่แล้ว หมายเลขคำร้อง ..." only after the server returns a created ticket ID.

## Out of scope for MVP

Actual student enrollment edits; payment/grade features; LINE integrations; push notifications that require unsupported browser permission; automated teacher decisions.
