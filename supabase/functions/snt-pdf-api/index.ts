import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ASSET_BUCKET = "snt-pdf-assets";
const GALLERY_BOARD_NO = 2147483647;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-viewer-token, x-file-name, range",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Expose-Headers": "content-length, content-range, accept-ranges, etag, last-modified"
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
  if (error || !data?.user) return null;
  return data.user;
}

async function accessDocument(req: Request, url: URL) {
  const token = (req.headers.get("x-viewer-token") || "").trim();
  if (token) {
    const { data: doc, error } = await admin
      .from("snt_pdf_documents")
      .select("*")
      .eq("student_token", token)
      .eq("student_link_enabled", true)
      .maybeSingle();
    if (error || !doc) throw new Error("INVALID_STUDENT_LINK");
    return { doc, role: "student" as const };
  }

  const user = await teacherUser(req);
  const docId = url.searchParams.get("doc");
  if (!user || !docId) throw new Error("AUTH_REQUIRED");

  // v3.11 shared teacher library: any authenticated teacher account in this
  // Supabase project may open a library document. Students still require the
  // document-specific student token above.
  const { data: doc, error } = await admin
    .from("snt_pdf_documents")
    .select("*")
    .eq("id", docId)
    .maybeSingle();
  if (error || !doc) throw new Error("DOCUMENT_NOT_FOUND");
  return { doc, role: "teacher" as const };
}

function driveUrl(fileId: string) {
  return `https://drive.usercontent.google.com/download?id=${encodeURIComponent(fileId)}&export=download&confirm=t`;
}

async function proxyPdf(req: Request, doc: any) {
  const headers: Record<string, string> = { "User-Agent": "Mozilla/5.0 SNT-PDF-Board" };
  const range = req.headers.get("range");
  if (range) headers.Range = range;

  let upstream = await fetch(driveUrl(doc.drive_file_id), { headers, redirect: "follow" });
  if (!upstream.ok) {
    upstream = await fetch(
      `https://drive.google.com/uc?export=download&confirm=t&id=${encodeURIComponent(doc.drive_file_id)}`,
      { headers, redirect: "follow" }
    );
  }

  const contentType = upstream.headers.get("content-type") || "";
  if (!upstream.ok || contentType.includes("text/html")) {
    return json({ error: "Google Drive did not return the PDF. Set the file to 'Anyone with the link' → Viewer." }, 502);
  }

  const h = new Headers(cors);
  h.set("Content-Type", contentType || "application/pdf");
  h.set("Cache-Control", "private, max-age=21600, stale-while-revalidate=86400");
  for (const name of ["content-length", "content-range", "accept-ranges", "etag", "last-modified"]) {
    const v = upstream.headers.get(name);
    if (v) h.set(name, v);
  }
  return new Response(upstream.body, { status: upstream.status, headers: h });
}

