'use strict';

// Prototype history covers complete natural days; no TCP requests are made.
const HISTORY_START = '2026-09-01';
const HISTORY_END = '2026-11-14';

function datesBetween(start, end) {
  const days = Math.round((Date.parse(end + 'T00:00:00Z') - Date.parse(start + 'T00:00:00Z')) / 86400000) + 1;
  return Array.from({ length: Math.max(0, days) }, (_, i) => prevDate(start, -i));
}

function openDeviceHistory(id, replace = false) {
  const d = devices.find(d => d.id === id);
  if (!d) return;
  state.history = {
    id, start: prevDate(HISTORY_END, 29), end: HISTORY_END,
    page: 1, size: 10, quick: '30', returnScroll: window.scrollY
  };
  if (replace) {
    state.page = d.type;
    state.type = d.type;
    state.pageSize = 10;
  }
  history[replace ? 'replaceState' : 'pushState'](null, '', '#history/' + d.id);
  render();
  window.scrollTo(0, 0);
}

function historyRows() {
  const h = state.history, d = devices.find(d => d.id === h.id);
  return datesBetween(h.start, h.end).map(date => {
    const values = usage(d, date), end = reading(d, date);
    return { date, ...values, start: round(end - values.total), end, complete: true };
  });
}

function historyTotals(rows) {
  return rows.reduce((sum, r) => {
    if (r.complete) {
      sum.total = round(sum.total + r.total);
      sum.peak = round(sum.peak + (r.peak || 0));
      sum.flat = round(sum.flat + (r.flat || 0));
      sum.valley = round(sum.valley + (r.valley || 0));
      sum.max = Math.max(sum.max, r.total);
      sum.days++;
    }
    return sum;
  }, { total: 0, peak: 0, flat: 0, valley: 0, max: 0, days: 0 });
}

function deviceHistoryPage() {
  const h = state.history, d = devices.find(d => d.id === h.id);
  const electric = d.type === 'electric', unit = electric ? 'kWh' : 'm³';
  const rows = historyRows(), sums = historyTotals(rows);
  const average = sums.days ? sums.total / sums.days : 0;
  const cards = electric
    ? [['期间总用电量', sums.total, 'bolt', ''], ['峰期用电量', sums.peak, 'bolt', ''], ['平期用电量', sums.flat, 'clock', 'orange'], ['谷期用电量', sums.valley, 'clock', 'teal']]
    : [['期间总用水量', sums.total, 'drop', 'teal'], ['日均用水量', average, 'drop', 'teal'], ['单日最高用水量', sums.max, 'drop', 'orange'], ['完整记录天数', sums.days, 'calendar', 'purple']];

  return `<div class="history-back-row"><button class="text-button" id="history-back">← 返回${state.page === 'dashboard' ? '数据看板' : electric ? '电表列表' : '水表列表'}</button><span>设备管理 / ${electric ? '电表' : '水表'} / ${d.id} / 历史记录</span></div>` +
    header('设备历史记录', '以天为单位，查询这台设备的累计读数与每日使用量。',
      `<button class="btn" id="history-export">${ico('download')}导出历史记录</button>`, 'DEVICE HISTORY') +
    `<section class="panel history-device"><div class="history-device-title">${deviceCell(d)}${status(d)}<span class="badge">${electric ? '电表' : '水表'}档案</span></div><div class="history-device-fields">${[
      ['安装位置', d.building + ' / ' + d.location], ['设备型号', d.model], ['通信地址', d.address], ['历史记录范围', HISTORY_START + ' 至 ' + HISTORY_END]
    ].map(([k,v]) => `<div><span>${k}</span><b>${esc(v)}</b></div>`).join('')}</div></section>` +
    `<section class="panel history-filter"><div class="history-filter-top"><b>查询日期范围</b><div class="segmented">${[['7', '最近7天'], ['30', '最近30天'], ['month', '本月']].map(([key,label]) => `<button data-history-quick="${key}" class="${h.quick === key ? 'selected' : ''}">${label}</button>`).join('')}</div></div><form id="history-query" class="history-query"><label>开始日期<input type="date" name="start" aria-label="历史开始日期" min="${HISTORY_START}" max="${HISTORY_END}" value="${h.start}" required></label><span class="history-range-separator">至</span><label>结束日期<input type="date" name="end" aria-label="历史结束日期" min="${HISTORY_START}" max="${HISTORY_END}" value="${h.end}" required></label><button class="btn primary" type="submit">${ico('search')}查询记录</button><span class="history-query-help">可跨月查询 · 演示数据截至 ${HISTORY_END}</span></form></section>` +
    `<div class="history-range-title"><b>${h.start} — ${h.end}</b><span>共 ${rows.length} 天 · 日均${electric ? '用电' : '用水'} ${fmt(average)} ${unit} · 以下合计覆盖整个查询期间</span></div><div class="summary-grid history-summary">${cards.map(([label,value,icon,color],i) => stat(label, fmt(value, !electric && i === 3 ? 0 : 2), !electric && i === 3 ? '天' : unit, icon, color, i === 0 ? '每日使用量累加，不是累计表底数' : !electric && i === 3 ? '一天一条记录' : '按所选日期范围统计')).join('')}</div>` +
    `<section class="panel history-trend"><div class="panel-head"><div><div class="panel-title">每日${electric ? '用电' : '用水'}趋势</div><div class="panel-subtitle">${esc(d.name)} · 与下方每日记录使用同一查询范围</div></div><div class="legend">${electric ? '<span><i></i>峰期</span><span><i class="orange"></i>平期</span><span><i class="teal"></i>谷期</span>' : '<span><i class="teal"></i>日用水量</span>'}</div></div><div class="history-chart-scroll"><div class="trend-chart history-trend-chart">${trendChart(d, rows.map(r => r.date))}</div></div></section>` +
    `<section class="panel table-panel history-table-panel"><div class="panel-head"><div><div class="panel-title">每日历史记录 <span class="badge">${rows.length} 天</span></div><div class="panel-subtitle">一天一行 · 日期从新到旧 · 读数与使用量单位均为 ${unit}</div></div><span class="section-hint">日使用量 = 日末累计读数 − 日初累计读数</span></div><div id="history-table-area">${deviceHistoryTable(rows)}</div></section>` +
    `<div class="form-note history-footnote">${ico('info')}<span>日初为当日 00:00，日末为次日 00:00。${electric ? '峰、平、谷用电量相加等于日总用电量。' : '水表按自然日汇总，不区分峰平谷。'}当前离线状态不影响已保存的历史记录。当前演示记录均完整，正式采集中缺少读数的日期应标为“数据不完整”，不计为 0。</span></div>`;
}

