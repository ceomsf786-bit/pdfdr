-- SNT PDF Annotator v3.11
-- Shared teacher library + categories.
-- Run ONCE in Supabase SQL Editor.
-- Students remain view-only through the existing Edge Function/student token path.

begin;

alter table public.snt_pdf_documents
  add column if not exists category text not null default 'Uncategorized';

update public.snt_pdf_documents
set category = 'Uncategorized'
where category is null or btrim(category) = '';

alter table public.snt_pdf_documents enable row level security;
alter table public.snt_pdf_pages enable row level security;
alter table public.snt_pdf_boards enable row level security;
alter table public.snt_pdf_board_images enable row level security;

-- Additive shared-teacher policies. Existing owner-only policies can remain;
-- PostgreSQL ORs permissive policies together.
drop policy if exists snt_shared_teachers_documents on public.snt_pdf_documents;
create policy snt_shared_teachers_documents
on public.snt_pdf_documents
as permissive
for all
to authenticated
using (true)
with check (true);

drop policy if exists snt_shared_teachers_pages on public.snt_pdf_pages;
create policy snt_shared_teachers_pages
on public.snt_pdf_pages
as permissive
for all
to authenticated
using (true)
with check (true);

drop policy if exists snt_shared_teachers_boards on public.snt_pdf_boards;
create policy snt_shared_teachers_boards
on public.snt_pdf_boards
as permissive
for all
to authenticated
using (true)
with check (true);

drop policy if exists snt_shared_teachers_images on public.snt_pdf_board_images;
create policy snt_shared_teachers_images
on public.snt_pdf_board_images
as permissive
for all
to authenticated
using (true)
with check (true);

create index if not exists snt_pdf_documents_category_idx
  on public.snt_pdf_documents(category, updated_at desc);

commit;

select id, title, category, owner_id
from public.snt_pdf_documents
order by category, title;
