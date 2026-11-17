'use strict';
/* Pure room-domain rules shared by the prototype and its checks. */
(function(root){
 const key='meter-platform-rooms-v1';
 function validate(input,rooms,devices,editingId){
  const r={};for(const k of ['building','floor','number','area','tenant','phone','occupancy','electricId','waterId','remark'])r[k]=String(input[k]??'').trim();
  r.building=r.building.split(' · ')[0];r.floor=r.floor.toUpperCase();r.number=r.number.toUpperCase();
  if(/^\d+(F|层|楼)?$/.test(r.floor))r.floor=String(parseInt(r.floor,10))+'F';
  if(/^B\d+$/.test(r.floor))r.floor='B'+String(parseInt(r.floor.slice(1),10));
  if(!r.building||!r.floor||!r.number)throw Error('请填写楼栋、楼层和房号');
  if(r.floor.length>12||r.number.length>20||r.tenant.length>40||r.remark.length>500)throw Error('字段长度超出限制');
  if(!r.area||!/^\d+(\.\d{1,2})?$/.test(r.area)||+r.area<=0||+r.area>1000000)throw Error('面积须大于0，最多两位小数');
  if(!['vacant','occupied','departed'].includes(r.occupancy))throw Error('入住状态无效');
  if(r.occupancy==='occupied'&&(!r.tenant||!r.phone))throw Error('已入住房间必须填写租户姓名和手机号');
  if((r.tenant&&!r.phone)||(!r.tenant&&r.phone))throw Error('租户姓名和手机号请一起填写');
  if(r.phone&&!/^1[3-9]\d{9}$/.test(r.phone))throw Error('请输入有效的11位手机号');
  if(rooms.some(x=>x.id!==editingId&&x.building===r.building&&x.floor===r.floor&&x.number===r.number))throw Error('同楼栋、同楼层的房号不能重复');
  for(const type of ['electric','water']){
   const id=r[type+'Id'];if(!id)continue;
   if(!devices.some(d=>d.id===id&&d.type===type))throw Error('关联设备不存在或类型不匹配');
   const owner=rooms.find(x=>x.id!==editingId&&x[type+'Id']===id);
   if(owner)throw Error(`设备 ${id} 已关联 ${owner.building} / ${owner.floor} / ${owner.number}`);
  }
  return r;
 }
 function save(input,data,devices,editingId,now=new Date().toISOString()){
  const r=validate(input,data.rooms,devices,editingId),old=data.rooms.find(x=>x.id===editingId);
  if(editingId&&!old)throw Error('房间已不存在');
  const id=old?.id||'RM'+String(data.nextId).padStart(6,'0');
  const bindings=(old?.bindings||[]).map(x=>({...x}));
  for(const type of ['electric','water'])if(old?.[type+'Id']&&!bindings.some(b=>b.type===type&&!b.to))bindings.push({type,meterId:old[type+'Id'],from:old.createdAt||now,to:null});
  for(const type of ['electric','water'])if((old?.[type+'Id']||'')!==r[type+'Id']){
   for(const b of bindings)if(b.type===type&&!b.to)b.to=now;
   if(r[type+'Id'])bindings.push({type,meterId:r[type+'Id'],from:now,to:null});
  }
  const room={...r,id,createdAt:old?.createdAt||now,updatedAt:now,bindings};
  return {...data,nextId:old?data.nextId:data.nextId+1,rooms:old?data.rooms.map(x=>x.id===id?room:x):[room,...data.rooms]};
 }
 function seed(buildings){return {version:1,nextId:13,rooms:Array.from({length:12},(_,i)=>({id:'RM'+String(i+1).padStart(6,'0'),building:buildings[Math.floor(i/3)+1],floor:'1F',number:String(101+i%3),area:String(32+i*3),tenant:i%3===0?'演示租户'+(i+1):'',phone:i%3===0?'1380000'+String(i+1).padStart(4,'0'):'',occupancy:i%3===0?'occupied':'vacant',electricId:i%3!==2?'EM'+String(Math.floor(i/3)*500+i%3+1).padStart(6,'0'):'',waterId:i%3===0?'WM'+String(Math.floor(i/3)*500+1).padStart(6,'0'):'',remark:'模拟房间，可编辑验证',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),bindings:[]})),deviceSnapshots:[]};}
 function load(storage,buildings){const text=storage.getItem(key);if(!text)return seed(buildings);const data=JSON.parse(text);if(data.version!==1||!Array.isArray(data.rooms)||!Number.isInteger(data.nextId))throw Error('房间本地数据格式不支持，请保留原数据后排查');data.rooms=data.rooms.map(({name,status,...room})=>({...room,building:String(room.building||'').split(' · ')[0]}));data.deviceSnapshots=(data.deviceSnapshots||[]).map(d=>({...d,building:String(d.building||'').split(' · ')[0]}));return data;}
 const api={key,validate,save,seed,load};root.RoomModel=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
