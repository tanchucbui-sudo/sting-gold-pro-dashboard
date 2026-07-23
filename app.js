/* ===== Sting Gold Pro Dashboard — aggregation engine ===== */

let RAW = [];

function num(v) { const n = Number(v); return isNaN(n) ? 0 : n; }

function normProvince(p) {
  if (!p) return p;
  const t = String(p).trim();
  const fixes = { "Đồng NAi": "Đồng Nai", "ĐỒng Nai": "Đồng Nai" };
  return fixes[t] || t;
}

/* -------- core aggregation from raw rows -------- */
function aggregate(rows) {
  const byProvince = {};
  for (const r of rows) {
    const province = normProvince(r["Tỉnh/TP"]);
    if (!province) continue;
    const meta = CONFIG.provinceMeta[province] || { region: r["Khu vực"] || "Khác", rate: 1650 };
    if (!byProvince[province]) {
      byProvince[province] = {
        province, region: meta.region, rate: meta.rate,
        days: 0, target: 0, actual: 0,
        sticker: 0, mocKhoa: 0, mua6chai: 0, doanhSo: 0,
        theCao: 0, nonBaoHiem: 0, nonVai: 0, mocKhoa2: 0, mayManLanSau: 0,
        sinhVien: 0, congNhan: 0,
        minDate: null, maxDate: null,
      };
    }
    const p = byProvince[province];
    p.days += num(r["Tổng ngày làm việc"]);
    p.target += num(r["Target"]);
    p.actual += num(r["Actual"]);
    p.sticker += num(r["Sticker"]);
    p.mocKhoa += num(r["Móc Khóa3"]);
    p.mua6chai += num(r["Mua 6 chai"]);
    p.doanhSo += num(r["Doanh số"]);
    p.theCao += num(r["Thẻ cào 20k"]);
    p.nonBaoHiem += num(r["Nón bảo hiểm"]);
    p.nonVai += num(r["Nón vải"]);
    p.mocKhoa2 += num(r["Móc Khóa2"]);
    p.mayManLanSau += num(r["May mắn lần sau"]);
    p.sinhVien += num(r["Sinh Viên"] !== undefined ? r["Sinh Viên"] : r["Sinh viên"]);
    p.congNhan += num(r["Công nhân"]);
    const d = r["Ngày thực hiện"];
    if (d) {
      if (!p.minDate || d < p.minDate) p.minDate = d;
      if (!p.maxDate || d > p.maxDate) p.maxDate = d;
    }
  }

  const provinces = Object.values(byProvince).map(p => {
    const targetHit = p.rate * p.days;
    const actualHit = p.actual;
    return {
      ...p,
      targetHit,
      actualHit,
      pctHit: targetHit ? actualHit / targetHit : 0,
      isRedemption: CONFIG.redemptionProvinces.includes(p.province),
    };
  }).sort((a, b) => a.province.localeCompare(b.province, 'vi'));

  return provinces;
}

function aggregateRegions(provinces) {
  const regions = {};
  for (const name of CONFIG.regionOrder) {
    regions[name] = {
      region: name, days: 0, targetHit: 0, actualHit: 0,
      saleTarget: CONFIG.regionSaleTarget[name] || 0, saleActual: 0,
      hasRedemption: false,
    };
  }
  for (const p of provinces) {
    const r = regions[p.region] || (regions[p.region] = {
      region: p.region, days: 0, targetHit: 0, actualHit: 0, saleTarget: 0, saleActual: 0, hasRedemption: false,
    });
    r.days += p.days;
    r.targetHit += p.targetHit;
    r.actualHit += p.actualHit;
    if (p.isRedemption) {
      r.hasRedemption = true;
      r.saleActual += p.theCao;
    }
  }
  const list = CONFIG.regionOrder.map(n => regions[n]).filter(Boolean);
  const totals = list.reduce((acc, r) => {
    acc.days += r.days; acc.targetHit += r.targetHit; acc.actualHit += r.actualHit;
    acc.saleTarget += r.saleTarget; acc.saleActual += r.saleActual;
    return acc;
  }, { region: "Total", days: 0, targetHit: 0, actualHit: 0, saleTarget: 0, saleActual: 0 });
  return { list, totals };
}