function deviceHistoryTable(rows = historyRows()) {
  const h = state.history, d = devices.find(d => d.id === h.id), electric = d.type === 'electric';
  const pages = Math.max(1, Math.ceil(rows.length / h.size));
  h.page = Math.min(h.page, pages);
  const slice = [...rows].reverse().slice((h.page - 1) * h.size, h.page * h.size);
  const dates = rows.length ? `${rows[0].date} — ${rows.at(-1).date}` : '';
  return `<div class="table-wrap"><table class="history-daily-table"><thead><tr><th>统计日期</th><th>日初累计读数</th><th>日末累计读数</th>${electric ? '<th>峰期用电量</th><th>平期用电量</th><th>谷期用电量</th><th>日总用电量</th>' : '<th>日用水量</th>'}<th>数据状态</th><th>操作</th></tr></thead><tbody>${slice.map(r => `<tr><td class="history-date">${r.date}<small>${['周日','周一','周二','周三','周四','周五','周六'][new Date(r.date+'T00:00:00Z').getUTCDay()]}</small></td><td class="number">${fmt(r.start)}</td><td class="number">${fmt(r.end)}</td>${electric ? `<td class="number">${fmt(r.peak)}</td><td class="number">${fmt(r.flat)}</td><td class="number">${fmt(r.valley)}</td>` : ''}<td class="number history-total ${electric ? '' : 'water-total'}">${r.complete ? fmt(r.total) : '—'}</td><td><span class="status ${r.complete ? '' : 'warn'}">${r.complete ? '完整' : '数据不完整'}</span></td><td><button class="text-button" data-day-record="${r.date}">${electric ? '分时读数' : '采集读数'}</button></td></tr>`).join('') || '<tr><td colspan="9" class="empty">所选期间没有历史记录</td></tr>'}</tbody></table></div><div class="pagination"><span>共 ${rows.length} 条 · 第 ${h.page} / ${pages} 页 · ${dates}</span><div class="page-buttons"><select aria-label="历史记录每页条数" id="history-page-size">${[10,20,50].map(n => `<option value="${n}" ${n === h.size ? 'selected' : ''}>${n} 条 / 页</option>`).join('')}</select><button data-history-page="${h.page-1}" ${h.page === 1 ? 'disabled' : ''} aria-label="历史上一页">‹</button>${Array.from({length:pages},(_,i) => `<button data-history-page="${i+1}" class="${h.page === i+1 ? 'current' : ''}">${i+1}</button>`).join('')}<button data-history-page="${h.page+1}" ${h.page === pages ? 'disabled' : ''} aria-label="历史下一页">›</button></div></div>`;
}

