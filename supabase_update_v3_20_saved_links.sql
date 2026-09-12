begin;

create table if not exists public.snt_pdf_saved_links (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.snt_pdf_documents(id) on delete cascade,
  title text not null default '',
  url text not null,
  sort_no integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists snt_pdf_saved_links_document_idx
  on public.snt_pdf_saved_links(document_id, sort_no, created_at);

alter table public.snt_pdf_saved_links enable row level security;

create or replace function public.snt_pdf_links_list(
  p_document_id uuid default null,
  p_student_token text default null
)
returns table(id uuid, title text, url text, sort_no integer, created_at timestamptz, updated_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare v_doc uuid;
begin
  if auth.uid() is not null and p_document_id is not null then
    select d.id into v_doc from public.snt_pdf_documents d where d.id=p_document_id;
  elsif p_student_token is not null then
    select d.id into v_doc from public.snt_pdf_documents d
    where d.student_token=p_student_token and d.student_link_enabled=true;
  end if;
  if v_doc is null then raise exception 'not authorized'; end if;
  return query select l.id,l.title,l.url,l.sort_no,l.created_at,l.updated_at
  from public.snt_pdf_saved_links l where l.document_id=v_doc
  order by l.sort_no,l.created_at;
end;
$$;

create or replace function public.snt_pdf_links_create(p_document_id uuid,p_title text,p_url text)
returns table(id uuid,title text,url text,sort_no integer,created_at timestamptz,updated_at timestamptz)
language plpgsql security definer set search_path=public
as $$
declare v_sort integer; v_id uuid;
begin
  if auth.uid() is null then raise exception 'not authorized'; end if;
  if not exists(select 1 from public.snt_pdf_documents d where d.id=p_document_id) then raise exception 'document not found'; end if;
  if p_url is null or p_url !~* '^https?://' then raise exception 'invalid url'; end if;
  select coalesce(max(l.sort_no),0)+1 into v_sort from public.snt_pdf_saved_links l where l.document_id=p_document_id;
  insert into public.snt_pdf_saved_links(document_id,title,url,sort_no)
  values(p_document_id,left(coalesce(nullif(trim(p_title),''),p_url),120),p_url,v_sort)
  returning snt_pdf_saved_links.id into v_id;
  update public.snt_pdf_documents set revision=revision+1,updated_at=now() where id=p_document_id;
  return query select l.id,l.title,l.url,l.sort_no,l.created_at,l.updated_at from public.snt_pdf_saved_links l where l.id=v_id;
end;
$$;

create or replace function public.snt_pdf_links_delete(p_document_id uuid,p_link_id uuid)
returns boolean language plpgsql security definer set search_path=public
as $$
begin
  if auth.uid() is null then raise exception 'not authorized'; end if;
  delete from public.snt_pdf_saved_links where id=p_link_id and document_id=p_document_id;
  update public.snt_pdf_documents set revision=revision+1,updated_at=now() where id=p_document_id;
  return true;
end;
$$;

revoke all on function public.snt_pdf_links_list(uuid,text) from public;
revoke all on function public.snt_pdf_links_create(uuid,text,text) from public;
revoke all on function public.snt_pdf_links_delete(uuid,uuid) from public;
grant execute on function public.snt_pdf_links_list(uuid,text) to anon,authenticated;
grant execute on function public.snt_pdf_links_create(uuid,text,text) to authenticated;
grant execute on function public.snt_pdf_links_delete(uuid,uuid) to authenticated;

commit;
notify pgrst, 'reload schema';
