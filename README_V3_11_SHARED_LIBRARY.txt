SNT PDF Annotator v3.11 — SHARED LIBRARY + CATEGORIES + MASTER BACKUP

GITHUB DEPLOYED FILES
- teacher.html
- service-worker.js
- v311-library.js
- v311-library.css
- supabase_update_v3_11_shared_library.sql
- supabase/functions/snt-pdf-api/index.ts

WHAT v3.11 DOES
- One shared teacher library across all authenticated teacher profiles in the same Supabase project.
- Each PDF has a shared category; library is grouped by category and supports search/filter.
- Existing per-PDF Backup all / Import backup remain available.
- Master backup creates ONE .sntmaster file for the entire shared library, including each PDF's page annotations, boards/rich notes, gallery layout/drawings, and pasted gallery images.
- Original Google Drive PDF binaries are not duplicated; backups retain their Drive file IDs/share links.

IMPORTANT BACKEND ACTIVATION
GitHub Pages cannot itself change Supabase RLS or redeploy an already-deployed Edge Function.
1. Run supabase_update_v3_11_shared_library.sql once in Supabase SQL Editor.
2. Deploy supabase/functions/snt-pdf-api/index.ts as the existing snt-pdf-api function, with JWT verification kept OFF as before.
3. Hard refresh teacher.html once.

WHY THE EDGE FUNCTION CHANGES
The previous function explicitly required document.owner_id to equal the currently signed-in teacher. v3.11 removes that owner-only test for authenticated teachers, while student access still requires the document-specific student token.