function aggregateDashboard(rows) {
  const sum = (key) => rows.reduce((a, r) => a + num(r[key]), 0);
  const actualDay = sum("Tổng ngày làm việc");
  const actualHit = sum("Actual");
  const actualGame = sum("Sticker") + sum("Móc Khóa3");
  const actualSale = sum("Mua 6 chai") / 4;
  const giftHelmet = sum("Nón bảo hiểm");
  const giftHat = sum("Nón vải");
  const giftKeychain = sum("Móc Khóa2");
  const giftSticker = sum("May mắn lần sau");
  const doanhSo = sum("Doanh số");

  const congNhanTotal = rows.reduce((a, r) => a + (normAudience(r["Đối tượng"]) === "Công nhân" ? num(r["Actual"]) : 0), 0);
  const sinhVienTotal = rows.reduce((a, r) => a + (normAudience(r["Đối tượng"]) === "Sinh viên" ? num(r["Actual"]) : 0), 0);

  const ct = CONFIG.campaignTargets;
  return {
    totalDay: ct.totalDay, actualDay, pctTime: ct.totalDay ? actualDay / ct.totalDay : 0,
    targetHit: ct.targetHit, actualHit, pctHit: ct.targetHit ? actualHit / ct.targetHit : 0,
    targetGame: ct.targetGame, actualGame, pctGame: ct.targetGame ? actualGame / ct.targetGame : 0,
    kpiSale: ct.kpiSale, actualSale, pctSale: ct.kpiSale ? actualSale / ct.kpiSale : 0,
    giftHelmet, giftHat, giftKeychain, giftSticker, doanhSo,
    congNhanTotal, sinhVienTotal,
    pctCongNhan: actualHit ? congNhanTotal / actualHit : 0,
    pctSinhVien: actualHit ? sinhVienTotal / actualHit : 0,
  };
}

/* -------- formatting -------- */
const fmt = new Intl.NumberFormat('vi-VN');
const fmtPct = (v) => (v * 100).toFixed(1) + '%';
const fmtVnd = (v) => fmt.format(Math.round(v)) + ' đ';

function pctBarColor(p) {
  if (p >= 1) return 'bar-good';
  if (p >= 0.75) return 'bar-warn';
  return 'bar-bad';
}

/* -------- pivot helpers (mirror Excel PivotTables) -------- */
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function normAudience(v) {
  if (!v) return v;
  const t = String(v).trim().toLowerCase();
  if (t === 'công nhân') return 'Công nhân';
  if (t === 'sinh viên') return 'Sinh viên';
  return v;
}
function normChannel(v) { return v == null ? v : String(v).trim(); }

function monthLabel(dateStr) {
  if (!dateStr) return null;
  const m = Number(String(dateStr).slice(5, 7));
  return MONTH_NAMES[m - 1] || null;
}
function weekNum(w) {
  if (!w) return 9999;
  const m = String(w).match(/(\d+)/);
  return m ? Number(m[1]) : 9999;
}

function groupSumActual(rows, keyFn) {
  const map = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    if (k == null || k === '') continue;
    map.set(k, (map.get(k) || 0) + num(r['Actual']));
  }
  return map;
}

