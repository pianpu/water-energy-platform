'use strict';

const backendPermissionGroups=[
 {label:'电表台账',items:[['electric:list','查看电表'],['electric:add','新增电表'],['electric:edit','编辑电表'],['electric:remove','删除电表'],['electric:read','电表抄表'],['electric:on','电表通电'],['electric:off','电表断电'],['electric:export','导出电表']]},
 {label:'水表台账',items:[['water:list','查看水表'],['water:add','新增水表'],['water:edit','编辑水表'],['water:remove','删除水表'],['water:read','水表抄表'],['water:valve_open','水表开阀'],['water:valve_close','水表关阀'],['water:export','导出水表']]},
 {label:'房间与用量',items:[['rooms:list','查看房间'],['rooms:edit','编辑及关联房间'],['usage:list','查看用量'],['usage:export','导出用量']]},
 {label:'记录、告警与看板',items:[['tasks:list','查看操作记录'],['tasks:export','导出操作记录'],['alarms:list','查看告警'],['alarms:ack','确认告警'],['dashboard:list','查看看板'],['dashboard:export','导出日报']]}
];
const backendPermissionLabels=Object.fromEntries(backendPermissionGroups.flatMap(g=>g.items));
const defaultMaintainerPermissions=['electric:list','water:list','electric:add','electric:remove','water:add','water:remove','tasks:list','usage:list'];
const USER_STORAGE_KEY='meter-business-prototype-admin-users-v1';
const builtinSuperAdmin={id:'admin',username:'admin',name:'超级管理员',role:'super',enabled:true,builtin:true,permissions:[]};
let backendUsers,backendUserStorageError='';
function initBackendUsers(){
 try{const raw=localStorage.getItem(USER_STORAGE_KEY);backendUsers=raw?JSON.parse(raw):{version:1,currentId:'admin',users:[],audit:[]};if(backendUsers.version!==1||!Array.isArray(backendUsers.users))throw Error('账号数据格式错误');backendUsers.users=[{...builtinSuperAdmin},...backendUsers.users.filter(u=>u.id!=='admin').map(u=>({...u,role:'maintainer',builtin:false,permissions:(u.permissions||[]).filter(p=>Object.hasOwn(backendPermissionLabels,p))}))];backendUsers.audit=backendUsers.audit||[];}catch(error){backendUserStorageError='账号存储读取失败，已暂停账号保存';backendUsers={version:1,currentId:'admin',users:[{...builtinSuperAdmin}],audit:[]};}
 syncBackendOperator();
}
function backendUser(){return backendUsers?.users.find(u=>u.id===backendUsers.currentId)||null}
function isSuperAdmin(){const u=backendUser();return !!u&&u.enabled&&u.id==='admin'&&u.builtin===true}
function hasBackendPermission(code){const u=backendUser();return isSuperAdmin()||!!u?.enabled&&(u.permissions||[]).includes(code)}
function requireBackendPermission(code){if(hasBackendPermission(code))return true;toast('当前账号没有“'+(backendPermissionLabels[code]||'此操作')+'”权限');return false}
function requireSuperAdmin(){if(isSuperAdmin())return true;toast('只有超级管理员可以执行此操作');return false}
function syncBackendOperator(){const u=backendUser();currentOperator={id:u?.id||'',name:u?.name||'未选择账号'};const name=document.querySelector('#current-user-name');if(name)name.textContent=u?(u.role==='super'?'超级管理员':u.name+' · 维护人员'):'请选择演示账号';}
function backendPagePermission(page){return ['users','apps','plans','integration'].includes(page)?'super':page+':list'}
function canBackendPage(page){const code=backendPagePermission(page);return code==='super'?isSuperAdmin():hasBackendPermission(code)}
function firstBackendPage(){return ['electric','water','tasks','usage','rooms','alarms','dashboard','users'].find(canBackendPage)||null}
function saveBackendUsers(next){if(backendUserStorageError)throw Error(backendUserStorageError);localStorage.setItem(USER_STORAGE_KEY,JSON.stringify(next));backendUsers=next;syncBackendOperator()}
function normalizeBackendPermissions(values){const set=new Set(values.filter(p=>Object.hasOwn(backendPermissionLabels,p)));for(const type of ['electric','water','rooms','usage','tasks','alarms','dashboard'])if([...set].some(p=>p.startsWith(type+':')&&p!==type+':list'))set.add(type+':list');return [...set]}
function saveMaintainer(values,id){
 if(!requireSuperAdmin())return false;if(id==='admin')throw Error('内置超级管理员不可修改或删除');
 const old=id?backendUsers.users.find(u=>u.id===id):null;if(id&&!old)throw Error('维护人员不存在');
 const username=String(values.username||'').trim(),name=String(values.name||'').trim();if(!/^[A-Za-z0-9_]{3,32}$/.test(username)||!name||name.length>40)throw Error('账号填写3–32位字母、数字或下划线，姓名1–40字');
 if(backendUsers.users.some(u=>u.id!==id&&u.username.toLowerCase()===username.toLowerCase()))throw Error('登录账号已存在');
 if(old&&old.username!==username)throw Error('已创建的登录账号不能修改');
 const user={id:old?.id||'USER'+Date.now().toString(36)+randomHex(3),username,name,role:'maintainer',builtin:false,enabled:values.enabled!==false,permissions:normalizeBackendPermissions(values.permissions||[]),createdAt:old?.createdAt||nowText()};
 const next=JSON.parse(JSON.stringify(backendUsers));if(old)next.users=next.users.map(u=>u.id===id?user:u);else next.users.push(user);next.audit.unshift({at:nowText(),actor:currentOperator.name,action:(old?'修改维护人员':'新增维护人员')+' '+username});saveBackendUsers(next);return user;
}
function toggleMaintainer(id){if(!requireSuperAdmin())return false;if(id==='admin'){toast('内置超级管理员不可停用');return false}const u=backendUsers.users.find(u=>u.id===id);if(!u)return false;return saveMaintainer({...u,enabled:!u.enabled},id)}
function switchBackendUser(id){const target=backendUsers.users.find(u=>u.id===id&&u.enabled);if(!target){toast('账号不存在或已停用');return false}const next={...backendUsers,currentId:id};try{saveBackendUsers(next);document.querySelector('.close')?.click();navigate(firstBackendPage()||'electric');toast('已切换演示账号：'+target.name);return true}catch(error){toast(error.message);return false}}
function backendIdentityForm(){modal('切换演示账号',`<form id="identity-form"><label class="field">演示账号<select name="userId">${backendUsers.users.filter(u=>u.enabled).map(u=>`<option value="${esc(u.id)}" ${u.id===backendUsers.currentId?'selected':''}>${esc(u.name)} / ${esc(u.username)} · ${u.role==='super'?'超级管理员':'维护人员'}</option>`).join('')}</select></label><p class="form-note">用于体验后台菜单及按钮权限；这是本地演示身份切换，正式系统使用若依登录与服务端鉴权。</p></form>`,btn('取消','data-close')+btn('切换账号','form="identity-form" type="submit"',true));$('#identity-form').onsubmit=e=>{e.preventDefault();switchBackendUser(new FormData(e.currentTarget).get('userId'))}}
function usersPage(){if(!isSuperAdmin())return header('无访问权限','只有超级管理员可以管理维护人员。');return header('后台管理员','内置超级管理员负责添加维护人员，并为每位人员配置具体按钮权限。',btn('添加维护人员','data-add-maintainer',true,'plus'),'ADMINISTRATOR MANAGEMENT')+`${backendUserStorageError?`<div class="note-bar warn">${esc(backendUserStorageError)}</div>`:''}<div class="note-bar soft">${ico('info')}内置账号 admin 为唯一超级管理员，不可删除、停用或降级。维护人员不能创建账号或修改自己的授权。</div><section class="panel"><div class="table-wrap"><table><thead><tr><th>登录账号 / 姓名</th><th>角色</th><th>状态</th><th>按钮权限</th><th>操作</th></tr></thead><tbody>${backendUsers.users.map(u=>`<tr><td><b>${esc(u.username)}</b><span class="subtext">${esc(u.name)}</span></td><td>${badge(u.role==='super'?'超级管理员':'维护人员',u.role==='super'?'blue':'')}</td><td>${badge(u.enabled?'启用':'停用',u.enabled?'':'neutral')}</td><td class="admin-permissions-cell">${u.role==='super'?'全部菜单和按钮':u.permissions.map(p=>`<span class="scope-tag">${backendPermissionLabels[p]}</span>`).join('')||'尚未授权'}</td><td>${u.builtin?'<span class="muted">内置账号</span>':`<div class="inline-actions"><button class="text-button" data-edit-maintainer="${u.id}">编辑 / 授权</button><button class="text-button" data-toggle-maintainer="${u.id}">${u.enabled?'停用':'启用'}</button></div>`}</td></tr>`).join('')}</tbody></table></div></section><p class="form-note">原型通过右上角“切换演示账号”体验不同权限；账号及授权保存在当前浏览器。</p>`}
function maintainerForm(id){
 if(!requireSuperAdmin())return;const old=backendUsers.users.find(u=>u.id===id);if(id==='admin'){toast('内置超级管理员不可编辑');return}const permissions=old?.permissions||defaultMaintainerPermissions;
 modal(old?'编辑维护人员 / 按钮授权':'添加维护人员',`<form id="maintainer-form"><div class="form-grid"><label class="field">登录账号 *<input name="username" required pattern="[A-Za-z0-9_]{3,32}" maxlength="32" value="${esc(old?.username||'')}" ${old?'readonly':''}></label><label class="field">姓名 *<input name="name" required maxlength="40" value="${esc(old?.name||'')}"></label><label class="field">角色<input readonly value="维护人员"></label><label class="field">账号状态<select name="enabled"><option value="true" ${old?.enabled!==false?'selected':''}>启用</option><option value="false" ${old?.enabled===false?'selected':''}>停用</option></select></label></div><div class="detail-title">按钮权限</div>${backendPermissionGroups.map(g=>`<section class="permission-group"><b>${g.label}</b><div class="check-grid">${g.items.map(([code,label])=>`<label><input name="permission" type="checkbox" value="${code}" ${permissions.includes(code)?'checked':''}>${label}</label>`).join('')}</div></section>`).join('')}<div class="form-error" id="maintainer-error" role="alert"></div><p class="form-note">新增/删除、编辑、抄表、通电、断电、开阀、关阀分别授权；操作权限会包含对应列表查看权限。后台管理员、第三方应用、采集计划和对接配置仅超级管理员可维护。</p></form>`,btn('取消','data-close')+btn('保存人员与权限','form="maintainer-form" type="submit"',true),true);
 $('#maintainer-form').onsubmit=e=>{e.preventDefault();if(!requireSuperAdmin())return;const v=new FormData(e.currentTarget);try{if(saveMaintainer({username:v.get('username'),name:v.get('name'),enabled:v.get('enabled')==='true',permissions:v.getAll('permission')},id)){$('.close').click();render();toast('维护人员及按钮权限已保存')}}catch(error){$('#maintainer-error').textContent=error.message}};
}
function backendButtonPermission(el){
 if(el.dataset.addMaintainer!==undefined||el.dataset.editMaintainer||el.dataset.toggleMaintainer)return 'super';
 if(el.dataset.removeDevice){const d=devices.find(d=>d.id===el.dataset.removeDevice);return (d?.type||state.type)+':remove'}
 if(el.dataset.deviceOperation){const d=devices.find(d=>d.id===el.dataset.operationDevice);return (d?.type||state.type)+':'+el.dataset.deviceOperation}
 if(el.dataset.editDevice){const d=devices.find(d=>d.id===el.dataset.editDevice);return (d?.type||state.type)+':edit'}
 if(el.dataset.poll){const d=devices.find(d=>d.id===el.dataset.poll);return (d?.type||state.type)+':read'}
 if(el.dataset.deviceDetail||el.dataset.detail){const d=devices.find(d=>d.id===(el.dataset.deviceDetail||el.dataset.detail));return (d?.type||state.type)+':list'}
 if(el.dataset.taskDetail)return 'tasks:list';if(el.dataset.usageDetail)return 'usage:list';
 if(el.dataset.roomEdit||el.id==='add-room'||el.id==='room-detail-edit')return 'rooms:edit';if(el.dataset.roomDetail)return 'rooms:list';
 if(el.dataset.alarmDetail)return 'alarms:list';if(el.id==='ack-alarm')return 'alarms:ack';
 if(el.dataset.planEdit||el.dataset.planRun||el.dataset.planToggle||el.dataset.appEdit||el.dataset.appToggle||el.dataset.appLog||el.dataset.appCall)return 'super';
 if(el.dataset.action){const map={'add-device':state.type+':add','export-devices':state.type+':export','export-usage':'usage:export','export-dashboard':'dashboard:export','export-tasks':'tasks:export','add-plan':'super','add-app':'super','api-docs':'super','edit-integration':'super','check-integration':'super'};return map[el.dataset.action]||null}
 if(el.dataset.permission)return el.dataset.permission;
 return null;
}
function backendButtonAllowed(el){const code=backendButtonPermission(el);return !code||(code==='super'?isSuperAdmin():hasBackendPermission(code))}
function guardBackendButton(el){const code=backendButtonPermission(el);return !code||(code==='super'?requireSuperAdmin():requireBackendPermission(code))}
function applyBackendPermissions(){syncBackendOperator();document.querySelectorAll('[data-page]').forEach(el=>el.hidden=!canBackendPage(el.dataset.page));document.querySelectorAll('.nav-label').forEach(label=>{let next=label.nextElementSibling,visible=false;while(next&&!next.classList.contains('nav-label')){if(next.matches('[data-page]')&&!next.hidden)visible=true;next=next.nextElementSibling;}label.hidden=!visible;});document.querySelectorAll('button').forEach(el=>{if(backendButtonPermission(el))el.hidden=!backendButtonAllowed(el)});}
function removeDevice(id){
 const d=devices.find(d=>d.id===id);if(!d||!requireBackendPermission(d.type+':remove'))return false;
 if(roomFor(id)){toast('设备已关联房间，请先解除关联后再删除');return false}
 if(data.tasks.some(t=>t.deviceId===id&&['queued','sent','verifying','retry_wait','unknown'].includes(t.status))){toast('设备存在未完成或结果未确认的任务，暂不能删除');return false}
 confirmDialog('删除'+(d.type==='electric'?'电表':'水表'),`<p>设备编码：<b>${esc(d.id)}</b></p><p class="form-note">删除后从当前台账和采集计划中移除，历史用量、控制任务及原始收发记录继续保留。</p>`,()=>{if(!requireBackendPermission(d.type+':remove'))return false;if(!devices.some(x=>x.id===id)){toast('设备已删除');return false}if(roomFor(id)||data.tasks.some(t=>t.deviceId===id&&['queued','sent','verifying','retry_wait','unknown'].includes(t.status))){toast('设备状态已变化，请重新检查关联和任务');return false}if(!commit(next=>{next.deletedDevices=next.deletedDevices||{};next.deletedDevices[id]={...d,deletedAt:nowText(),deletedBy:currentOperator.id,deletedByName:currentOperator.name};}))return false;devices.splice(devices.findIndex(x=>x.id===id),1);render();toast('设备已移出当前台账，历史记录保留')},'确认删除');return true;
}
document.addEventListener('click',event=>{const el=event.target.closest('button');if(!el)return;if(el.id==='switch-backend-user')backendIdentityForm();if(el.dataset.addMaintainer!==undefined)maintainerForm();if(el.dataset.editMaintainer)maintainerForm(el.dataset.editMaintainer);if(el.dataset.toggleMaintainer){if(toggleMaintainer(el.dataset.toggleMaintainer))render();}if(el.dataset.removeDevice)removeDevice(el.dataset.removeDevice);if(el.dataset.deviceOperation)operationDialog(el.dataset.operationDevice,el.dataset.deviceOperation)});
