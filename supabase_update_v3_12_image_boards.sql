-- SNT PDF Annotator v3.12
-- Global image boards + missing live-view columns.
-- Production migration already applied through Supabase.

begin;

alter table public.snt_pdf_documents
  add column if not exists live_center_x double precision not null default 0.5,
  add column if not exists live_center_y double precision not null default 0.5,
  add column if not exists live_zoom double precision not null default 1,
  add column if not exists live_image_board_no integer not null default 1;

create table if not exists public.snt_pdf_image_boards (
  document_id uuid not null references public.snt_pdf_documents(id) on delete cascade,
  board_no integer not null check (board_no > 0),
  title text not null default 'Image Board',
  canvas_width integer not null default 1600 check (canvas_width between 400 and 6000),
  canvas_height integer not null default 1000 check (canvas_height between 300 and 5000),
  placements jsonb not null default '{}'::jsonb check (jsonb_typeof(placements) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (document_id, board_no)
);

alter table public.snt_pdf_image_boards enable row level security;

drop policy if exists snt_shared_teachers_image_boards on public.snt_pdf_image_boards;
create policy snt_shared_teachers_image_boards
on public.snt_pdf_image_boards
as permissive
for all
to authenticated
using (true)
with check (true);

update public.snt_pdf_board_images
set board_no = 1
where board_no = 2147483647;

insert into public.snt_pdf_image_boards (document_id, board_no, title)
select id, 1, 'Image Board 1'
from public.snt_pdf_documents
on conflict (document_id, board_no) do nothing;

insert into public.snt_pdf_image_boards (document_id, board_no, title)
select distinct i.document_id, i.board_no, 'Imported Image Board ' || i.board_no
from public.snt_pdf_board_images i
where i.board_no > 1
on conflict (document_id, board_no) do nothing;

create index if not exists snt_pdf_image_boards_document_idx
  on public.snt_pdf_image_boards(document_id, board_no);

create index if not exists snt_pdf_board_images_doc_board_idx
  on public.snt_pdf_board_images(document_id, board_no, sort_no);

commit;

notify pgrst, 'reload schema';
