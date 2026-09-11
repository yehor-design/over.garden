# Linear archive

A snapshot of the OverGarden Linear workspace taken on 2026-09-11, immediately
before the workspace was pruned to fit its plan's issue limit so that SDD Slice
27 (ADR-0029) could be created.

## What is here

| file | contents |
| --- | --- |
| `2026-07.md` | 80 issues completed in July 2026 |
| `2026-08.md` | 90 issues completed in August 2026 |
| `2026-09.md` | 47 issues completed in September 2026 |
| `open-issues.md` | 23 issues still open at snapshot time |
| `2026-07-early-index.md` | index of `OVE-78` … `OVE-158`, plus two bodies in full |

240 issues, `OVE-159` … `OVE-422`.

## What is not here, and why

**`OVE-78` … `OVE-158`** — thirty-five issues completed between 1 and 15 July
2026, the earliest slices, and the first set the owner deleted.
`2026-07-early-index.md` names every one with its branch, so its pull request —
which carries the diff, the review and the merge — is one `gh pr list --head`
away and is permanent. Two are reproduced in full there as a sample of the shape.
The other thirty-three bodies were not copied: at four kilobytes each they would
have taken dozens of round trips to transcribe, and a merged pull request is the
stronger record of what a shipped task actually did.

**Full descriptions.** Linear's list API truncates a long description and says
so inline (`… (truncated, use get_issue for full description)`). Capturing every
body in full would have meant one API call per issue. The opening section — the
Outcome, and usually the start of Scope — survives; the acceptance criteria of
a long task often do not. A shipped task's real acceptance record is its merged
pull request, which is permanent.

**Comments, attachments and relations** are not captured at all.

## Why a snapshot rather than an export

The Linear MCP connector this repository's agents use exposes no tool to delete,
archive or export issues — `save_issue`, `get_issue` and `list_issues` only. The
deletion itself was performed by the owner. This file records what existed
beforehand so the pruning destroyed no history that only Linear held.
