# Install to Booking Funnel — hosted copy

A daily snapshot of the Claude dashboard (Goals, Install to booking funnel, Features shipped, Futwork calls),
hosted on GitHub Pages so anyone with the link can open it.

- **Numbers** come from `data/`, written every day at 4:00 am IST by `.github/workflows/snapshot.yml`,
  which runs `scripts/snapshot.mjs` against Metabase (needs the `METABASE_API_KEY` repository secret).
- **Page** is `index.html`, built by `python3 scripts/build.py` from `src/page.html` (the dashboard page)
  and `src/datasets/*.json` (its queries). `scripts/dash-static.js` stands in for the dashboard runtime.
- Only aggregate counts and per-lead timestamps are published; no phone numbers or names.
