# OverGarden — Design System / Style Guide

Status: still a stub, but **the rule that used to sit here is void.**

It said no agent may build any UI while this file is empty. That rule was written
before the walking skeleton and is now contradicted by the whole product: public
journals, the composer, the workspace, communities and the operator surfaces all
shipped and run in production. Do not treat this file as a gate.

What actually governs the interface today: shadcn/ui primitives with Tailwind,
Google Sans and Geist Mono through `next/font/google` (`apps/web/src/app/fonts.ts`
plus `globals.css`, no contract and no verifier — ADR-0022 D7), workspace failure
states from ADR-0023, and the rule from ADR-0024 D3 that a control on a public
page may not depend on hydration to act.

A real style guide is still worth writing; until someone writes it, read the
components.
