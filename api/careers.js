// Vercel Node.js function: private, two-phase careers submission.
// Requires SUPABASE_SECRET_KEY, CAREERS_SIGNING_SECRET and TURNSTILE_SECRET_KEY.
// Never expose these values in browser JavaScript.
const crypto = require('node:crypto');
const URL_BASE = 'https://imoulrezdhgbqtzfvsxx.supabase.co';
const BUCKET = 'resumes';
const MAX = 5 * 1024 * 1024;
const MIME = {
  pdf:'application/pdf',
  doc:'application/msword',
  docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
};

function json(res, status, body) {
  res.status(status).setHeader('Cache-Control','no-store').json(body);
}
function safeText(value, max = 500) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}
function validateFile(file, required) {
  if (!file && !required) return null;
  if (!file || typeof file !== 'object') throw Error('Missing resume');
  const name = safeText(file.name, 150);
  const ext = name.split('.').pop().toLowerCase();
  if (!MIME[ext] || !Number.isInteger(file.size) || file.size < 1 || file.size > MAX) {
    throw Error('Files must be PDF or Word format and under 5 MB');
  }
  return { name, size:file.size, mime:MIME[ext], ext };
}
function sign(data) {
  const payload=Buffer.from(JSON.stringify(data)).toString('base64url');
  const mac=crypto.createHmac('sha256',process.env.CAREERS_SIGNING_SECRET).update(payload).digest('base64url');
  return payload+'.'+mac;
}
function verify(token) {
  if (typeof token !== 'string' || token.length > 12000) throw Error('Invalid receipt');
  const [payload,mac,...extra]=token.split('.');
  if (!payload || !mac || extra.length) throw Error('Invalid receipt');
  const expected=crypto.createHmac('sha256',process.env.CAREERS_SIGNING_SECRET).update(payload).digest();
  const received=Buffer.from(mac,'base64url');
  if (expected.length!==received.length || !crypto.timingSafeEqual(expected,received)) throw Error('Invalid receipt');
  const parsed=JSON.parse(Buffer.from(payload,'base64url').toString());
  if (!parsed || parsed.expires < Date.now() || parsed.expires > Date.now()+30*60*1000) throw Error('Expired receipt');
  return parsed;
}
async function supabase(path, opts={}) {
  const resp=await fetch(URL_BASE+path, {
    ...opts,
    headers:{
      apikey: process.env.SUPABASE_SECRET_KEY,
      Authorization:'Bearer '+process.env.SUPABASE_SECRET_KEY,
      ...(opts.body ? {'Content-Type':'application/json'} : {}),
      ...(opts.headers || {})
    },
    signal: AbortSignal.timeout(12000)
  });
  const raw=await resp.text();
  let parsed;
  try {parsed=JSON.parse(raw);} catch {parsed={message:raw.slice(0,300)};}
  if (!resp.ok) {
    console.error('Careers Supabase API error',resp.status,parsed?.code||parsed?.message);
    throw Error('Storage or database request failed ('+resp.status+')');
  }
  return parsed;
}
async function captcha(token,ip) {
  const params=new URLSearchParams({
    secret:process.env.TURNSTILE_SECRET_KEY,
    response: safeText(token,4000),
    remoteip:ip||''
  });
  const response=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{
    method:'POST',body:params,signal:AbortSignal.timeout(8000)
  });
  const data=await response.json();
  return data.success === true;
}
async function signedUpload(path) {
  const result=await supabase('/storage/v1/object/upload/sign/'+BUCKET+'/'+path,{
    method:'POST',body:JSON.stringify({upsert:false})
  });
  if (!result.token) throw Error('Upload signing failed');
  return {path,token:result.token};
}
async function objectInfo(path) {
  const result=await supabase('/storage/v1/object/info/'+BUCKET+'/'+path);
  if (!result || !result.id) throw Error('File is missing');
  return result;
}
module.exports=async function handler(req,res) {
  if (req.method!=='POST') return json(res,405,{error:'Method not allowed'});
  if (req.headers.origin && req.headers.origin!==('https://'+req.headers.host) &&
      req.headers.origin!=='https://kenwerdrones.com' &&
      req.headers.origin!=='https://www.kenwerdrones.com') {
    return json(res,403,{error:'Origin not allowed'});
  }
  if (!process.env.SUPABASE_SECRET_KEY || !process.env.CAREERS_SIGNING_SECRET || !process.env.TURNSTILE_SECRET_KEY) {
    return json(res,503,{error:'Application service is not configured'});
  }
  try {
    const body=req.body || {};
    if(body.action==='start') {
      const info=body.applicant || {};
      const applicant={
        full_name:safeText(info.full_name,160),email:safeText(info.email,254),
        phone:safeText(info.phone,60),college:safeText(info.college,200),
        grad_date:safeText(info.grad_date,10)||null,position:safeText(info.position,160)||null,
        linkedin:safeText(info.linkedin,500)||null,experience:safeText(info.experience,5000)||null
      };
      if (!applicant.full_name || !/^\S+@\S+\.\S+$/.test(applicant.email) || !applicant.phone) {
        return json(res,400,{error:'Please complete the required contact fields'});
      }
      const resume=validateFile(body.resume,true);
      const cover=validateFile(body.cover,false);
      const ip=(req.headers['x-forwarded-for']||'').split(',')[0].trim();
      if (!(await captcha(body.turnstileToken,ip))) return json(res,403,{error:'Security verification failed. Please try again'});
      const id=crypto.randomUUID();
      const resumePath=id+'/resume.'+resume.ext;
      const coverPath=cover?id+'/cover.'+cover.ext:null;
      const uploads={resume:await signedUpload(resumePath)};
      if(coverPath)uploads.cover=await signedUpload(coverPath);
      return json(res,200,{
        uploads,
        receipt:sign({id,expires:Date.now()+15*60*1000,applicant,resumePath,coverPath,resume,cover})
      });
    }
    if(body.action==='complete') {
      const data=verify(body.receipt);
      const resumeInfo=await objectInfo(data.resumePath);
      if(data.coverPath) await objectInfo(data.coverPath);
      // The receipt binds the server-generated paths to validated applicant fields.
      const row={...data.applicant,resume_path:data.resumePath,cover_letter_path:data.coverPath};
      const result=await supabase('/rest/v1/applicants',{
        method:'POST',
        headers:{Prefer:'return=minimal'},
        body:JSON.stringify(row)
      });
      return json(res,200,{success:true});
    }
    return json(res,400,{error:'Invalid action'});
  } catch(err) {
    console.error('Careers submission error',err?.message);
    return json(res,400,{error:'Application could not be completed. Please contact hello@kenwerdrones.com.'});
  }
};
