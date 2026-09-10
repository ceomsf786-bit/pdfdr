-- SNT PDF Annotator v3.13
-- Image-board annotations + composed PDF support.

begin;

alter table public.snt_pdf_image_boards
  add column if not exists objects jsonb not null default '[]'::jsonb;

alter table public.snt_pdf_documents
  add column if not exists composed_pdf_path text,
  add column if not exists composed_page_count integer;

create or replace function public.snt_shift_for_inserted_pdf(
  p_document_id uuid,
  p_insert_before integer,
  p_insert_count integer,
  p_new_path text,
  p_new_page_count integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before integer := greatest(1, p_insert_before);
  v_count integer := greatest(1, p_insert_count);
  v_offset integer := 1000000;
begin
  if p_new_path is null or btrim(p_new_path) = '' then
    raise exception 'new composed PDF path required';
  end if;

  update public.snt_pdf_pages
     set page_no = page_no + v_offset
   where document_id = p_document_id and page_no >= v_before;
  update public.snt_pdf_pages
     set page_no = page_no - v_offset + v_count
   where document_id = p_document_id and page_no >= v_before + v_offset;

  update public.snt_pdf_boards
     set page_no = page_no + v_offset
   where document_id = p_document_id
     and board_scope = 'page' and is_permanent = false and page_no >= v_before;
  update public.snt_pdf_boards
     set page_no = page_no - v_offset + v_count
   where document_id = p_document_id
     and board_scope = 'page' and is_permanent = false and page_no >= v_before + v_offset;

  update public.snt_pdf_documents
     set composed_pdf_path = p_new_path,
         composed_page_count = greatest(1, p_new_page_count),
         live_page = case when live_page >= v_before then live_page + v_count else live_page end,
         revision = revision + 1,
         updated_at = now()
   where id = p_document_id;
end;
$$;

revoke all on function public.snt_shift_for_inserted_pdf(uuid,integer,integer,text,integer) from public;
revoke all on function public.snt_shift_for_inserted_pdf(uuid,integer,integer,text,integer) from anon;
revoke all on function public.snt_shift_for_inserted_pdf(uuid,integer,integer,text,integer) from authenticated;
grant execute on function public.snt_shift_for_inserted_pdf(uuid,integer,integer,text,integer) to service_role;

commit;
notify pgrst, 'reload schema';