function pivotMonth(rows) {
  const map = groupSumActual(rows, r => monthLabel(r['Ngày thực hiện']));
  return MONTH_NAMES.filter(m => map.has(m)).map(m => ({ label: m, value: map.get(m) }));
}
function pivotWeek(rows) {
  const map = groupSumActual(rows, r => r['Tuần làm việc']);
  return [...map.entries()].sort((a, b) => weekNum(a[0]) - weekNum(b[0])).map(([label, value]) => ({ label, value }));
}
function pivotField(rows, field, { sort = 'value-asc', norm } = {}) {
  const map = groupSumActual(rows, r => norm ? norm(r[field]) : r[field]);
  let list = [...map.entries()].map(([label, value]) => ({ label, value }));
  if (sort === 'value-asc') list.sort((a, b) => a.value - b.value);
  else if (sort === 'value-desc') list.sort((a, b) => b.value - a.value);
  else list.sort((a, b) => String(a.label).localeCompare(String(b.label), 'vi'));
  return list;
}

/* -------- filters (mirror Excel slicers) -------- */
const FILTER_FIELDS = [
  { key: 'Khu vực', label: 'Khu vực' },
  { key: 'Cách thức', label: 'Cách thức' },
  { key: 'Đối tượng', label: 'Đối tượng', norm: normAudience },
  { key: 'Tỉnh/TP', label: 'Tỉnh/TP', norm: normProvince },
  { key: 'Kênh thực hiện', label: 'Kênh thực hiện', norm: normChannel },
];
let dashFilters = {};
FILTER_FIELDS.forEach(f => { dashFilters[f.key] = new Set(); });

function applyDashFilters(rows) {
  return rows.filter(r => FILTER_FIELDS.every(f => {
    const set = dashFilters[f.key];
    if (!set.size) return true;
    const v = f.norm ? f.norm(r[f.key]) : r[f.key];
    return set.has(v);
  }));
}

function toggleFilter(field, value) {
  const set = dashFilters[field];
  if (set.has(value)) set.delete(value); else set.add(value);
  renderAll(false);
}
function clearFilters() {
  FILTER_FIELDS.forEach(f => dashFilters[f.key].clear());
  renderAll(false);
}

/* -------- render: Dashboard tab -------- */
let charts = {};
function destroyChart(id) { if (charts[id]) { charts[id].destroy(); delete charts[id]; } }
if (typeof Chart !== 'undefined' && typeof ChartDataLabels !== 'undefined') {
  Chart.register(ChartDataLabels);
}
function dataLabelFmt(v) { return v ? fmt.format(Math.round(v)) : ''; }

function filterOptions(field, norm) {
  const set = new Set();
  RAW.forEach(r => { const v = norm ? norm(r[field]) : r[field]; if (v) set.add(v); });
  return [...set].sort((a, b) => String(a).localeCompare(String(b), 'vi'));
}

function renderFilterPanel() {
  return `
    <div class="card filters-card">
      <div class="filters-head"><h3>Bộ lọc</h3><button class="chip-clear" onclick="clearFilters()">Xóa lọc</button></div>
      ${FILTER_FIELDS.map(f => `
        <div class="filter-group">
          <div class="filter-title">${f.label}</div>
          <div class="chip-wrap">
            ${filterOptions(f.key, f.norm).map(opt => `
              <button class="chip ${dashFilters[f.key].has(opt) ? 'active' : ''}" onclick="toggleFilter('${f.key.replace(/'/g, "\\'")}','${String(opt).replace(/'/g, "\\'")}')">${opt}</button>
            `).join('')}
          </div>
        </div>`).join('')}
    </div>`;
}