function online(at: string | null | undefined) {
  if (!at) return false;
  return Date.now() - new Date(at).getTime() < 12000;
}
function safeExt(mime: string) {
  return mime === "image/jpeg" ? "jpg" : mime === "image/webp" ? "webp" : mime === "image/gif" ? "gif" : "png";
}
function galleryStatePath(docId: string) {
  return `${docId}/gallery/gallery-state.json`;
}
function imageAnnoPath(image: any) {
  return `${image.storage_path}.annotations.json`;
}
async function imageRowForDoc(imageId: string, docId: string) {
  const { data, error } = await admin
    .from("snt_pdf_board_images")
    .select("*")
    .eq("id", imageId)
    .eq("document_id", docId)
    .maybeSingle();
  if (error || !data) throw new Error("IMAGE_NOT_FOUND");
  return data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "init";
    const { doc, role } = await accessDocument(req, url);

    if (action === "pdf") return await proxyPdf(req, doc);

    if (action === "init" && req.method === "GET") {
      return json({
        document: {
          id: doc.id,
          title: doc.title,
          revision: Number(doc.revision || 0),
          student_hooked: doc.student_hooked !== false,
          live_page: Number(doc.live_page || 1),
          live_board_no: Number(doc.live_board_no || 1),
          live_image_id: doc.live_image_id || null,
          live_scroll_ratio: Number(doc.live_scroll_ratio || 0),
          live_center_x: Number(doc.live_center_x ?? 0.5),
          live_center_y: Number(doc.live_center_y ?? 0.5),
          live_zoom: Number(doc.live_zoom || 1)
        },
        role,
        teacher_online: online(doc.teacher_present_at)
      });
    }

    if (action === "sync" && req.method === "GET") {
      const { data, error } = await admin
        .from("snt_pdf_documents")
        .select("revision,student_hooked,live_page,live_board_no,live_image_id,live_scroll_ratio,live_center_x,live_center_y,live_zoom,teacher_present_at,updated_at")
        .eq("id", doc.id)
        .single();
      if (error) throw error;
      return json({
        revision: Number(data.revision || 0),
        student_hooked: data.student_hooked !== false,
        live_page: Number(data.live_page || 1),
        live_board_no: Number(data.live_board_no || 1),
        live_image_id: data.live_image_id || null,
        live_scroll_ratio: Number(data.live_scroll_ratio || 0),
        live_center_x: Number(data.live_center_x ?? 0.5),
        live_center_y: Number(data.live_center_y ?? 0.5),
        live_zoom: Number(data.live_zoom || 1),
        teacher_online: online(data.teacher_present_at),
        updated_at: data.updated_at
      });
    }

    if (action === "page" && req.method === "GET") {
      const pageNo = Math.max(1, Number(url.searchParams.get("page") || 1));
      const { data, error } = await admin
        .from("snt_pdf_pages")
        .select("page_no,objects,updated_at")
        .eq("document_id", doc.id)
        .eq("page_no", pageNo)
        .maybeSingle();
      if (error) throw error;
      return json({ page_no: pageNo, objects: Array.isArray(data?.objects) ? data.objects : [], updated_at: data?.updated_at || null });
    }

    if (action === "boards" && req.method === "GET") {
      const pageNo = Math.max(1, Number(url.searchParams.get("page") || doc.live_page || 1));
      const { data, error } = await admin
        .from("snt_pdf_boards")
        .select("board_no,title,text_content,board_scope,page_no,is_permanent,updated_at")
        .eq("document_id", doc.id)
        .order("board_no");
      if (error) throw error;
      const rows = (data || []).filter((b: any) => b.is_permanent === true || (b.board_scope === "page" && Number(b.page_no) === pageNo));
      return json({ boards: rows, page_no: pageNo });
    }

    if (action === "images" && req.method === "GET") {
      const globalGallery = url.searchParams.get("gallery") === "1";
      const boardNo = Math.max(0, Number(url.searchParams.get("board") || 0));
      let query = admin.from("snt_pdf_board_images").select("id,board_no,image_name,mime_type,file_size,sort_no,created_at").eq("document_id", doc.id);
      if (!globalGallery) query = query.eq("board_no", boardNo);
      const { data, error } = await query.order("sort_no").order("created_at");
      if (error) throw error;
      return json({ images: data || [] });
    }

    if (action === "image" && req.method === "GET") {
      const imageId = url.searchParams.get("image");
      if (!imageId) throw new Error("IMAGE_NOT_FOUND");
      const image = await imageRowForDoc(imageId, doc.id);
      const { data, error } = await admin.storage.from(ASSET_BUCKET).download(image.storage_path);
      if (error || !data) throw new Error("IMAGE_NOT_FOUND");
      return new Response(data.stream(), { status: 200, headers: { ...cors, "Content-Type": image.mime_type || data.type || "image/png", "Cache-Control": "private, max-age=21600" } });
    }

    if (action === "gallery-state" && req.method === "GET") {
      const path = galleryStatePath(doc.id);
      const { data, error } = await admin.storage.from(ASSET_BUCKET).download(path);
      if (error || !data) return json({ gallery: { version: 3, width: 2400, height: 1800, placements: {}, objects: [], legacy_migrated: false } });
      const text = await data.text();
      let parsed: any = {};
      try { parsed = JSON.parse(text || '{}'); } catch {}
      return json({ gallery: parsed?.gallery || parsed || {} });
    }

    if (action === "save-gallery-state" && req.method === "POST") {
      if (role !== "teacher") throw new Error("AUTH_REQUIRED");
      const body = await req.json().catch(() => ({} as any));
      const gallery = body?.gallery && typeof body.gallery === 'object' ? body.gallery : {};
      const payload = JSON.stringify({ gallery, updated_at: new Date().toISOString() });
      const { error } = await admin.storage.from(ASSET_BUCKET).upload(galleryStatePath(doc.id), new TextEncoder().encode(payload), { contentType: 'application/json', upsert: true, cacheControl: '60' });
      if (error) throw error;
      await admin.from('snt_pdf_documents').update({ revision: Number(doc.revision || 0) + 1, updated_at: new Date().toISOString() }).eq('id', doc.id);
      return json({ ok: true });
    }

    if (action === "image-annotations" && req.method === "GET") {
      const imageId = url.searchParams.get("image");
      if (!imageId) throw new Error("IMAGE_NOT_FOUND");
      const image = await imageRowForDoc(imageId, doc.id);
      const { data, error } = await admin.storage.from(ASSET_BUCKET).download(imageAnnoPath(image));
      if (error || !data) return json({ image_id: image.id, objects: [] });
      const text = await data.text();
      let parsed: any = {};
      try { parsed = JSON.parse(text || '{}'); } catch {}
      return json({ image_id: image.id, objects: Array.isArray(parsed.objects) ? parsed.objects : [] });
    }

    if (action === "save-image-annotations" && req.method === "POST") {
      if (role !== "teacher") throw new Error("AUTH_REQUIRED");
      const imageId = url.searchParams.get("image");
      if (!imageId) throw new Error("IMAGE_NOT_FOUND");
      const image = await imageRowForDoc(imageId, doc.id);
      const body = await req.json().catch(() => ({} as any));
      const objects = Array.isArray(body?.objects) ? body.objects : [];
      const payload = JSON.stringify({ image_id: image.id, objects, updated_at: new Date().toISOString() });
      const path = imageAnnoPath(image);
      const { error } = await admin.storage.from(ASSET_BUCKET).upload(path, new TextEncoder().encode(payload), { contentType: 'application/json', upsert: true, cacheControl: '60' });
      if (error) throw error;
      return json({ ok: true, image_id: image.id, count: objects.length });
    }

    if (action === "upload-image" && req.method === "POST") {
      if (role !== "teacher") throw new Error("AUTH_REQUIRED");
      const globalGallery = url.searchParams.get("gallery") === "1";
      const boardNo = globalGallery ? GALLERY_BOARD_NO : Math.max(1, Number(url.searchParams.get("board") || 1));
      const mime = req.headers.get("content-type") || "image/png";
      if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(mime)) throw new Error("BAD_IMAGE");
      const body = await req.arrayBuffer();
      if (!body.byteLength || body.byteLength > 8 * 1024 * 1024) throw new Error("IMAGE_TOO_LARGE");
      let name = "Pasted image";
      try { name = decodeURIComponent(req.headers.get("x-file-name") || name).slice(0, 160); } catch {}

      if (!globalGallery) {
        const { data: board } = await admin.from("snt_pdf_boards").select("board_no").eq("document_id", doc.id).eq("board_no", boardNo).maybeSingle();
        if (!board) throw new Error("BOARD_NOT_FOUND");
      }

      const { data: last } = await admin.from("snt_pdf_board_images").select("sort_no").eq("document_id", doc.id).order("sort_no", { ascending: false }).limit(1).maybeSingle();
      const sortNo = Number(last?.sort_no || 0) + 1;
      const folder = globalGallery ? 'gallery' : String(boardNo);
      const path = `${doc.id}/${folder}/${crypto.randomUUID()}.${safeExt(mime)}`;
      const { error: upError } = await admin.storage.from(ASSET_BUCKET).upload(path, new Uint8Array(body), { contentType: mime, upsert: false, cacheControl: "21600" });
      if (upError) throw upError;

      const { data: row, error: insertError } = await admin
        .from("snt_pdf_board_images")
        .insert({ document_id: doc.id, board_no: boardNo, storage_path: path, image_name: name, mime_type: mime, file_size: body.byteLength, sort_no: sortNo })
        .select("id,board_no,image_name,mime_type,file_size,sort_no,created_at")
        .single();
      if (insertError) {
        await admin.storage.from(ASSET_BUCKET).remove([path]);
        throw insertError;
      }
      return json({ image: row });
    }

    if (action === "delete-image" && req.method === "POST") {
      if (role !== "teacher") throw new Error("AUTH_REQUIRED");
      const imageId = url.searchParams.get("image");
      if (!imageId) throw new Error("IMAGE_NOT_FOUND");
      const image = await imageRowForDoc(imageId, doc.id);
      await admin.storage.from(ASSET_BUCKET).remove([image.storage_path, imageAnnoPath(image)]);
      const { error } = await admin.from("snt_pdf_board_images").delete().eq("id", image.id);
      if (error) throw error;
      if (doc.live_image_id === image.id) await admin.from("snt_pdf_documents").update({ live_image_id: null }).eq("id", doc.id);
      return json({ ok: true });
    }

    return json({ error: "Unsupported request." }, 404);
  } catch (e) {
    const code = e instanceof Error ? e.message : "UNKNOWN";
    const message =
      code === "INVALID_STUDENT_LINK" ? "This student link is invalid or has been revoked." :
      code === "AUTH_REQUIRED" ? "Teacher sign-in is required." :
      code === "DOCUMENT_NOT_FOUND" ? "This document was not found." :
      code === "IMAGE_TOO_LARGE" ? "Image must be under 8 MB." :
      code === "BAD_IMAGE" ? "Use PNG, JPG, WEBP or GIF images." :
      code === "IMAGE_NOT_FOUND" ? "That pasted image was not found." :
      code === "BOARD_NOT_FOUND" ? "That notepad board no longer exists." :
      "Unable to complete the request.";
    return json({ error: message }, 400);
  }
});
