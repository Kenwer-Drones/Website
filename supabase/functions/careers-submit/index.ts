import { createClient } from "npm:@supabase/supabase-js@2.83.0";

const ORIGINS = new Set(["https://kenwerdrones.com", "https://www.kenwerdrones.com"]);
const MAX_FILE = 5 * 1024 * 1024;
const TYPES: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

function response(status: number, body: Record<string, unknown>, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": origin && ORIGINS.has(origin) ? origin : "https://www.kenwerdrones.com",
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "content-type",
      "vary": "Origin",
    },
  });
}
function val(data: FormData, name: string, max: number): string {
  const value = data.get(name);
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
function validateFile(file: FormDataEntryValue | null, needed: boolean) {
  if (!file) {
    if (needed) throw new Error("Resume is required.");
    return null;
  }
  if (!(file instanceof File)) throw new Error("Invalid file.");
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!TYPES[ext] || file.size < 1 || file.size > MAX_FILE) {
    throw new Error("PDF or Word files up to 5 MB are supported.");
  }
  return { file, ext, type: TYPES[ext] };
}
async function validSignature(file: File, ext: string): Promise<boolean> {
  const bytes = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  if (ext === "pdf") return bytes[0] === 37 && bytes[1] === 80 && bytes[2] === 68 && bytes[3] === 70 && bytes[4] === 45;
  if (ext === "docx") return bytes[0] === 80 && bytes[1] === 75;
  return bytes[0] === 0xD0 && bytes[1] === 0xCF && bytes[2] === 0x11 && bytes[3] === 0xE0;
}
async function ipFingerprint(req: Request): Promise<string> {
  const ip = (req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for")?.split(",")[0] || req.headers.get("x-real-ip") || "unknown").trim();
  const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "fallback";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret + ":" + ip));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2,"0")).join("");
}
Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return response(204, {}, origin);
  if (req.method !== "POST") return response(405, {error:"Method not allowed"},origin);
  if (!origin || !ORIGINS.has(origin)) return response(403, {error:"Origin not allowed"},origin);
  const contentType = req.headers.get("content-type") || "";
  if (!contentType.startsWith("multipart/form-data")) return response(415,{error:"Expected form submission"},origin);
  const declaredSize = Number(req.headers.get("content-length") || "0");
  if (declaredSize > 11 * 1024 * 1024) return response(413,{error:"Files are too large"},origin);
  try {
    const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
    const serviceKey = secretKeys.default || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const base = Deno.env.get("SUPABASE_URL");
    if (!serviceKey || !base) throw new Error("Backend configuration missing");
    const sb = createClient(base, serviceKey, {auth:{autoRefreshToken:false,persistSession:false}});
    const data = await req.formData();
    // A hidden honeypot field stops simple automated form submissions.
    if (val(data,"companyWebsite",150)) return response(400,{error:"Submission rejected"},origin);
    const full_name = val(data,"fullName",160);
    const email = val(data,"email",254);
    const phone = val(data,"phone",60);
    const college = val(data,"college",200);
    const gradMonth = val(data,"gradDate",7);
    const position = val(data,"position",160) || null;
    const linkedin = val(data,"linkedin",500) || null;
    const experience = val(data,"experience",5000) || null;
    if (!full_name || !/^\\S+@\\S+\\.\\S+$/.test(email) || !phone || !college ||
        !/^\\d{4}-(0[1-9]|1[0-2])$/.test(gradMonth)) {
      return response(400,{error:"Complete all required fields."},origin);
    }
    const resume = validateFile(data.get("resume"),true)!;
    const cover = validateFile(data.get("coverLetter"),false);
    if (!await validSignature(resume.file,resume.ext) ||
       (cover && !await validSignature(cover.file,cover.ext))) {
      return response(400,{error:"The uploaded file does not match its PDF or Word extension."},origin);
    }

    const fingerprint=await ipFingerprint(req);
    const {data:allowed,error:limitError}=await sb.rpc("consume_careers_limit",{p_fingerprint:fingerprint});
    if (limitError) {
      console.error("careers rate-limit failure",limitError.code);
      return response(503,{error:"Application service temporarily unavailable."},origin);
    }
    if (!allowed) return response(429,{error:"Too many submissions. Please try again later."},origin);

    const unique=crypto.randomUUID();
    const resumePath=unique+"/resume."+resume.ext;
    const coverPath=cover?unique+"/cover."+cover.ext:null;
    const {error:resumeError}=await sb.storage.from("resumes").upload(resumePath,resume.file,{
      contentType:resume.type,upsert:false,cacheControl:"0"
    });
    if (resumeError) {
      console.error("careers resume upload",resumeError.message);
      return response(502,{error:"Could not save resume. Please try again."},origin);
    }
    if (cover && coverPath) {
      const {error:coverError}=await sb.storage.from("resumes").upload(coverPath,cover.file,{
        contentType:cover.type,upsert:false,cacheControl:"0"
      });
      if (coverError) {
        await sb.storage.from("resumes").remove([resumePath]);
        console.error("careers cover upload",coverError.message);
        return response(502,{error:"Could not save cover letter. Please try again."},origin);
      }
    }
    const {error:dbError}=await sb.from("applicants").insert({
      full_name,email,phone,college,grad_date:gradMonth+"-01",
      position,linkedin,experience,resume_path:resumePath,cover_letter_path:coverPath
    });
    if (dbError) {
      await sb.storage.from("resumes").remove([resumePath,...(coverPath?[coverPath]:[])]);
      console.error("careers database insert",dbError.code);
      return response(502,{error:"Could not save application details. Please try again."},origin);
    }
    return response(201,{success:true},origin);
  } catch (error) {
    console.error("careers-submit failed",error instanceof Error ? error.message : "Unknown");
    const message=error instanceof Error && /Resume is required|Invalid file|PDF or Word files/.test(error.message)
      ? error.message : "Application submission failed. Please try again.";
    return response(400,{error:message},origin);
  }
});
