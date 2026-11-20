const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const test=require('node:test');
const {JSDOM}=require('jsdom');
const prototypeDir=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(prototypeDir,'index.html'),'utf8');
function boot(savedBusiness,savedUsers){
 const dom=new JSDOM(html,{url:'http://localhost/#users',runScripts:'outside-only'}),window=dom.window;
 window.scrollTo=()=>{};
 if(savedBusiness)window.localStorage.setItem('meter-business-prototype-two-devices-v3',JSON.stringify(savedBusiness));
 if(savedUsers)window.localStorage.setItem('meter-business-prototype-admin-users-v1',JSON.stringify(savedUsers));
 const run=source=>vm.runInContext(source,dom.getInternalVMContext());
 for(const match of html.matchAll(/<script src="([^"]+)"/g))run(fs.readFileSync(path.join(prototypeDir,match[1].split('?')[0]),'utf8'));
 run('clearInterval(simulationTimer);let testTime=Date.now();Date.now=()=>testTime');
 return {window,run,close:()=>window.close()};
}
function newMaintainer(run,permissions){return JSON.parse(run(`JSON.stringify(saveMaintainer({username:'ops_test',name:'维护测试',role:'super',permissions:${JSON.stringify(permissions)}}))`))}
test('only the built-in super administrator can create maintainers or change grants',()=>{
 const app=boot(),{run,window}=app;
 try{
  assert.equal(run('backendUsers.users.length'),1);
  assert.equal(run("toggleMaintainer('admin')"),false);
  assert.throws(()=>run("saveMaintainer({username:'root',name:'root',permissions:[]},'admin')"),/内置/);
  const user=newMaintainer(run,['electric:list','electric:remove','water:list','water:valve_close','tasks:list','super']);
  assert.equal(user.role,'maintainer');assert(!user.permissions.includes('super'));
  run(`switchBackendUser('${user.id}')`);
  assert.equal(run('isSuperAdmin()'),false);
  assert.equal(run("saveMaintainer({username:'another',name:'another',permissions:[]})"),false);
  assert.equal(run('backendUsers.users.length'),2);
  assert(window.document.querySelector('[data-page="users"]').hidden);
  assert(window.document.querySelector('[data-page="apps"]').hidden);
  run("navigate('users')");assert.notEqual(run('state.page'),'users');
 }finally{app.close()}
});
test('button grants and submission guards independently restrict power and valve actions',()=>{
 const app=boot(),{run,window}=app;
 try{
  const user=newMaintainer(run,['electric:list','electric:off','water:list','water:valve_close','tasks:list']);
  run(`switchBackendUser('${user.id}')`);
  assert.equal(window.document.querySelector('[data-device-operation="off"]').hidden,false);
  assert.equal(window.document.querySelector('[data-device-operation="on"]').hidden,true);
  assert.equal(run("createTask(devices[0],'on','后台操作')"),null);
  assert.equal(run("createTask(devices[0],'on','第三方应用')"),null);
  const count=run('data.tasks.length');run("operationDialog(demoCodes.electric,'on')");assert.equal(run('data.tasks.length'),count);
  run("navigate('water')");
  assert.equal(window.document.querySelector('[data-device-operation="valve_open"]').hidden,true);
  assert.equal(window.document.querySelector('[data-device-operation="valve_close"]').hidden,false);
  run("operationDialog(demoCodes.water,'valve_close')");window.document.querySelector('#confirm-action').click();
  assert.equal(run('data.tasks[0].operatorId'),user.id);
  run('testTime+=8000;refreshTaskSimulation()');
  assert.equal(run('data.tasks[0].status'),'success');
  assert.equal(run('data.tasks[0].attempts.length'),1);
  assert.equal(run('data.tasks[0].attempts[0].exchanges.length'),1);
  assert.equal(run('devices.find(d=>d.type===\'water\').valve'),'closed');
 }finally{app.close()}
});
test('device removal keeps history, blocks bound devices and remains removed after refresh',()=>{
 const app=boot(),{run,window}=app;
 try{
  const user=newMaintainer(run,['electric:list','electric:add','electric:remove','water:list','water:add','water:remove','tasks:list']);
  run(`switchBackendUser('${user.id}');roomData.rooms[0].electricId=demoCodes.electric`);
  assert.equal(run('removeDevice(demoCodes.electric)'),false);
  run("roomData.rooms[0].electricId=''");const historyCount=run('data.tasks.length');
  run('removeDevice(demoCodes.electric)');window.document.querySelector('#confirm-action').click();
  assert.equal(run('devices.some(d=>d.type===\'electric\')'),false);
  assert.equal(run('data.tasks.length'),historyCount);
  const saved=JSON.parse(window.localStorage.getItem('meter-business-prototype-two-devices-v3'));
  const users=JSON.parse(window.localStorage.getItem('meter-business-prototype-admin-users-v1'));
  const reload=boot(saved,users);try{assert.equal(reload.run('devices.some(d=>d.type===\'electric\')'),false);assert.equal(reload.run('currentOperator.id'),user.id)}finally{reload.close()}
  run('deviceForm()');window.document.querySelector('[name="name"]').value='重新添加电表';window.document.querySelector('[name="address"]').value='202607310749';
  window.document.querySelector('#device-form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));
  assert.equal(run('devices.find(d=>d.type===\'electric\').id'),'202607310749');
  assert.equal(run('devices.find(d=>d.type===\'electric\').createdBy'),user.id);
  assert.equal(run('!!data.deletedDevices[demoCodes.electric]'),false);
 }finally{app.close()}
});
test('an administrator form cannot be submitted after switching to a maintainer',()=>{
 const app=boot(),{run,window}=app;
 try{
  const user=newMaintainer(run,['electric:list']);
  run(`maintainerForm('${user.id}')`);const form=window.document.querySelector('#maintainer-form'),submit=form.onsubmit;
  form.querySelector('[name="name"]').value='未授权修改';
  run(`switchBackendUser('${user.id}')`);submit({preventDefault(){},currentTarget:form});
  assert.equal(run(`backendUsers.users.find(u=>u.id==='${user.id}').name`),'维护测试');
  assert.equal(run("toggleMaintainer('admin')"),false);
 }finally{app.close()}
});
