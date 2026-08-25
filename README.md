# Flocta_Kiln

Context compiler in front of Flow. **Simulation** on labeled jobs (and dumps you paste): fact ledger, pointer retrieval, tool views, crew slices. No live LLM. € figures use Scaleway list prices and a char/word token estimate — not production metering.

Flocta already routes. The window is still a dump. Kiln compiles what each model reads.

## Run locally

```bash
npm install
npm run dev
```

http://127.0.0.1:43147

**Add job** to paste your own dump. Three demo jobs ship in the repo.

## GitHub + Vercel

Repo: [MekalaKaveri18/Flocta_Demo](https://github.com/MekalaKaveri18/Flocta_Demo)

1. Push `main` to GitHub.
2. [vercel.com/new](https://vercel.com/new) → Import that repo → Framework **Next.js** → Deploy.
3. Root directory `.` — no env vars required.
