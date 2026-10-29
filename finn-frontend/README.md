# FINN frontend

Next.js App Router UI for portfolio prices, configurable EOD alerts, shared local settings, and a narrow evidence-backed historical research snapshot.

See [the root README](../README.md) for Python/API setup, environment variables, architecture, deployment instructions, and known limitations.

```powershell
npm.cmd ci
npm.cmd run dev
npm.cmd test
npm.cmd run lint
```

Development defaults to `http://localhost:8000/api`. For a production build, set `NEXT_PUBLIC_API_URL` to the actual HTTPS backend URL ending in `/api`, then run `npm.cmd run build` and `npm.cmd start`. The URL is public and embedded at build time. Missing or invalid production configuration fails the build.

The frontend and backend must use the same scan-envelope API contract. A complete empty alert scan is distinct from partial coverage or unavailable data. The Research page loads its supported-company catalogue and snapshot from `/api/research`: initially only Infosys Q4/FY25, with original PDF page links, historical labels, and explicit unsupported/unavailable states. Real source retrieval has been checked through FastAPI; browser interaction and deployment have not. Announcements and background notifications are not implemented.
