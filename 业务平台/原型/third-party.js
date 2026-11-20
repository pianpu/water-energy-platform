'use strict';

const readScopes=['meter.read','electricity.read','water.read'];
const scopes={
 'meter.read':'设备查询','electricity.read':'用电量查询','water.read':'用水量查询',
 'electricity.poll':'电表主动抄表','water.poll':'水表主动抄表',
 'electricity.power.on':'电表通电','electricity.power.off':'电表断电',
 'water.valve.open':'水表开阀','water.valve.close':'水表关阀'
};
const appOperations={
 electric_read:{type:'electric',operation:'read',scope:'electricity.poll',label:'电表主动抄表',path:'read-tasks'},
 water_read:{type:'water',operation:'read',scope:'water.poll',label:'水表主动抄表',path:'read-tasks'},
 on:{type:'electric',operation:'on',scope:'electricity.power.on',label:'电表通电',path:'power-on-tasks'},
 off:{type:'electric',operation:'off',scope:'electricity.power.off',label:'电表断电',path:'power-off-tasks'},
 valve_open:{type:'water',operation:'valve_open',scope:'water.valve.open',label:'水表开阀（通水）',path:'valve-open-tasks'},
 valve_close:{type:'water',operation:'valve_close',scope:'water.valve.close',label:'水表关阀（断水）',path:'valve-close-tasks'}
};
function appDeviceAllowed(app,device){return app.building==='全部位置'||(roomFor(device.id)?.building||device.building)===app.building}
function submitThirdPartyTask(appId,deviceId,action,idempotencyKey){
 const app=data.apps.find(a=>a.id===appId),d=devices.find(d=>d.id===deviceId),op=appOperations[action];
 if(!app?.enabled)throw Error('应用不存在或已停用');
 if(!op||!d||d.type!==op.type)throw Error('设备类型与操作不匹配');
 if(!app.scopes.includes(op.scope))throw Error('应用没有“'+op.label+'”权限');
 if(!appDeviceAllowed(app,d))throw Error('设备不在此应用的授权范围内');
 if(!data.integration.enabled)throw Error('采集服务对接已停用');
 const key=String(idempotencyKey||'').trim();if(!key||key.length>128)throw Error('请填写1–128位幂等键');
 const existing=data.tasks.find(t=>t.appId===appId&&t.idempotencyKey===key);
 if(existing){if(existing.deviceId!==deviceId||existing.operation!==op.operation)throw Error('幂等键已用于另一设备或操作');return existing}
 if(data.tasks.some(t=>t.deviceId===deviceId&&['queued','sent','verifying','retry_wait'].includes(t.status)))throw Error('该设备已有任务正在执行，请稍后重试');
 if(op.operation!=='read'&&data.tasks.some(t=>t.deviceId===deviceId&&t.operation!=='read'&&t.status==='unknown'))throw Error('设备存在结果未确认的控制任务，请先核实实际状态');
 const task={...makeTask(d,op.operation,'第三方应用'),appId:app.id,appName:app.name,appKey:app.key,originScope:op.scope,idempotencyKey:key};
 if(!commit(next=>{next.tasks.unshift(task);const application=next.apps.find(a=>a.id===appId);application.calls=(application.calls||0)+1;next.appCallLogs=next.appCallLogs||[];next.appCallLogs.unshift({appId,at:nowText(),method:'POST',path:'/openapi/v1/meters/'+d.id+'/'+op.path,status:202,taskId:task.id,operation:op.label});}))throw Error('任务保存失败');
 return task;
}
function thirdPartyTaskResult(appId,taskId){
 const app=data.apps.find(a=>a.id===appId),task=data.tasks.find(t=>t.id===taskId&&t.appId===appId),d=devices.find(d=>d.id===task?.deviceId);
 if(!app?.enabled||!task||!d||!app.scopes.includes(task.originScope)||!appDeviceAllowed(app,d))throw Error('任务不存在或当前应用无权查看');
 return {taskId:task.id,deviceCode:task.deviceId,operation:taskOperationName(task),status:task.status,createdAt:task.createdAt,successAt:task.successAt,resultReading:task.resultReading||null,resultState:task.resultState||null,error:task.status==='success'?null:task.note};
}
function appCallForm(appId){
 const app=data.apps.find(a=>a.id===appId);if(!app)return;
 modal('模拟第三方调用',`<form id="app-call-form"><div class="form-grid"><label class="field full">应用<input readonly value="${esc(app.name)} / ${esc(app.key)}"></label><label class="field">执行操作<select id="app-call-action" name="action">${Object.entries(appOperations).map(([k,v])=>`<option value="${k}">${v.label}${app.scopes.includes(v.scope)?'':' · 未授权'}</option>`).join('')}</select></label><label class="field">设备编码<select id="app-call-device" name="deviceId"></select></label><label class="field full">幂等键<input name="idempotencyKey" required maxlength="128" value="demo-${Date.now().toString(36)}-${randomHex(3)}"></label></div><div class="form-note">模拟应用权限、数据范围、任务受理与执行结果；同一幂等键重复提交返回同一任务。所有操作只修改本地演示数据，不发送实际TCP指令。</div><div id="app-call-error" class="form-error" role="alert"></div></form>`,btn('取消','data-close')+btn('模拟提交','form="app-call-form" type="submit"',true));
 const choices=()=>{const op=appOperations[$('#app-call-action').value];$('#app-call-device').innerHTML=devices.filter(d=>d.type===op.type).map(d=>`<option value="${esc(d.id)}">${esc(d.id)} · ${d.type==='water'?'水表':'电表'}</option>`).join('')};choices();$('#app-call-action').onchange=choices;
 $('#app-call-form').onsubmit=event=>{event.preventDefault();const v=Object.fromEntries(new FormData(event.currentTarget));try{const task=submitThirdPartyTask(appId,v.deviceId,v.action,v.idempotencyKey);render();modal('模拟请求已受理',`<div class="detail-grid"><div><span>任务编号</span><b>${esc(task.id)}</b></div><div><span>来源应用</span><b>${esc(app.name)}</b></div><div><span>执行操作</span><b>${taskOperationName(task)}</b></div><div><span>设备编码</span><b>${esc(task.deviceId)}</b></div></div><p class="form-note">受理不等于执行成功。任务详情会继续更新发送、响应及最终结果；控制不自动重试。</p>`,btn('关闭','data-close')+btn('查看任务','id="app-call-task"',true));$('#app-call-task').onclick=()=>taskDetail(task.id);}catch(error){$('#app-call-error').textContent=error.message}};
}
function thirdPartyApiDocs(){
 const queries=[['meter.read','/openapi/v1/meters','设备列表'],['meter.read','/openapi/v1/meters/{id}','设备详情'],['electricity.read','/openapi/v1/meters/{id}/electricity','已保存的用电量'],['water.read','/openapi/v1/meters/{id}/water','已保存的用水量']];
 modal('开放接口说明',`<p class="form-note">第三方应用按权限查询设备及用量，也可主动抄表、控制电表通断电和水表开关阀。原型只演示交互，以下HTTP接口为开发契约。</p><div class="endpoint"><b>POST</b> /oauth2/token<span class="subtext">appKey / appSecret换取应用令牌</span></div><div class="detail-title">数据查询</div>${queries.map(([scope,path,label])=>`<div class="endpoint"><b>GET</b> ${path}<span class="subtext">${label} · ${scope}</span></div>`).join('')}<div class="detail-title">主动抄表与控制</div>${Object.values(appOperations).map(op=>`<div class="endpoint"><b>POST</b> /openapi/v1/meters/{id}/${op.path}<span class="subtext">${op.label} · ${op.scope}</span></div>`).join('')}<div class="endpoint"><b>GET</b> /openapi/v1/tasks/{taskId}<span class="subtext">只查询本应用创建且当前仍有操作权限的任务，随对应操作权限授权</span></div><div class="note-bar soft">${ico('info')}操作提交带Idempotency-Key，返回202及taskId；结果查询区分受理、发送、成功、失败和结果未确认。控制不自动重试。电表短确认后读回核验；水表依据05状态应答判断目标阀状态。</div><p class="form-note">现有解析端已具备水表05开关阀；其最新版本禁用了水表主动抄表，正式对接water.poll前需恢复受控主动读表能力。普通数据查询仍只读已保存数据。</p>`,btn('关闭','data-close'),true);
}
