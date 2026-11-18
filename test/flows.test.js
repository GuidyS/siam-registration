import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
process.env.DB_FILE=':memory:';
process.env.NODE_ENV='test';
const { api }=await import('../backend/index.js');
const call=async (path,method='GET',data,token) => {
  const req=Readable.from(data?[JSON.stringify(data)]:[]);
  req.method=method;req.headers=token?{authorization:`Bearer ${token}`}:{ };
  let status,output;
  const res={writeHead(code){status=code},end(value){output=JSON.parse(value)}};
  try{await api(req,res,new URL(path,'http://localhost'))}catch(e){status=e.status||500;output={error:e.message}}
  return {status,data:output};
};
const login=async id=>(await call('/api/login','POST',{id,password:'demo1234'})).data.token;
const key=()=>crypto.randomUUID();

test('student and staff share durable chat, queue claim is atomic, and access is scoped',async()=>{
  const student=await login('student1'), peer=await login('student2'), staff=await login('staff1'), otherStaff=await login('staff2');
  const first=await call('/api/ai/chat','POST',{message:'กำหนดวันถอนรายวิชาเมื่อไร',clientMessageId:key()},student);
  assert.equal(first.status,200);
  assert.match(first.data.messages[1].body,/ไม่มีวันกำหนดหรือค่าธรรมเนียมที่ยืนยันได้/);
  const cid=first.data.conversation.id;
  const join=await call('/api/queue','POST',{conversationId:cid},student);
  assert.equal(join.status,200);
  assert.equal((await call('/api/queue','POST',{conversationId:cid},student)).data.queue.id,join.data.queue.id);
  assert.equal((await call(`/api/queue/${join.data.queue.id}`,'DELETE',null,peer)).status,404);
  const claims=await Promise.all([call(`/api/staff/queue/${join.data.queue.id}/claim`,'POST',{},staff),call(`/api/staff/queue/${join.data.queue.id}/claim`,'POST',{},otherStaff)]);
  assert.deepEqual(claims.map(x=>x.status).sort(),[200,409]);
  const winner=claims[0].status===200?staff:otherStaff;
  const loser=claims[0].status===200?otherStaff:staff;
  assert.equal((await call(`/api/conversations/${cid}/messages`,'GET',null,peer)).status,404);
  assert.equal((await call(`/api/conversations/${cid}/messages`,'GET',null,loser)).status,404);
  assert.equal((await call('/api/ai/chat','POST',{conversationId:cid,message:'อีกคำถาม',clientMessageId:key()},student)).status,409);
  const sent=await call(`/api/conversations/${cid}/messages`,'POST',{body:'สวัสดีครับ <script>alert(1)</script>',clientMessageId:key()},student);
  assert.equal(sent.status,200);
  const reply=await call(`/api/conversations/${cid}/messages`,'POST',{body:'ได้รับข้อความแล้วครับ',clientMessageId:key()},winner);
  assert.equal(reply.status,200);
  const history=await call(`/api/conversations/${cid}/messages`,'GET',null,student);
  assert.equal(history.data.messages.length,4);
  assert.equal(history.data.messages[2].body,'สวัสดีครับ <script>alert(1)</script>');
  assert.equal(history.data.messages[3].sender_role,'staff');
  assert.equal((await call('/api/student/state','GET',null,student)).data.queue.status,'active');
  assert.equal((await call('/api/student/state','GET',null,peer)).data.queue,null);
  await call(`/api/staff/queue/${join.data.queue.id}/resolve`,'POST',{},winner);
  assert.equal((await call('/api/student/state','GET',null,student)).data.conversation.mode,'closed');
  const renewed=await call('/api/student/conversations','POST',{},student);
  assert.equal(renewed.status,200);
  assert.notEqual(renewed.data.conversation.id,cid);
  assert.equal((await call('/api/student/conversations','POST',{},student)).data.conversation.id,renewed.data.conversation.id);
  assert.equal((await call('/api/student/state','GET',null,student)).data.conversation.mode,'ai');
  assert.equal((await call('/api/ai/chat','POST',{conversationId:renewed.data.conversation.id,message:'วิธีถอนรายวิชา',clientMessageId:key()},student)).status,200);
});

