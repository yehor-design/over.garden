# Design-gate fixtures

A check that has never been observed red is indistinguishable from a check that
cannot go red. This repository has paid for that twice: a CI step that ended at
`exit code 1` with no output cost days of guessing, and a release pipeline
refused seventy-eight correct builds for a week because the expectation, not the
build, was wrong.

So every gate in `DESIGN.md` §10 has a file here that violates it on purpose,
and `scripts/check-design-gates.test.ts` runs the real gate over the real
fixture and asserts it fails — with the message a person would read.

The files carry a `.fixture` suffix so `pnpm lint`, `tsc` and `next build` never
see them. Nothing here is imported by the product.