function renderDashboard(d, provinces, filteredRows) {
  const el = document.getElementById('view-dashboard');
  const byMonth = pivotMonth(filteredRows);
  const byWeek = pivotWeek(filteredRows);
  const byCity = pivotField(filteredRows, 'Tỉnh/TP', { sort: 'value-asc', norm: normProvince });
  const byChannel = pivotField(filteredRows, 'Kênh thực hiện', { sort: 'value-asc', norm: normChannel });
  const byMethod = pivotField(filteredRows, 'Cách thức', { sort: 'label' });
  const byRegion = pivotField(filteredRows, 'Khu vực', { sort: 'value-desc' });
  const congNhan = filteredRows.reduce((a, r) => a + (normAudience(r['Đối tượng']) === 'Công nhân' ? num(r['Actual']) : 0), 0);
  const sinhVien = filteredRows.reduce((a, r) => a + (normAudience(r['Đối tượng']) === 'Sinh viên' ? num(r['Actual']) : 0), 0);
  const taTotal = congNhan + sinhVien;

  el.innerHTML = `
    ${renderKpiHeaderTable(d)}
    <div class="dash-layout">
      <div class="dash-col dash-col-wide">
        <div class="grid-2">
          <div class="card"><h3>Total hit / month</h3><canvas id="chartMonth" height="200"></canvas></div>
          <div class="card"><h3>Total hit / week</h3><canvas id="chartWeek" height="200"></canvas></div>
        </div>
        <div class="card"><h3>Total hit by City</h3><canvas id="chartCity" height="220"></canvas></div>
        <div class="card"><h3>Total hit by Channel</h3><canvas id="chartChannel" height="220"></canvas></div>
      </div>
      <div class="dash-col">
        <div class="card ta-card">
          <h3>% Hit TA</h3>
          <div class="ta-icons">
            <div class="ta-icon-item"><div class="ta-icon">👷</div><div class="ta-num">${fmt.format(congNhan)}</div><div class="ta-pct">${fmtPct(taTotal ? congNhan / taTotal : 0)}</div><div class="ta-label">Công nhân</div></div>
            <div class="ta-icon-item"><div class="ta-icon">🎓</div><div class="ta-num">${fmt.format(sinhVien)}</div><div class="ta-pct">${fmtPct(taTotal ? sinhVien / taTotal : 0)}</div><div class="ta-label">Sinh viên</div></div>
          </div>
        </div>
        <div class="card"><h3>Hit by Method</h3><canvas id="chartMethod" height="200"></canvas></div>
        <div class="card"><h3>Hit by Region</h3><canvas id="chartRegion" height="220"></canvas></div>
        <div class="card"><h3>Quà tặng đã trao</h3>
          <div class="gift-grid">
            <div class="gift-item"><div class="gift-num">${fmt.format(d.giftHelmet)}</div><div class="gift-label">Nón bảo hiểm</div></div>
            <div class="gift-item"><div class="gift-num">${fmt.format(d.giftHat)}</div><div class="gift-label">Nón vải</div></div>
            <div class="gift-item"><div class="gift-num">${fmt.format(d.giftKeychain)}</div><div class="gift-label">Móc khóa</div></div>
            <div class="gift-item"><div class="gift-num">${fmt.format(d.giftSticker)}</div><div class="gift-label">Sticker</div></div>
          </div>
          <div class="doanh-so">Doanh số: <b>${fmtVnd(d.doanhSo)}</b></div>
        </div>
      </div>
      <div class="dash-col dash-col-filters">
        ${renderFilterPanel()}
      </div>
    </div>
  `;

  ['chartMonth', 'chartWeek', 'chartCity', 'chartChannel', 'chartMethod', 'chartRegion'].forEach(destroyChart);

  charts.chartMonth = new Chart(document.getElementById('chartMonth'), {
    type: 'bar',
    data: { labels: byMonth.map(x => x.label), datasets: [{ data: byMonth.map(x => x.value), backgroundColor: '#34a853' }] },
    options: chartOpts(false, { anchor: 'end', align: 'top', color: '#1b5e20' }),
  });
  charts.chartWeek = new Chart(document.getElementById('chartWeek'), {
    type: 'line',
    data: { labels: byWeek.map(x => x.label), datasets: [{ data: byWeek.map(x => x.value), borderColor: '#f4b400', backgroundColor: '#f4b400', tension: 0.3, fill: false }] },
    options: chartOpts(false, { anchor: 'end', align: 'top', color: '#8a6d00', font: { size: 9 } }),
  });
  charts.chartCity = new Chart(document.getElementById('chartCity'), {
    type: 'bar',
    data: { labels: byCity.map(x => x.label), datasets: [{ data: byCity.map(x => x.value), backgroundColor: '#f4b400' }] },
    options: {
      ...chartOpts(false, { anchor: 'end', align: 'top', color: '#8a6d00', font: { size: 8 }, rotation: -60 }),
      indexAxis: 'x',
      scales: { x: { ticks: { autoSkip: false, maxRotation: 70, minRotation: 45, font: { size: 9 } } } },
    },
  });
  charts.chartChannel = new Chart(document.getElementById('chartChannel'), {
    type: 'bar',
    data: { labels: byChannel.map(x => x.label), datasets: [{ data: byChannel.map(x => x.value), backgroundColor: '#1a73e8' }] },
    options: chartOpts(false, { anchor: 'end', align: 'top', color: '#0d47a1', font: { size: 9 } }),
  });
  charts.chartMethod = new Chart(document.getElementById('chartMethod'), {
    type: 'pie',
    data: { labels: byMethod.map(x => x.label), datasets: [{ data: byMethod.map(x => x.value), backgroundColor: ['#1a73e8', '#f4b400', '#34a853'] }] },
    options: {
      plugins: {
        legend: { position: 'bottom' },
        datalabels: { color: '#fff', font: { weight: '700', size: 12 }, formatter: dataLabelFmt },
      },
    },
  });
  charts.chartRegion = new Chart(document.getElementById('chartRegion'), {
    type: 'bar',
    data: { labels: byRegion.map(x => x.label), datasets: [{ data: byRegion.map(x => x.value), backgroundColor: '#e91e8c' }] },
    options: { ...chartOpts(false, { anchor: 'center', align: 'center', color: '#ffffff', font: { weight: '700', size: 11 } }), indexAxis: 'y' },
  });
}

