---
name: "Siam Registration Assistant v2"
description: "A clear, restrained university service interface for add/drop support."
colors:
  ink: "#192d3d"
  muted: "#526777"
  navy: "#183b56"
  navy-dark: "#102e46"
  line: "#d4dde0"
  line-strong: "#b9c8ce"
  canvas: "#f4f6f5"
  paper: "#ffffff"
  rail: "#edf2f2"
  focus: "#b45b27"
typography:
  body:
    fontFamily: "Noto Sans Thai, Segoe UI, Tahoma, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.65
  title:
    fontFamily: "Noto Sans Thai, Segoe UI, Tahoma, sans-serif"
    fontSize: "20px"
    fontWeight: 750
    lineHeight: 1.25
  label:
    fontFamily: "Noto Sans Thai, Segoe UI, Tahoma, sans-serif"
    fontSize: "12px"
    fontWeight: 700
rounded:
  control: "6px"
  surface: "8px"
spacing:
  tight: "8px"
  regular: "16px"
  section: "32px"
components:
  button-primary:
    backgroundColor: "{colors.navy}"
    textColor: "{colors.paper}"
    rounded: "{rounded.control}"
    padding: "9px 15px"
  button-secondary:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.navy}"
    rounded: "{rounded.control}"
    padding: "9px 15px"
---

# Design System: Siam Registration Assistant v2

## Overview

**Creative North Star: “The Quiet Registrar Desk.”** The screen should feel like an orderly service counter: clear labels, dependable spacing, and immediate feedback. The interface stays behind the student's task. The university blue identifies actions and the current location; it does not decorate every surface.

## Colors

Use navy for primary actions and selected navigation. Ink carries body copy. The rail and canvas create a quiet distinction between navigation, work area, and composer. Use the focus color only for keyboard focus.

**The One Accent Rule.** A saturated color must communicate an action, selection, or state.

## Typography

Use one Thai-capable sans stack throughout. Titles are compact and confident; body copy is readable at a working distance. IDs and timestamps use tabular numerals.

## Layout

Desktop uses a fixed navigation rail and a flexible work area. On narrow screens, navigation becomes a horizontal row above the task. Chat controls remain attached to the bottom of the work area; messages scroll independently.

## Elevation & Depth

Use tonal surfaces and single-pixel rules. Avoid ambient shadows and floating cards in ordinary work states.

## Shapes

Controls have small, consistent corners. Messages and inline forms use slightly softer corners. Small status labels are rectangular rather than oversized pills.

## Components

Primary buttons are filled navy. Secondary buttons are paper with a clear outline. Quick questions share one treatment; the add/drop action has a restrained selected state. Course results and tickets use rows so they scan as records.

## Do's and Don'ts

- Do label every simulated answer and registration action as demo data.
- Do keep chat, queue, ticket, and staff states visible in plain language.
- Do make focus, disabled, error, and empty states readable.
- Don't add decorative gradients, fake metrics, emoji icons, or nested cards.
