## gstack

Use the `/browse` skill from gstack for all web browsing. Never use `mcp__claude-in-chrome__*` tools.

To install gstack:
```
git clone https://github.com/garrytan/gstack.git ~/.claude/skills/gstack && cd ~/.claude/skills/gstack && ./setup
```

Available gstack skills:
- `/plan-ceo-review` — CEO/founder-mode plan review: rethink the problem, find the 10-star product, challenge premises
- `/plan-eng-review` — Eng manager-mode plan review: architecture, data flow, edge cases, test coverage, performance
- `/review` — Pre-landing PR review: SQL safety, LLM trust boundaries, conditional side effects, structural issues
- `/ship` — Ship workflow: merge main, run tests, review diff, bump VERSION, update CHANGELOG, commit, push, create PR
- `/browse` — Fast web browsing via persistent headless Chromium (~100ms per command after first call)
- `/retro` — Weekly engineering retrospective: commit history, work patterns, code quality metrics
