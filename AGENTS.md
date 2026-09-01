# Bodymakers working rules

Before work, confirm the correct repository, branch, and origin. Do not rely on a fixed OS path. Read `docs/MASTER_PLAN.md`, `docs/CURRENT_STATE.md`, and `docs/DECISIONS.md` every time.

- Read only files needed for the task. Preserve existing features, routes, and `bodymakers:data:v1` localStorage compatibility.
- Do not perform unrelated refactors or change OS, PATH, Node, WSL, Git authentication, or line endings globally.
- Never use `git reset --hard` or force push.
- Before commit, run `npm run typecheck`, `npm test`, `npm run build`, `npm run check:links`, and `git diff --check`; every command must exit 0. Fix code-caused failures at most three times.
- Codex is responsible through commit and `origin/main` push. GitHub Actions is responsible for production deployment and production verification.
- Never run `wrangler login` or deploy from Codex/local. Do not create Workers or Pages projects. Stop after the requested work is complete.