function renderKpiHeaderTable(d) {
  const cell = (v, cls) => `<td class="${cls || ''}">${v}</td>`;
  const actualCell = (v) => `<td class="kpi-actual">${v}</td>`;
  return `
    <div class="card kpi-header-card">
      <table class="kpi-header-table">
        <thead>
          <tr>
            <th>Total day</th><th>Actual day</th><th>%<br>Time gone</th>
            <th>Target Hit</th><th>Actual Hit</th><th>%</th>
            <th>Target Game</th><th>Actual Game</th><th>%</th>
            <th>KPI Sale<br><span class="unit">(Unit: cartons)</span></th>
            <th>Actual sale<br><span class="unit">(Unit: cartons)</span></th>
            <th>% sale<br><span class="unit">(Unit: cartons)</span></th>
            <th>Gift<br>(Helmet)</th><th>Gift<br>(Hat)</th><th>Gift<br>(Keychain)</th><th>Gift<br><i>(Sticker)</i></th>
            <th>Doanh số<br><span class="unit">(Unit: Vnd)</span></th>
          </tr>
        </thead>
        <tbody>
          <tr>
            ${cell(fmt.format(d.totalDay))}
            ${actualCell(fmt.format(d.actualDay))}
            ${cell(fmtPct(d.pctTime))}
            ${cell(fmt.format(d.targetHit))}
            ${actualCell(fmt.format(d.actualHit))}
            ${cell(fmtPct(d.pctHit))}
            ${cell(fmt.format(d.targetGame))}
            ${actualCell(fmt.format(d.actualGame))}
            ${cell(fmtPct(d.pctGame))}
            ${cell(fmt.format(d.kpiSale))}
            ${actualCell(fmt.format(Math.round(d.actualSale * 10) / 10))}
            ${cell(fmtPct(d.pctSale))}
            ${cell(fmt.format(d.giftHelmet))}
            ${cell(fmt.format(d.giftHat))}
            ${cell(fmt.format(d.giftKeychain))}
            ${cell(fmt.format(d.giftSticker))}
            ${cell(fmt.format(Math.round(d.doanhSo)))}
          </tr>
        </tbody>
      </table>
    </div>`;
}