function bindDeviceHistory() {
  $('#history-back').onclick = () => {
    const scroll = state.history.returnScroll;
    state.history = null;
    history.replaceState(null, '', '#' + state.page);
    render();
    window.scrollTo(0, scroll);
  };
  $('#history-query').onsubmit = e => {
    e.preventDefault();
    const v = Object.fromEntries(new FormData(e.currentTarget));
    if (!v.start || !v.end || v.start > v.end) return toast('开始日期不能晚于结束日期');
    if (v.start < HISTORY_START || v.end > HISTORY_END) return toast(`请选择 ${HISTORY_START} 至 ${HISTORY_END} 的演示日期`);
    Object.assign(state.history, { start: v.start, end: v.end, page: 1, quick: '' });
    render();
  };
  document.querySelectorAll('[data-history-quick]').forEach(b => b.onclick = () => {
    const quick = b.dataset.historyQuick;
    const start = quick === 'month' ? HISTORY_END.slice(0,8) + '01' : prevDate(HISTORY_END, Number(quick)-1);
    Object.assign(state.history, { start: start < HISTORY_START ? HISTORY_START : start, end: HISTORY_END, page: 1, quick });
    render();
  });
  $('#history-export').onclick = exportDeviceHistory;
  bindHistoryTable();
}

function bindHistoryTable() {
  document.querySelectorAll('[data-history-page]').forEach(b => b.onclick = () => {
    state.history.page = Number(b.dataset.historyPage);
    $('#history-table-area').innerHTML = deviceHistoryTable();
    bindHistoryTable();
  });
  $('#history-page-size').onchange = e => {
    Object.assign(state.history, { size: Number(e.target.value), page: 1 });
    $('#history-table-area').innerHTML = deviceHistoryTable();
    bindHistoryTable();
  };
  document.querySelectorAll('[data-day-record]').forEach(b => b.onclick = () => dailyReadings(b.dataset.dayRecord));
}

function dailyReadings(date) {
  const d = devices.find(d => d.id === state.history.id), electric = d.type === 'electric';
  const values = usage(d, date), end = reading(d, date), start = round(end - values.total);
  let details;
  if (electric) {
    const endRegs = periodReadings(d, date), startRegs = periodReadings(d, prevDate(date));
    details = `<div class="table-wrap"><table><thead><tr><th>分时类型</th><th>日初累计读数</th><th>日末累计读数</th><th>当日用电量</th></tr></thead><tbody>${[['峰期','peak'],['平期','flat'],['谷期','valley']].map(([label,key]) => `<tr><td>${label}</td><td class="number">${fmt(startRegs[key])}</td><td class="number">${fmt(endRegs[key])}</td><td class="number">${fmt(values[key])}</td></tr>`).join('')}<tr><td><b>合计</b></td><td class="number">${fmt(start)}</td><td class="number">${fmt(end)}</td><td class="number">${fmt(values.total)}</td></tr></tbody></table></div>`;
  } else {
    details = `<div class="table-wrap"><table><thead><tr><th>读数类型</th><th>采集时间</th><th>累计读数 (m³)</th></tr></thead><tbody><tr><td>日初读数</td><td>${date} 00:00:00</td><td class="number">${fmt(start)}</td></tr><tr><td>日末读数</td><td>${prevDate(date,-1)} 00:00:00</td><td class="number">${fmt(end)}</td></tr><tr><td colspan="2"><b>日用水量</b></td><td class="number">${fmt(values.total)}</td></tr></tbody></table></div>`;
  }
  modal(`${date} · ${electric ? '分时读数' : '采集读数'}`, `<div class="detail-title">${esc(d.name)} · ${d.id}</div>${details}<div class="form-note">单位：${electric ? 'kWh' : 'm³'}。以上累计读数为模拟数据；每日使用量通过起止读数差值计算。${electric ? '峰／平／谷累计读数仅用于演示统计口径，实际采集字段以后续设备协议为准。' : ''}</div>`, '<button class="btn" data-close>关闭</button>');
}

function historyCSVData() {
  const d = devices.find(d => d.id === state.history.id), electric = d.type === 'electric';
  const unit = electric ? 'kWh' : 'm³';
  const headers = ['日期','设备编号','设备名称',`日初累计读数(${unit})`,`日末累计读数(${unit})`,...(electric ? ['峰期用电量(kWh)','平期用电量(kWh)','谷期用电量(kWh)'] : []),electric ? '日总用电量(kWh)' : '日用水量(m³)','数据状态'];
  const rows = [...historyRows()].reverse().map(r => [r.date,d.id,d.name,r.start,r.end,...(electric ? [r.peak,r.flat,r.valley] : []),r.complete ? r.total : '',r.complete ? '完整' : '数据不完整']);
  return { headers, rows };
}

function exportDeviceHistory() {
  const h = state.history, { headers, rows } = historyCSVData();
  const cell = v => '"' + (/^[=+\-@\t\r]/.test(String(v)) ? "'" : '') + String(v).replaceAll('"','""') + '"';
  const csv = '\ufeff' + [headers,...rows].map(row => row.map(cell).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type:'text/csv;charset=utf-8;' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${h.id}_每日历史记录_${h.start}_${h.end}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast(`已导出 ${rows.length} 天历史记录（整个查询期间）`);
}
