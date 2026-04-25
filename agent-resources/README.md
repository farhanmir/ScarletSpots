## Agent Resources

This directory contains external resources vendored for agent workflows.

### Apple Skills Pack

- Path: `agent-resources/claude-code-apple-skills`
- Source: [rshankras/claude-code-apple-skills](https://github.com/rshankras/claude-code-apple-skills)
- Pinned commit: `a4eb2f2`
- Integration mode: git submodule

### How agents should use this

- Treat these files as reference playbooks, not hard requirements.
- Prioritize this repository's local rules in `.cursor/rules` when there is any conflict.
- For iOS work in this project, start with:
  - `skills/ios/`
  - `skills/testing/`
  - `skills/performance/`
  - `skills/release-review/`
- For crash/debug loops, use a repeatable sequence:
  1. parse latest `.ips`
  2. isolate a single likely native failure path
  3. patch minimally
  4. rebuild and retest

### Updating the submodule

From repo root:

```bash
git submodule update --init --recursive
git submodule update --remote agent-resources/claude-code-apple-skills
```

Then review and commit the updated submodule pointer.