function chartOpts(showLegend, dl) {
  return {
    responsive: true,
    layout: { padding: { top: 18 } },
    plugins: {
      legend: { display: showLegend },
      datalabels: Object.assign({ formatter: dataLabelFmt, font: { size: 10, weight: '600' } }, dl || {}),
    },
    scales: { y: { beginAtZero: true } },
  };
}

function kpiCard(label, actual, target, pct, unit) {
  return `
    <div class="kpi-card">
      <div class="kpi-label">${label}</div>
      <div class="kpi-value">${typeof actual === 'number' ? fmt.format(actual) : actual}<span class="kpi-target"> / ${fmt.format(target)}</span></div>
      <div class="progress"><div class="progress-fill ${pctBarColor(pct)}" style="width:${Math.min(pct * 100, 100)}%"></div></div>
      <div class="kpi-pct">${fmtPct(pct)}</div>
    </div>`;
}

/* -------- render: Summary tab -------- */
function renderSummary(provinces) {
  const { list, totals } = aggregateRegions(provinces);
  const el = document.getElementById('view-summary');
  const rows = list.map(r => `
    <tr>
      <td class="tleft">${r.region}</td>
      <td>${fmt.format(r.days)}</td>
      <td>${fmtPct(r.days && totals.days ? r.days / totals.days : 0)}</td>
      <td>${fmt.format(r.targetHit)}</td>
      <td>${fmt.format(Math.round(r.actualHit))}</td>
      <td class="${pctClass(r.targetHit ? r.actualHit / r.targetHit : 0)}">${fmtPct(r.targetHit ? r.actualHit / r.targetHit : 0)}</td>
      <td>${r.saleTarget ? fmt.format(r.saleTarget) : '—'}</td>
      <td>${r.hasRedemption ? fmt.format(r.saleActual) : '—'}</td>
      <td class="${r.saleTarget ? pctClass(r.saleActual / r.saleTarget) : ''}">${r.saleTarget ? fmtPct(r.saleActual / r.saleTarget) : 'Không bán'}</td>
    </tr>`).join('');

  el.innerHTML = `
    <div class="card">
      <h3>Summary theo Khu vực</h3>
      <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr><th>Region</th><th colspan="2">Time-gone (ngày)</th><th colspan="3">Hit (sample)</th><th colspan="3">Redemption (thẻ cào)</th></tr>
          <tr><th></th><th>Actual</th><th>%</th><th>Target</th><th>Actual</th><th>%</th><th>Target</th><th>Actual</th><th>%</th></tr>
        </thead>
        <tbody>${rows}</tbody>
        <tfoot>
          <tr>
            <td class="tleft"><b>Total</b></td>
            <td><b>${fmt.format(totals.days)}</b></td><td></td>
            <td><b>${fmt.format(totals.targetHit)}</b></td>
            <td><b>${fmt.format(Math.round(totals.actualHit))}</b></td>
            <td><b>${fmtPct(totals.targetHit ? totals.actualHit / totals.targetHit : 0)}</b></td>
            <td><b>${fmt.format(totals.saleTarget)}</b></td>
            <td><b>${fmt.format(totals.saleActual)}</b></td>
            <td><b>${fmtPct(totals.saleTarget ? totals.saleActual / totals.saleTarget : 0)}</b></td>
          </tr>
        </tfoot>
      </table>
      </div>
    </div>`;
}

function pctClass(p) {
  if (p >= 1) return 'text-good';
  if (p >= 0.75) return 'text-warn';
  return 'text-bad';
}

