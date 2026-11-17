const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('../target/room-check/node_modules/jsdom');
const model=require('../rooms-model.js');
const root=path.resolve(__dirname,'..');
function boot(saved){
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'');
 const dom=new JSDOM(html,{url:'http://prototype.local/index.html#rooms',runScripts:'dangerously',pretendToBeVisual:true});
 const w=dom.window,errors=[];w.addEventListener('error',e=>errors.push(e.error));
 if(saved)w.localStorage.setItem(model.key,saved);
 for(const name of ['history.js','rooms-model.js','rooms.js','app.js']){const s=w.document.createElement('script');s.textContent=fs.readFileSync(path.join(root,name),'utf8');w.document.body.appendChild(s);}
 assert.deepEqual(errors,[]);assert.match(w.document.querySelector('h1').textContent,/房间管理/);return dom;
}
function fill(w,overrides={}){const f=w.document.querySelector('#room-form');for(const [k,v] of Object.entries({building:'A栋',floor:'2F',number:'201',area:'42.50',...overrides}))f.elements.namedItem(k).value=v;return f;}
function submit(w){w.document.querySelector('#room-form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));}
function data(w){return JSON.parse(w.localStorage.getItem(model.key));}
test('new room has area and tenant fields, without room name, unit or purpose',()=>{
 const dom=boot(),w=dom.window;w.document.querySelector('#add-room').click();const f=w.document.querySelector('#room-form');
 assert.equal(f.elements.namedItem('name'),null);assert.equal(f.elements.namedItem('status'),null);assert.ok(f.elements.area);assert.ok(f.elements.tenant);assert.ok(f.elements.phone);assert.ok(f.elements.occupancy);assert.equal(f.elements.unit,undefined);assert.equal(f.elements.purpose,undefined);assert.equal(f.elements.tenant.required,false);
 f.elements.occupancy.value='occupied';f.elements.occupancy.dispatchEvent(new w.Event('change'));assert.equal(f.elements.tenant.required,true);assert.equal(f.elements.phone.required,true);dom.window.close();
});
test('saving persists area, tenant and occupancy without room name, and survives reload',()=>{
 const dom=boot(),w=dom.window;w.document.querySelector('#add-room').click();fill(w,{occupancy:'occupied',tenant:'测试租户',phone:'13800001234'});submit(w);
 const record=data(w).rooms.find(r=>r.number==='201');assert.equal(Object.hasOwn(record,'name'),false);assert.equal(record.area,'42.50');assert.equal(record.tenant,'测试租户');assert.equal(record.occupancy,'occupied');
 const previous=data(w);for(const room of previous.rooms){room.building+=' · 研发楼';room.status='disabled';}for(const d of previous.deviceSnapshots)d.building+=' · 办公楼';
 const saved=JSON.stringify(previous);dom.window.close();const next=boot(saved);next.window.roomForm(record.id);
 assert.equal(next.window.document.querySelector('#room-form').elements.building.value,'A栋');assert.equal(next.window.document.querySelector('#room-form').elements.phone.value,'13800001234');assert.equal(next.window.document.querySelector('#room-form').elements.namedItem('status'),null);
 submit(next.window);assert.equal(data(next.window).rooms.find(r=>r.id===record.id).phone,'13800001234');assert.equal(Object.hasOwn(data(next.window).rooms.find(r=>r.id===record.id),'status'),false);next.window.close();
});
test('picker searches 2000 devices but renders six, marks bound meters, and cancellation is atomic',()=>{
 const dom=boot(),w=dom.window;w.document.querySelector('#add-room').click();w.document.querySelector('[data-room-pick="electric"]').click();
 assert.equal(w.document.querySelectorAll('[data-room-meter]').length,6);assert.match(w.document.querySelector('#room-picker-count').textContent,/2000/);assert.equal(w.document.querySelector('[data-room-meter="EM000001"]').disabled,true);
 const input=w.document.querySelector('#room-picker-search');input.value='EM000020';input.dispatchEvent(new w.Event('input'));assert.equal(w.document.querySelectorAll('[data-room-meter]').length,1);w.document.querySelector('[data-room-meter="EM000020"]').click();
 w.document.querySelector('.close').click();assert.equal(w.localStorage.getItem(model.key),null);dom.window.close();
});
test('room binds one of each type; same meter is rejected in another room; unbinding keeps history',()=>{
 const dom=boot(),w=dom.window;w.document.querySelector('#add-room').click();fill(w);
 for(const [type,id] of [['electric','EM000020'],['water','WM000020']]){w.document.querySelector(`[data-room-pick="${type}"]`).click();const input=w.document.querySelector('#room-picker-search');input.value=id;input.dispatchEvent(new w.Event('input'));w.document.querySelector(`[data-room-meter="${id}"]`).click();}
 submit(w);let d=data(w),r=d.rooms.find(r=>r.number==='201');assert.equal(r.electricId,'EM000020');assert.equal(r.waterId,'WM000020');
 const devices=[{id:'EM000020',type:'electric'},{id:'WM000020',type:'water'}];assert.throws(()=>model.save({...r,number:'202'},d,devices),/已关联/);
 w.roomForm(r.id);w.document.querySelector('[data-room-unbind="electric"]').click();submit(w);d=data(w);r=d.rooms.find(x=>x.id===r.id);assert.equal(r.electricId,'');assert.equal(r.waterId,'WM000020');assert.ok(r.bindings.find(b=>b.meterId==='EM000020').to);dom.window.close();
});
test('invalid area, duplicate room and missing occupied contact do not save',()=>{
 const dom=boot(),w=dom.window;w.document.querySelector('#add-room').click();const f=fill(w,{floor:'1',number:'101'});submit(w);assert.match(w.document.querySelector('#room-form-error').textContent,/不能重复/);
 f.elements.number.value='999';f.elements.area.value='0';submit(w);assert.match(w.document.querySelector('#room-form-error').textContent,/面积/);
 f.elements.area.value='25';f.elements.occupancy.value='occupied';submit(w);assert.match(w.document.querySelector('#room-form-error').textContent,/租户姓名/);assert.equal(w.localStorage.getItem(model.key),null);dom.window.close();
});
test('filtering, paging, empty results and navigation preserve existing pages',()=>{
 const dom=boot(),w=dom.window;assert.equal(w.document.querySelectorAll('.rooms-table tbody tr').length,10);w.document.querySelector('[data-room-page="2"]').click();assert.equal(w.document.querySelectorAll('.rooms-table tbody tr').length,2);
 const input=w.document.querySelector('#room-search');input.value='不存在的房间';input.dispatchEvent(new w.Event('input'));assert.match(w.document.querySelector('#room-table').textContent,/没有匹配/);
 w.document.querySelector('[data-page="electric"]').click();assert.match(w.document.querySelector('h1').textContent,/电表管理/);w.document.querySelector('[data-page="rooms"]').click();assert.match(w.document.querySelector('h1').textContent,/房间管理/);dom.window.close();
});
test('local storage failure reports error and does not claim saving or replace state',()=>{
 const dom=boot(),w=dom.window;w.document.querySelector('#add-room').click();fill(w);w.Storage.prototype.setItem=function(){throw new Error('模拟存储空间不足');};submit(w);assert.match(w.document.querySelector('#room-form-error').textContent,/存储空间不足/);assert.ok(w.document.querySelector('#room-form'));assert.equal(w.localStorage.getItem(model.key),null);dom.window.close();
});
test('a newly added device stays available when its room binding is reloaded',()=>{
 const dom=boot(),w=dom.window;const script=w.document.createElement('script');script.textContent=`devices.push({id:'EM002001',index:2001,type:'electric',name:'新增演示电表',building:'A栋',location:'2F',address:'100000002001',model:'演示型号',online:true,readBase:0,added:true});`;w.document.body.appendChild(script);
 w.document.querySelector('#add-room').click();fill(w);w.document.querySelector('[data-room-pick="electric"]').click();const input=w.document.querySelector('#room-picker-search');input.value='EM002001';input.dispatchEvent(new w.Event('input'));w.document.querySelector('[data-room-meter="EM002001"]').click();submit(w);
 const saved=w.localStorage.getItem(model.key);const record=data(w).rooms.find(r=>r.number==='201');assert.equal(record.electricId,'EM002001');dom.window.close();
 const next=boot(saved);next.window.roomForm(record.id);assert.match(next.window.document.querySelector('#room-selected-electric').textContent,/EM002001/);assert.doesNotMatch(next.window.document.querySelector('#room-selected-electric').textContent,/缺失/);next.window.close();
});
test('corrupt stored data is preserved and saving is blocked',()=>{
 const dom=boot('{broken'),w=dom.window;assert.match(w.document.querySelector('#main').textContent,/本地存储异常/);w.document.querySelector('#add-room').click();fill(w);submit(w);assert.equal(w.localStorage.getItem(model.key),'{broken');assert.match(w.document.querySelector('#room-form-error').textContent,/暂停保存/);dom.window.close();
});
