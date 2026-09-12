import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-viewer-token",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json; charset=utf-8" }
  });
}

async function teacherUser(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const jwt = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : "";
  if (!jwt) return null;
  const { data, error } = await admin.auth.getUser(jwt);
  return error || !data?.user ? null : data.user;
}

async function accessDocument(req: Request, url: URL) {
  const token = (req.headers.get("x-viewer-token") || "").trim();
  if (token) {
    const { data: doc, error } = await admin
      .from("snt_pdf_documents")
      .select("id,student_link_enabled,revision")
      .eq("student_token", token)
      .eq("student_link_enabled", true)
      .maybeSingle();
    if (error || !doc) throw new Error("INVALID_STUDENT_LINK");
    return { doc, role: "student" as const };
  }

  const user = await teacherUser(req);
  const docId = url.searchParams.get("doc");
  if (!user || !docId) throw new Error("AUTH_REQUIRED");
  const { data: doc, error } = await admin
    .from("snt_pdf_documents")
    .select("id,revision")
    .eq("id", docId)
    .maybeSingle();
  if (error || !doc) throw new Error("DOCUMENT_NOT_FOUND");
  return { doc, role: "teacher" as const };
}

function safeUrl(input: unknown) {
  try {
    const u = new URL(String(input || "").trim());
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

async function touchRevision(doc: any) {
  await admin
    .from("snt_pdf_documents")
    .update({ revision: Number(doc.revision || 0) + 1, updated_at: new Date().toISOString() })
    .eq("id", doc.id);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "list";
    const { doc, role } = await accessDocument(req, url);

    if (action === "list" && req.method === "GET") {
      const { data, error } = await admin
        .from("snt_pdf_saved_links")
        .select("id,title,url,sort_no,created_at,updated_at")
        .eq("document_id", doc.id)
        .order("sort_no", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return json({ links: data || [] });
    }

    if (action === "create" && req.method === "POST") {
      if (role !== "teacher") throw new Error("AUTH_REQUIRED");
      const body = await req.json().catch(() => ({}));
      const linkUrl = safeUrl(body?.url);
      const title = String(body?.title || "").trim().slice(0, 120);
      if (!linkUrl) throw new Error("INVALID_URL");

      const { data: last } = await admin
        .from("snt_pdf_saved_links")
        .select("sort_no")
        .eq("document_id", doc.id)
        .order("sort_no", { ascending: false })
        .limit(1)
        .maybeSingle();

      const { data, error } = await admin
        .from("snt_pdf_saved_links")
        .insert({
          document_id: doc.id,
          title: title || new URL(linkUrl).hostname,
          url: linkUrl,
          sort_no: Number(last?.sort_no || 0) + 1
        })
        .select("id,title,url,sort_no,created_at,updated_at")
        .single();
      if (error) throw error;
      await touchRevision(doc);
      return json({ link: data });
    }

    if (action === "delete" && req.method === "POST") {
      if (role !== "teacher") throw new Error("AUTH_REQUIRED");
      const body = await req.json().catch(() => ({}));
      const id = String(body?.id || "").trim();
      if (!id) throw new Error("LINK_NOT_FOUND");
      const { error } = await admin
        .from("snt_pdf_saved_links")
        .delete()
        .eq("id", id)
        .eq("document_id", doc.id);
      if (error) throw error;
      await touchRevision(doc);
      return json({ ok: true });
    }

    return json({ error: "Unsupported request" }, 404);
  } catch (e) {
    const message = String((e as Error)?.message || e || "ERROR");
    const status = message === "AUTH_REQUIRED" || message === "INVALID_STUDENT_LINK" ? 401
      : message === "DOCUMENT_NOT_FOUND" || message === "LINK_NOT_FOUND" ? 404
      : message === "INVALID_URL" ? 400
      : 500;
    return json({ error: message }, status);
  }
});
