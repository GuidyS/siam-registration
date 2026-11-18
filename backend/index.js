import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { join, resolve, extname } from 'node:path';
import { randomBytes, createHash, scryptSync, timingSafeEqual, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { demoAnswer } from './demo-knowledge.js';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const dataDir = process.env.DATA_DIR || join(root, 'data');
mkdirSync(dataDir, { recursive: true });
const db = new DatabaseSync(process.env.DB_FILE || join(dataDir, 'app.sqlite'));
db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000');
db.exec(`
CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, role TEXT NOT NULL, password_hash TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS conversations (id TEXT PRIMARY KEY, student_id TEXT NOT NULL REFERENCES users(id), mode TEXT NOT NULL DEFAULT 'ai', assigned_staff_id TEXT REFERENCES users(id), created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES conversations(id), sender_id TEXT NOT NULL REFERENCES users(id), sender_role TEXT NOT NULL, body TEXT NOT NULL, client_message_id TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(conversation_id,sender_id,client_message_id));
CREATE TABLE IF NOT EXISTS queue_sequences (queue_date TEXT PRIMARY KEY, next_number INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS queue_entries (id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES conversations(id), student_id TEXT NOT NULL REFERENCES users(id), queue_date TEXT NOT NULL, queue_number INTEGER NOT NULL, status TEXT NOT NULL, assigned_staff_id TEXT REFERENCES users(id), created_at TEXT NOT NULL, called_at TEXT, ended_at TEXT, UNIQUE(queue_date,queue_number));
CREATE TABLE IF NOT EXISTS tickets (id TEXT PRIMARY KEY, student_id TEXT NOT NULL REFERENCES users(id), conversation_id TEXT REFERENCES conversations(id), subject TEXT NOT NULL, description TEXT NOT NULL, status TEXT NOT NULL, request_key TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(student_id,request_key));
CREATE TABLE IF NOT EXISTS audit_logs (id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, action TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS demo_courses (id TEXT PRIMARY KEY, title TEXT NOT NULL, credits INTEGER NOT NULL, capacity INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS demo_enrollments (student_id TEXT NOT NULL REFERENCES users(id), course_id TEXT NOT NULL REFERENCES demo_courses(id), created_at TEXT NOT NULL, PRIMARY KEY(student_id,course_id));
CREATE INDEX IF NOT EXISTS messages_by_conversation ON messages(conversation_id,created_at,id);
CREATE INDEX IF NOT EXISTS queue_by_status ON queue_entries(status,created_at);
CREATE INDEX IF NOT EXISTS tickets_by_student ON tickets(student_id,created_at);
`);

const now = () => new Date().toISOString();
const hashPassword = value => { const salt = randomBytes(16).toString('hex'); return `${salt}:${scryptSync(value, salt, 64).toString('hex')}`; };
for (const [id, name, role] of [['student1','นักศึกษา 1','student'],['student2','นักศึกษา 2','student'],['staff1','เจ้าหน้าที่ 1','staff'],['staff2','เจ้าหน้าที่ 2','staff']]) {
  if (!db.prepare('SELECT id FROM users WHERE id=?').get(id)) db.prepare('INSERT INTO users VALUES (?,?,?,?)').run(id,name,role,hashPassword('demo1234'));
}
for (const [id,title] of [
  ['101-101','ภาษาไทยเพื่อการสื่อสาร'],
  ['101-102','ภาษาอังกฤษในชีวิตประจำวัน'],
  ['201-201','คณิตศาสตร์พื้นฐาน'],
  ['301-101','พื้นฐานคอมพิวเตอร์'],
]) db.prepare('INSERT OR IGNORE INTO demo_courses VALUES (?,?,?,?)').run(id,title,0,999999);

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const fail = (status, message) => { throw new HttpError(status,message); };
const send = (res, status, value) => { res.writeHead(status, { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff' }); res.end(JSON.stringify(value)); };
const body = async req => {
  let raw = '';
  for await (const chunk of req) { raw += chunk; if (raw.length > 16000) fail(413,'ข้อมูลยาวเกินไป'); }
  try { return JSON.parse(raw || '{}'); } catch { fail(400,'รูปแบบข้อมูลไม่ถูกต้อง'); }
};
const textField = (v, max = 2000) => typeof v === 'string' && v.trim().length > 0 && v.trim().length <= max ? v.trim() : fail(400,'กรุณากรอกข้อมูลให้ครบและไม่ยาวเกินกำหนด');
const keyField = v => typeof v === 'string' && /^[a-zA-Z0-9_-]{8,100}$/.test(v) ? v : fail(400,'รหัสคำขอไม่ถูกต้อง');
const transaction = fn => { db.exec('BEGIN IMMEDIATE'); try { const result=fn(); db.exec('COMMIT'); return result; } catch(e) { db.exec('ROLLBACK'); throw e; } };
const audit = (actor, action, type, id) => db.prepare('INSERT INTO audit_logs VALUES (?,?,?,?,?,?)').run(randomUUID(),actor,action,type,id,now());
const rate = new Map();
function limit(id, action, count, windowMs) {
  const k = `${id}:${action}`, t = Date.now(), entry = rate.get(k) || { start:t, count:0 };
  if (t-entry.start > windowMs) { entry.start=t; entry.count=0; }
  if (++entry.count > count) fail(429,'ส่งคำขอบ่อยเกินไป กรุณารอสักครู่');
  rate.set(k,entry);
}
function auth(req) {
  const token = (req.headers.authorization || '').match(/^Bearer ([a-f0-9]{64})$/)?.[1];
  if (!token) fail(401,'กรุณาเข้าสู่ระบบ');
  const user = db.prepare(`SELECT u.id,u.name,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?`).get(createHash('sha256').update(token).digest('hex'),now());
  if (!user) fail(401,'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่');
  return user;
}
const role = (user, expected) => { if (user.role !== expected) fail(403,'ไม่มีสิทธิ์ทำรายการนี้'); };
function conversation(id,user) {
  const c=db.prepare('SELECT * FROM conversations WHERE id=?').get(id);
  if (!c || (user.role==='student' ? c.student_id!==user.id : c.assigned_staff_id!==user.id)) fail(404,'ไม่พบบทสนทนา');
  return c;
}
const queueView = q => q ? ({ ...q, position: q.status==='waiting' ? db.prepare("SELECT COUNT(*) AS n FROM queue_entries WHERE status='waiting' AND (created_at<? OR (created_at=? AND rowid<(SELECT rowid FROM queue_entries WHERE id=?)))").get(q.created_at,q.created_at,q.id).n + 1 : null }) : null;
const messages = id => db.prepare('SELECT id,conversation_id,sender_role,body,created_at FROM messages WHERE conversation_id=? ORDER BY created_at,rowid').all(id);
const demoCourses = studentId => db.prepare(`SELECT c.id,c.title,e.created_at
  FROM demo_enrollments e JOIN demo_courses c ON c.id=e.course_id
  WHERE e.student_id=? ORDER BY e.created_at,c.id`).all(studentId);
function addMessage(c,user,message,clientId) {
  const existing=db.prepare('SELECT * FROM messages WHERE conversation_id=? AND sender_id=? AND client_message_id=?').get(c.id,user.id,clientId);
  if (existing) return existing;
  const entry={ id:randomUUID(), conversation_id:c.id, sender_id:user.id, sender_role:user.role, body:message, client_message_id:clientId, created_at:now() };
  db.prepare('INSERT INTO messages VALUES (?,?,?,?,?,?,?)').run(...Object.values(entry));
  db.prepare('UPDATE conversations SET updated_at=? WHERE id=?').run(entry.created_at,c.id);
  return entry;
}
const publicMessage = m => ({ id:m.id, conversation_id:m.conversation_id, sender_role:m.sender_role, body:m.body, created_at:m.created_at });

export async function api(req,res,url) {
  const path=url.pathname;
  if (path==='/api/login' && req.method==='POST') {
    const input=await body(req), user=db.prepare('SELECT * FROM users WHERE id=?').get(input.id);
    if (!user) fail(401,'บัญชีหรือรหัสผ่านไม่ถูกต้อง');
    const [salt,expected]=user.password_hash.split(':');
    const supplied=scryptSync(String(input.password||''),salt,64);
    if (!timingSafeEqual(Buffer.from(expected,'hex'),supplied)) fail(401,'บัญชีหรือรหัสผ่านไม่ถูกต้อง');
    const token=randomBytes(32).toString('hex'), expires=new Date(Date.now()+12*60*60*1000).toISOString();
    db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(createHash('sha256').update(token).digest('hex'),user.id,expires);
    return send(res,200,{ token, user:{id:user.id,name:user.name,role:user.role} });
  }
  const user=auth(req);
  if (path==='/api/logout' && req.method==='POST') { db.prepare('DELETE FROM sessions WHERE token_hash=?').run(createHash('sha256').update(req.headers.authorization.slice(7)).digest('hex')); return send(res,200,{ok:true}); }
  if (path==='/api/me' && req.method==='GET') return send(res,200,user);
  if (path==='/api/student/state' && req.method==='GET') {
    role(user,'student');
    const c=db.prepare('SELECT * FROM conversations WHERE student_id=? ORDER BY created_at DESC,rowid DESC LIMIT 1').get(user.id);
    const q=db.prepare("SELECT * FROM queue_entries WHERE student_id=? AND status IN ('waiting','active') ORDER BY created_at DESC LIMIT 1").get(user.id);
    const tickets=db.prepare('SELECT id,subject,status,created_at FROM tickets WHERE student_id=? ORDER BY created_at DESC').all(user.id);
    return send(res,200,{conversation:c||null,messages:c?messages(c.id):[],queue:queueView(q),tickets,courses:demoCourses(user.id)});
  }
  if (path==='/api/student/conversations' && req.method==='POST') {
    role(user,'student'); limit(user.id,'new-conversation',10,60000);
    const c=transaction(() => {
      const latest=db.prepare('SELECT * FROM conversations WHERE student_id=? ORDER BY created_at DESC,rowid DESC LIMIT 1').get(user.id);
      if(latest?.mode==='ai') return latest;
      if(latest && latest.mode!=='closed') fail(409,'บทสนทนากับเจ้าหน้าที่ยังไม่สิ้นสุด');
      const entry={id:randomUUID(),student_id:user.id,mode:'ai',assigned_staff_id:null,created_at:now(),updated_at:now()};
      db.prepare('INSERT INTO conversations VALUES (?,?,?,?,?,?)').run(...Object.values(entry));
      return entry;
    });
    return send(res,200,{conversation:c});
  }
  if (path==='/api/student/courses' && req.method==='GET') {
    role(user,'student');
    const code=(url.searchParams.get('code')||'').trim().toUpperCase();
    if(!code) return send(res,200,{courses:[]});
    if(!/^[A-Z0-9-]{1,20}$/.test(code)) fail(400,'กรุณากรอกรหัสวิชาที่ถูกต้อง');
    const courses=db.prepare(`SELECT c.id,c.title,
      EXISTS(SELECT 1 FROM demo_enrollments e WHERE e.course_id=c.id AND e.student_id=?) AS enrolled
      FROM demo_courses c WHERE c.id LIKE ? ORDER BY c.id LIMIT 8`).all(user.id,`${code}%`);
    return send(res,200,{courses});
  }
  if (path==='/api/student/enrollments' && req.method==='POST') {
    role(user,'student'); limit(user.id,'enrollment',20,60000);
    const input=await body(req), courseId=textField(input.courseId,20).toUpperCase();
    if(!/^[A-Z0-9-]{2,20}$/.test(courseId)) fail(400,'รหัสวิชาใช้ตัวอักษรภาษาอังกฤษ ตัวเลข หรือขีดกลาง 2–20 ตัว');
    transaction(() => {
      const course=db.prepare('SELECT * FROM demo_courses WHERE id=?').get(courseId);
      if (!course) fail(404,'ไม่พบรหัสวิชานี้ในระบบทดสอบ');
      if (db.prepare('SELECT 1 FROM demo_enrollments WHERE student_id=? AND course_id=?').get(user.id,courseId)) fail(409,'เพิ่มรายวิชานี้แล้ว');
      db.prepare('INSERT INTO demo_enrollments VALUES (?,?,?)').run(user.id,courseId,now());
      audit(user.id,'demo.enrollment.add','course',courseId);
    });
    return send(res,200,{courses:demoCourses(user.id)});
  }
  const dropCourse=path.match(/^\/api\/student\/enrollments\/([^/]+)$/);
  if (dropCourse && req.method==='DELETE') {
    role(user,'student'); limit(user.id,'enrollment',20,60000);
    transaction(() => {
      const result=db.prepare('DELETE FROM demo_enrollments WHERE student_id=? AND course_id=?').run(user.id,dropCourse[1]);
      if (result.changes!==1) fail(404,'ไม่พบรายวิชาที่ลงไว้');
      audit(user.id,'demo.enrollment.drop','course',dropCourse[1]);
    });
    return send(res,200,{courses:demoCourses(user.id)});
  }
  if (path==='/api/ai/chat' && req.method==='POST') {
    role(user,'student'); limit(user.id,'chat',20,60000);
    const input=await body(req), message=textField(input.message), clientId=keyField(input.clientMessageId);
    const result=transaction(() => {
      let c=input.conversationId ? conversation(input.conversationId,user) : db.prepare('SELECT * FROM conversations WHERE student_id=? ORDER BY created_at DESC,rowid DESC LIMIT 1').get(user.id);
      if (!c) { c={id:randomUUID(),student_id:user.id,mode:'ai',assigned_staff_id:null,created_at:now(),updated_at:now()}; db.prepare('INSERT INTO conversations VALUES (?,?,?,?,?,?)').run(...Object.values(c)); }
      if (c.mode!=='ai') fail(409,'เจ้าหน้าที่กำลังดูแลบทสนทนานี้');
      const previous=db.prepare('SELECT * FROM messages WHERE conversation_id=? AND sender_id=? AND client_message_id=?').get(c.id,user.id,clientId);
      if (previous) return {conversation:c,messages:messages(c.id)};
      addMessage(c,user,message,clientId);
      const answerId=`answer-${clientId}`;
      addMessage(c,{id:user.id,role:'ai'},demoAnswer(message),answerId);
      return {conversation:c,messages:messages(c.id)};
    });
    return send(res,200,{...result,demoAnswer:true});
  }
  if (path==='/api/tickets' && req.method==='POST') {
    role(user,'student'); limit(user.id,'ticket',10,60000);
    const input=await body(req), subject=textField(input.subject,120), description=textField(input.description,2000), requestKey=keyField(input.requestKey);
    const ticket=transaction(() => {
      const old=db.prepare('SELECT * FROM tickets WHERE student_id=? AND request_key=?').get(user.id,requestKey); if(old) return old;
      const c=input.conversationId ? conversation(input.conversationId,user) : null;
      const t={id:`T-${randomBytes(4).toString('hex').toUpperCase()}`,student_id:user.id,conversation_id:c?.id||null,subject,description,status:'open',request_key:requestKey,created_at:now(),updated_at:now()};
      db.prepare('INSERT INTO tickets VALUES (?,?,?,?,?,?,?,?,?)').run(...Object.values(t)); audit(user.id,'ticket.create','ticket',t.id); return t;
    });
    return send(res,201,{ticket});
  }
  if (path==='/api/queue' && req.method==='POST') {
    role(user,'student'); limit(user.id,'queue',10,60000);
    const input=await body(req);
    const q=transaction(() => {
      const old=db.prepare("SELECT * FROM queue_entries WHERE student_id=? AND status IN ('waiting','active') ORDER BY created_at DESC LIMIT 1").get(user.id); if(old) return old;
      let c=input.conversationId ? conversation(input.conversationId,user) : db.prepare('SELECT * FROM conversations WHERE student_id=? ORDER BY created_at DESC LIMIT 1').get(user.id);
      if (!c) { c={id:randomUUID(),student_id:user.id,mode:'ai',assigned_staff_id:null,created_at:now(),updated_at:now()}; db.prepare('INSERT INTO conversations VALUES (?,?,?,?,?,?)').run(...Object.values(c)); }
      if (c.mode==='human') fail(409,'กำลังสนทนากับเจ้าหน้าที่อยู่แล้ว');
      const date=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Bangkok'});
      db.prepare('INSERT INTO queue_sequences(queue_date,next_number) VALUES (?,1) ON CONFLICT(queue_date) DO NOTHING').run(date);
      const n=db.prepare('SELECT next_number FROM queue_sequences WHERE queue_date=?').get(date).next_number;
      db.prepare('UPDATE queue_sequences SET next_number=next_number+1 WHERE queue_date=?').run(date);
      const entry={id:randomUUID(),conversation_id:c.id,student_id:user.id,queue_date:date,queue_number:n,status:'waiting',assigned_staff_id:null,created_at:now(),called_at:null,ended_at:null};
      db.prepare('INSERT INTO queue_entries VALUES (?,?,?,?,?,?,?,?,?,?)').run(...Object.values(entry));
      db.prepare("UPDATE conversations SET mode='waiting_staff',updated_at=? WHERE id=?").run(now(),c.id);
      audit(user.id,'queue.join','queue',entry.id); return entry;
    });
    return send(res,200,{queue:queueView(q)});
  }
  const cancel=path.match(/^\/api\/queue\/([^/]+)$/);
  if (cancel && req.method==='DELETE') {
    role(user,'student');
    transaction(() => { const q=db.prepare('SELECT * FROM queue_entries WHERE id=? AND student_id=?').get(cancel[1],user.id); if(!q) fail(404,'ไม่พบคิว'); if(q.status!=='waiting') fail(409,'ยกเลิกคิวนี้ไม่ได้'); db.prepare("UPDATE queue_entries SET status='canceled',ended_at=? WHERE id=?").run(now(),q.id); db.prepare("UPDATE conversations SET mode='ai',updated_at=? WHERE id=?").run(now(),q.conversation_id); audit(user.id,'queue.cancel','queue',q.id); });
    return send(res,200,{ok:true});
  }
  if (path==='/api/staff/state' && req.method==='GET') {
    role(user,'staff');
    const waiting=db.prepare("SELECT q.*,u.name AS student_name FROM queue_entries q JOIN users u ON u.id=q.student_id WHERE q.status='waiting' ORDER BY q.created_at").all();
    const active=db.prepare("SELECT q.*,u.name AS student_name FROM queue_entries q JOIN users u ON u.id=q.student_id WHERE q.status='active' AND q.assigned_staff_id=? ORDER BY q.called_at DESC").all(user.id);
    return send(res,200,{waiting,active});
  }
  const claim=path.match(/^\/api\/staff\/queue\/([^/]+)\/claim$/);
  if (claim && req.method==='POST') {
    role(user,'staff');
    const q=transaction(() => { const changed=db.prepare("UPDATE queue_entries SET status='active',assigned_staff_id=?,called_at=? WHERE id=? AND status='waiting'").run(user.id,now(),claim[1]); if(changed.changes!==1) fail(409,'คิวนี้มีเจ้าหน้าที่รับแล้ว'); const entry=db.prepare('SELECT * FROM queue_entries WHERE id=?').get(claim[1]); db.prepare("UPDATE conversations SET mode='human',assigned_staff_id=?,updated_at=? WHERE id=?").run(user.id,now(),entry.conversation_id); audit(user.id,'queue.claim','queue',entry.id); return entry; });
    return send(res,200,{queue:q});
  }
  const finish=path.match(/^\/api\/staff\/queue\/([^/]+)\/resolve$/);
  if (finish && req.method==='POST') {
    role(user,'staff');
    transaction(() => { const q=db.prepare("SELECT * FROM queue_entries WHERE id=? AND assigned_staff_id=? AND status='active'").get(finish[1],user.id); if(!q) fail(404,'ไม่พบงานที่รับไว้'); db.prepare("UPDATE queue_entries SET status='completed',ended_at=? WHERE id=?").run(now(),q.id); db.prepare("UPDATE conversations SET mode='closed',updated_at=? WHERE id=?").run(now(),q.conversation_id); audit(user.id,'queue.resolve','queue',q.id); });
    return send(res,200,{ok:true});
  }
  const msgPath=path.match(/^\/api\/conversations\/([^/]+)\/messages$/);
  if (msgPath && req.method==='GET') { const c=conversation(msgPath[1],user); return send(res,200,{conversation:c,messages:messages(c.id)}); }
  if (msgPath && req.method==='POST') {
    limit(user.id,'message',30,60000);
    const c=conversation(msgPath[1],user); if(c.mode!=='human') fail(409,'ขณะนี้ไม่ได้อยู่ในแชตกับเจ้าหน้าที่');
    const input=await body(req), value=textField(input.body), key=keyField(input.clientMessageId);
    const m=transaction(() => addMessage(c,user,value,key)); return send(res,200,{message:publicMessage(m)});
  }
  fail(404,'ไม่พบข้อมูล');
}

const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'};
export const server=createServer(async (req,res) => {
  try {
    const url=new URL(req.url,'http://localhost');
    if(url.pathname.startsWith('/api/')) return await api(req,res,url);
    if(req.method!=='GET') fail(405,'วิธีเรียกไม่ถูกต้อง');
    const target=url.pathname==='/'?'index.html':decodeURIComponent(url.pathname).replace(/^\//,'');
    if(target.includes('..') || target.includes('\\')) fail(404,'ไม่พบหน้า');
    const file=join(root,'frontend',target);
    const content=await readFile(file);
    res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream','X-Content-Type-Options':'nosniff'}); res.end(content);
  } catch(e) { if(e.code==='ENOENT') return send(res,404,{error:'ไม่พบหน้า'}); send(res,e.status||500,{error:e.status?e.message:'ระบบขัดข้อง'}); }
});
if (process.env.NODE_ENV!=='test') server.listen(Number(process.env.PORT||3000),'127.0.0.1',()=>console.log(`Demo running at http://127.0.0.1:${process.env.PORT||3000}`));
