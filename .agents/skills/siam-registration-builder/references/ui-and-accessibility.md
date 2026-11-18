# UI and accessibility guide

## Identity

University-service visual language: navy `#153D6D`, white `#FFFFFF`, warm neutral canvas `#F4F7FB`, dark text `#15263E`, calm accent `#EAF1FB`, success `#126B47`. These are suggested tokens, not an official university brand guide. Support light/dark modes explicitly with role-based semantic tokens.

## Screens

- Student desktop: slim navigation, clear assistant header, main chat transcript and sticky composer; queue/ticket panels remain easy to access.
- Student mobile: compact header, tabs or accessible drawer, full-width chat, composer above mobile keyboard; no sideways scrolling.
- Staff desktop: service stats, inbox/queue list, focused live chat console with student info and action buttons; do not hide an active chat behind a dashboard widget.
- Staff mobile: queue and tickets remain usable; chat input stays visible.
- Use Thai labels such as `ถาม AI`, `รับคิวเจ้าหน้าที่`, `คำร้องของฉัน`, `เรียกคิว`, `ส่งต่ออาจารย์`, `ปิดงาน`.

## Critical regression: unreadable staff Live Chat

This previously occurred in a preview. Treat it as a blocking issue.

- All message text must have explicit high-contrast foreground on **opaque** message backgrounds in both light and dark themes.
- Example light styles: student bubble background `#D6E8FF` with text `#15263E`; staff bubble background `#D8F3E5` with text `#15263E`; AI bubble background white with text `#15263E`; names `#173B68`.
- Do not rely on inherited foreground, transparency, opacity under 1, mix-blend-mode or disabled styling for messages.
- Use semantic CSS/Tailwind tokens and verify with actual computed styles in browser. Aim for WCAG AA contrast (4.5:1 normal text, 3:1 large text).
- Input text, placeholder, disabled state, focus ring and read receipts are separate styles. Placeholder may be muted, **input text must not be muted**.
- Use `overflow-wrap:anywhere`, `white-space:pre-wrap`, readable line height (>=1.45), and 14–16px body for chats when space permits.
- Student vs staff messages must be visibly distinct by alignment + label + color, not color alone.
- Test long Thai messages, emoji, newlines, empty state, and dark mode.

## Accessible interaction

- Labels for text inputs and icon-only actions. Enter sends, Shift+Enter adds newline in multiline composer.
- Live messages use an appropriate polite live region for newly incoming messages without re-announcing the full history.
- Visible keyboard focus, usable touch targets, screen-reader status announcements when called or transferred.
- Never show a meaningless progress percentage for queue position; show actual number of people ahead if computable, and label uncertain ETA honestly.
- Loading and failed delivery should be obvious; offer retry without duplicating messages.
- No fake 'online' badges when backend/transport is not actually online. Clearly mark prototypes/demo.

## Copy tone / humanize

Friendly, short, service-oriented Thai. Avoid overpromising: `กำลังส่งเรื่องให้เจ้าหน้าที่...` while pending; `ส่งเรื่องแล้ว เลขที่ T-...` only after persisted. For uncertain policies: `ตอนนี้ยังไม่มีข้อมูลยืนยันจากสำนักทะเบียนครับ` with next action.
