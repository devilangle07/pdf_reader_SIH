# Document Workbench

A local-first document reader, workbench, and universal file conversion interface for inspecting, searching, redacting, extracting, and exporting files.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/document-workbench/src/App.tsx` — responsive workbench shell, document canvas, queue, markup, extraction, and assistant panels.
- `artifacts/document-workbench/src/index.css` — archive-inspired theme tokens and interaction utilities.
- `artifacts/document-workbench/src/workers/document-index.worker.ts` — chunked local document indexing worker.
- `attached_assets/Pasted-Act-as-a-Principal-Full-Stack-Engineer-and-UX-Architect_1787071483136.txt` — product brief and long-term capability blueprint.

## Architecture decisions

- The first build is local-first: browser File objects and localStorage keep the workspace private until the user exports.
- Large-file search is isolated behind a Web Worker and `Blob.slice()` chunk reads so the UI does not block on indexing.
- The UI is structured as a three-region operator workbench so future format engines can plug into the viewer, queue, and extraction rails.

## Product

The app provides a responsive workspace for opening local files, reviewing a starter document, switching between tabs and split view, searching indexed text, managing conversion jobs, previewing redactions, extracting structured content, asking grounded questions, and exporting text locally.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- The document conversion engines are intentionally represented as local UI and queue surfaces in the first build; format-specific WASM engines can be added behind the existing worker boundary.
- Run the managed `artifacts/document-workbench: web` workflow for preview so the artifact base path and port are injected correctly.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