/* -------- render: General report tab -------- */
function renderGeneral(provinces) {
  const el = document.getElementById('view-general');
  let stt = 0;
  const rows = provinces.map(p => {
    stt++;
    return `
    <tr>
      <td>${stt}</td>
      <td class="tleft">${p.region}</td>
      <td class="tleft">${p.province}</td>
      <td>${p.minDate || '—'}</td>
      <td>${p.maxDate || '—'}</td>
      <td>${fmt.format(p.days)}</td>
      <td>${fmt.format(p.targetHit)}</td>
      <td>${fmt.format(Math.round(p.actualHit))}</td>
      <td class="${pctClass(p.pctHit)}">${fmtPct(p.pctHit)}</td>
      <td>${fmt.format(p.sticker)}</td>
      <td>${fmt.format(p.mocKhoa)}</td>
      <td>${fmt.format(p.sinhVien)}</td>
      <td>${fmt.format(p.congNhan)}</td>
    </tr>`;
  }).join('');

  const t = provinces.reduce((a, p) => {
    a.days += p.days; a.targetHit += p.targetHit; a.actualHit += p.actualHit;
    a.sticker += p.sticker; a.mocKhoa += p.mocKhoa; a.sinhVien += p.sinhVien; a.congNhan += p.congNhan;
    return a;
  }, { days: 0, targetHit: 0, actualHit: 0, sticker: 0, mocKhoa: 0, sinhVien: 0, congNhan: 0 });

  el.innerHTML = `
    <div class="card">
      <h3>Báo cáo Tổng theo Tỉnh/TP</h3>
      <div class="table-wrap">
      <table class="data-table small">
        <thead>
          <tr>
            <th>STT</th><th>Khu vực</th><th>Tỉnh/TP</th><th>Bắt đầu</th><th>Kết thúc</th>
            <th>Tổng ngày</th><th>Target hit</th><th>Actual hit</th><th>% hit</th>
            <th>Sticker</th><th>Móc khóa</th><th>Sinh viên</th><th>Công nhân</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
        <tfoot>
          <tr>
            <td colspan="5" class="tleft"><b>Total</b></td>
            <td><b>${fmt.format(t.days)}</b></td>
            <td><b>${fmt.format(t.targetHit)}</b></td>
            <td><b>${fmt.format(Math.round(t.actualHit))}</b></td>
            <td><b>${fmtPct(t.targetHit ? t.actualHit / t.targetHit : 0)}</b></td>
            <td><b>${fmt.format(t.sticker)}</b></td>
            <td><b>${fmt.format(t.mocKhoa)}</b></td>
            <td><b>${fmt.format(t.sinhVien)}</b></td>
            <td><b>${fmt.format(t.congNhan)}</b></td>
          </tr>
        </tfoot>
      </table>
      </div>
    </div>`;
}

/* -------- main render + tabs -------- */
function renderAll(resetFilters = true) {
  if (resetFilters) FILTER_FIELDS.forEach(f => dashFilters[f.key].clear());
  const provinces = aggregate(RAW);
  const filteredRows = applyDashFilters(RAW);
  const dash = aggregateDashboard(filteredRows);
  renderDashboard(dash, provinces, filteredRows);
  renderSummary(provinces);
  renderGeneral(provinces);
  document.getElementById('rowCount').textContent = RAW.length;
  document.getElementById('lastUpdated').textContent = new Date().toLocaleString('vi-VN');
}

