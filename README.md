# Raha College Student Union Election 2026–2027

**Developer:** Reinhardson Sangma  
**Design:** Claymorphism · mobile-first · deep red / navy / white / gold  
**Stack:** HTML, CSS, vanilla JavaScript · Supabase Edge Function · PostgreSQL · Python preflight tool

## Project package

The complete source bundle is provided separately as **`rcsu-election-source.zip`** in the project hand-off. Upload that ZIP to the root of this repository to add the application source and trigger the GitHub Pages workflow.

The archive contains:
- Responsive election website and claymorphism UI.
- Nine individual candidate portrait crops from the supplied poster.
- Nine English election positions and editable candidate data.
- Supabase SQL migration and JWT-protected Edge Function.
- Private Excel voter import workflow and Python CSV preflight utility.
- Full implementation, security, and deployment guide.

## Repository deployment

1. Download the source ZIP from the project hand-off and upload `rcsu-election-source.zip` to the root of this repository.
2. In **Settings → Pages → Build and deployment**, choose **GitHub Actions**.
3. The workflow extracts the ZIP and publishes the static website to GitHub Pages.
4. Extract the same ZIP locally and follow its `README.md` before attempting a live election.

## Backend status

**The app is not yet connected to a Supabase project and is not ready for real voting.** Before polling, create/configure the Supabase project, run the SQL migration, deploy the Edge Function, create an Auth administrator and add that user's UUID to the private admin allow-list, import the official voter register privately, and verify candidate spellings and eligibility with the election committee.

Only the Supabase project URL and publishable key belong in the browser's `config.js`. Never put a Supabase secret/service-role key in the repository or frontend.

## Privacy model

Voter eligibility records and anonymous ballots are separate. Ballot rows do not contain voter IDs or foreign keys. A short-lived one-use ticket temporarily authorises the kiosk ballot; the temporary voter-to-ticket link is removed in the same database transaction that writes the anonymous ballot and marks the voter as voted. Elevated database actions are restricted to the authenticated administrator through the Edge Function.

The attached Excel workbook is intentionally **not** stored in GitHub. Student voter data is imported from the admin panel directly into the private database.

## Candidate posts

President · Vice President · General Secretary · Assistant General Secretary · Games Secretary · Cultural Secretary · Magazine Secretary · Girls’ Common Room Secretary · Boys’ Common Room Secretary.

Candidate names are transliterations from the Assamese poster. The election committee must confirm their English spellings and all candidate-to-post assignments before voting opens.

## Attribution and copying

Project source files include the developer signature **Reinhardson Sangma**, and the source bundle carries an all-rights-reserved notice. A public repository can still be viewed, downloaded, or forked; a signature or licence notice cannot technically prevent copying. Make this repository private under GitHub settings if access restriction is required.