test('demo answers cover quick questions and clearly label made-up content',async()=>{
  const student=await login('student2');
  const questions=[
    ['วิธีเพิ่มรายวิชา',/กดปุ่ม “เพิ่ม–ถอนรายวิชา”/],
    ['วิธีถอนรายวิชา',/กด “ถอนรายวิชา”/],
    ['เพิ่มรายวิชาไม่ได้',/ที่นั่งว่าง/],
    ['ติดต่อเจ้าหน้าที่',/รับคิวเจ้าหน้าที่/],
    ['กำหนดวันถอนรายวิชาเมื่อไร',/ไม่มีวันกำหนดหรือค่าธรรมเนียมที่ยืนยันได้/],
  ];
  for(const [message,expected] of questions){
    const response=await call('/api/ai/chat','POST',{message,clientMessageId:key()},student);
    assert.equal(response.status,200);
    const answer=response.data.messages.at(-1).body;
    assert.match(answer,/^ข้อมูลตัวอย่างสำหรับทดสอบเท่านั้น\n/);
    assert.match(answer,expected);
  }
});

test('course code lookup allows adding only existing demo courses',async()=>{
  const student=await login('student1'), peer=await login('student2'), staff=await login('staff1');
  const before=await call('/api/student/state','GET',null,student);
  assert.equal(before.data.courses.length,0);
  assert.equal((await call('/api/student/courses?code=101','GET',null,staff)).status,403);
  const found=await call('/api/student/courses?code=101','GET',null,student);
  assert.deepEqual(found.data.courses.map(c=>c.id),['101-101','101-102']);
  assert.equal((await call('/api/student/enrollments','POST',{courseId:'999-999'},student)).status,404);
  assert.equal((await call('/api/student/enrollments','POST',{courseId:'101-101'},staff)).status,403);
  assert.equal((await call('/api/student/enrollments','POST',{courseId:'101-101'},student)).status,200);
  assert.equal((await call('/api/student/enrollments','POST',{courseId:'101-101'},student)).status,409);
  assert.equal((await call('/api/student/courses?code=101-101','GET',null,student)).data.courses[0].enrolled,1);
  assert.equal((await call('/api/student/state','GET',null,student)).data.courses[0].title,'ภาษาไทยเพื่อการสื่อสาร');
  assert.equal((await call('/api/student/state','GET',null,peer)).data.courses.length,0);
  assert.equal((await call('/api/student/enrollments/101-101','DELETE',null,peer)).status,404);
  assert.equal((await call('/api/student/enrollments/101-101','DELETE',null,student)).status,200);
  assert.equal((await call('/api/student/state','GET',null,student)).data.courses.length,0);
  assert.equal((await call('/api/student/courses?code=101-101','GET',null,student)).data.courses.length,1);
  assert.equal((await call('/api/student/enrollments','POST',{courseId:'101-101'},peer)).status,200);
});

test('tickets use server IDs and idempotency keys',async()=>{
  const student=await login('student2'), requestKey=key();
  const payload={subject:'เพิ่มรายวิชาไม่ได้',description:'ระบบแสดงข้อผิดพลาด',requestKey};
  const a=await call('/api/tickets','POST',payload,student),b=await call('/api/tickets','POST',payload,student);
  assert.equal(a.status,201); assert.equal(b.status,201); assert.equal(a.data.ticket.id,b.data.ticket.id);
  assert.match(a.data.ticket.id,/^T-[A-F0-9]{8}$/);
  assert.equal((await call('/api/student/state','GET',null,student)).data.tickets.length,1);
});

