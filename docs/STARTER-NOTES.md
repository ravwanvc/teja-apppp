# Infrastructure notes

Old connector preview and unused UI examples were removed. `worker/index.ts` now calls the vinext handler directly and handles scheduled expiry/reminders/deletion cleanup. Local Windows startup and D1 migration helpers remain. Use npm/package-lock.json; the old pnpm lock is archived outside the deliverable because its dependency graph is stale.
