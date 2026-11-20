# Raha College Student Union Election 2026–2027

**Developer:** Reinhardson Sangma  
**Style:** Claymorphism · mobile-first · red / navy / gold  
**Deployment:** GitHub Pages (Actions) · Supabase Edge Functions + PostgreSQL

This repository contains the complete election portal source in **[rcsu-election-source.zip](./rcsu-election-source.zip)**. The Pages workflow extracts the source archive and publishes the static app. The ZIP includes the frontend, nine poster portrait crops, SQL migration, authenticated Edge Function, Python CSV validator, and full setup guide.

## Important deployment status

The project is scaffolded, **not yet connected to a Supabase project**. Before real voting, an administrator must configure Supabase, run the SQL migration, deploy the Edge Function, create and allow-list the admin Auth user, import the official voter workbook privately, and have the election committee verify candidate name spellings and eligibility.

1. In **Settings → Pages → Build and deployment**, select **GitHub Actions**.
2. Download and extract rcsu-election-source.zip to configure Supabase and follow the included README.md.
3. Put only the Supabase project URL and publishable key in config.js. Never put a secret or service-role key in browser code.
4. Run the included SQL migration, deploy the election-api Edge Function, create and allow-list the election admin, then import the Excel voter register from the secured admin panel.

## Security design

Voter eligibility records are held in a private PostgreSQL schema. Ballot rows contain no voter foreign key or voter identifier. A one-use ticket temporarily authorises voting; its voter link is deleted in the same database transaction that records the anonymous ballot. Elevated operations are available only through the JWT-protected Edge Function after admin allow-list verification.

The attached workbook is **not** stored in this repository. Public repository files contain code and candidate poster crops only. Signatures and an all-rights-reserved notice identify authorship but cannot technically prevent copying of a public repository; use GitHub's private-repository setting for access control.

## Election positions

President · Vice President · General Secretary · Assistant General Secretary · Games Secretary · Cultural Secretary · Magazine Secretary · Girls’ Common Room Secretary · Boys’ Common Room Secretary.

Names are transliterations from the supplied Assamese poster and must be confirmed by the committee before polling.

See the extracted archive's README.md for full setup, deployment, import, operations, privacy, and testing instructions.