function showTab(name) {
  document.querySelectorAll('.tab-view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('view-' + name).classList.add('active');
  document.getElementById('tab-' + name).classList.add('active');
}

/* -------- Google Sheet (nguồn dữ liệu chung) -------- */
const GS_SHEET_ID = '1zNmiwAqnp8fCQ3Fs9IJ9e4k-qTu25ixo';
const GS_SHEET_TAB = 'Raw data';
const GS_DEFAULT_YEAR = 2026; // dùng khi cột "Ngày thực hiện" trên Sheet không có năm (vd "20-Apr")
const GS_MONTH_MAP = { Jan:1, Feb:2, Mar:3, Apr:4, May:5, Jun:6, Jul:7, Aug:8, Sep:9, Oct:10, Nov:11, Dec:12 };

function gsCsvUrl() {
  return `https://docs.google.com/spreadsheets/d/${GS_SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(GS_SHEET_TAB)}&_=${Date.now()}`;
}

function csvNum(v) {
  if (v == null) return v;
  const raw = String(v).trim();
  if (raw === '' ) return raw;
  if (raw === '-' || raw === '—') return 0;
  const stripped = raw.replace(/,/g, '').replace(/%$/, '');
  if (stripped === '') return raw;
  const n = Number(stripped);
  return isNaN(n) ? raw : n;
}

function parseGSDate(v) {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  // "20-Apr" or "20-Apr-26"
  let m = s.match(/^(\d{1,2})[-\/]([A-Za-z]{3})(?:[-\/](\d{2,4}))?$/);
  if (m) {
    const day = Number(m[1]);
    const mon = GS_MONTH_MAP[m[2].slice(0,1).toUpperCase() + m[2].slice(1,3).toLowerCase()];
    let year = m[3] ? Number(m[3]) : GS_DEFAULT_YEAR;
    if (year < 100) year += 2000;
    if (mon) return `${year}-${String(mon).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  }
  // "YYYY-MM-DD"
  if (/^\d{4}-\d{1,2}-\d{1,2}/.test(s)) {
    const [y, mo, d] = s.split(/[-T ]/);
    return `${y}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  }
  // "M/D/YYYY" or "D/M/YYYY" (assume M/D/YYYY, Sheets default US locale)
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    let year = Number(m[3]); if (year < 100) year += 2000;
    return `${year}-${String(m[1]).padStart(2,'0')}-${String(m[2]).padStart(2,'0')}`;
  }
  return s;
}

function loadFromGoogleSheet(isManualRefresh) {
  if (typeof Papa === 'undefined' || typeof fetch === 'undefined') return;
  const dz = document.getElementById('refreshGsBtn');
  if (dz) { dz.disabled = true; dz.textContent = '🔄 Đang tải...'; }
  fetch(gsCsvUrl(), { cache: 'no-store' })
    .then(res => { if (!res.ok) throw new Error('HTTP ' + res.status); return res.text(); })
    .then(text => {
      const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
      const rows = parsed.data.map(r => {
        const rec = {};
        for (const k in r) {
          const key = String(k).trim();
          if (!key) continue;
          rec[key] = csvNum(r[k]);
        }
        if (rec["Ngày thực hiện"] != null) rec["Ngày thực hiện"] = parseGSDate(rec["Ngày thực hiện"]);
        return rec;
      }).filter(r => r["Tỉnh/TP"]);
      if (!rows.length) throw new Error('Không có dữ liệu hợp lệ trong tab "' + GS_SHEET_TAB + '"');
      RAW = rows;
      document.getElementById('sourceLabel').textContent = 'Nguồn: Google Sheet (đồng bộ trực tiếp) — cập nhật ' + new Date().toLocaleString('vi-VN');
      renderAll();
    })
    .catch(err => {
      console.error('Không tải được Google Sheet:', err);
      if (isManualRefresh) alert('Không tải được dữ liệu từ Google Sheet: ' + err.message);
      else if (!RAW.length) resetToDefault();
    })
    .finally(() => {
      if (dz) { dz.disabled = false; dz.textContent = '🔄 Làm mới từ Google Sheet'; }
    });
}

function resetToDefault() {
  RAW = DEFAULT_RAW_DATA.slice();
  document.getElementById('sourceLabel').textContent = 'Nguồn: dữ liệu mặc định (Report_Sting Gold Pro_UTD 1907.xlsx)';
  renderAll();
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('tab-dashboard').addEventListener('click', () => showTab('dashboard'));
  document.getElementById('tab-summary').addEventListener('click', () => showTab('summary'));
  document.getElementById('tab-general').addEventListener('click', () => showTab('general'));

  document.getElementById('refreshGsBtn').addEventListener('click', () => loadFromGoogleSheet(true));

  resetToDefault();
  loadFromGoogleSheet(false);
});
