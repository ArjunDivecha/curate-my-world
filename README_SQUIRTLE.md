# Squirtle (Curate My World) - Deployment Notes

This repo has been through multiple iterations. The current, working deployment path is described in `README.md`.

## Current Live Deployment (Feb 2026)

- Frontend (Vercel): `https://squirtle-eta.vercel.app`
- Backend API (Railway, deployed from the `staging` environment): `https://squirtle-api-staging.up.railway.app`
  - Health: `https://squirtle-api-staging.up.railway.app/api/health`

Backend deploy metadata (confirmed via Railway API for latest successful deployment):
- Repo: `ArjunDivecha/curate-my-world`
- Branch: `main`
- Commit: `32869445547086abab57c06a9468b8f59181aa97`
- Commit message: `Merge branch 'codex/cloud-deploy'`

## Safety Notes

- Railway `production` environment for the `squirtle` project is currently empty. Treat `staging` as production unless you intentionally migrate.
- Avoid Railway UI “Sync/Merge changes from production into staging” unless you fully understand the diff. It can propose deleting staging services.
- Do not paste API tokens/keys into chat. Use short-lived tokens for admin tasks and revoke after.
