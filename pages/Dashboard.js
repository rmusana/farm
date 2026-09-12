/**
 * Executive Dashboard – world-class farm investment view
 */
import { renderKPI, formatUGX, formatPercent, formatNumber } from '../components/KPI.js';
import { renderLineChart, renderBarChart } from '../components/Charts.js';
import { navigate } from '../js/router.js';
import { getRole, canWrite, canApprove } from '../js/auth.js';
import { getState } from '../js/state.js';
import api from '../js/api.js';
import { formatDate, formatDateTime, todayEAT } from '../js/datetime.js';
import { toastError } from '../components/Toast.js';

function emptySummary() {
  return {
    healthScore: null, totalInvestment: 0, totalExpenses: 0, revenue: 0, netProfit: 0, roi: 0, capitalRecovery: 0, cashPosition: 0, outstandingFunding: 0, budgetSpent: 0, budgetTotal: 52849172, productionPercent: null, productionTargetMin: 88, productionTargetMax: 92, commercialReached: false, daysToCommercial: null, currentWeek: null, birdCount: 2500, mortalityRate: null, feedDaysRemaining: null, openAlerts: 0, criticalAlerts: 0, eggTrend: [], mortalityTrend: []
  };
}
function healthLabel(score) {
  if (score == null) return { text: '—', cls: 'neutral' };
  if (score >= 80) return { text: 'Strong', cls: 'positive' };
  if (score >= 60) return { text: 'Moderate', cls: 'caution' };
  return { text: 'Weak', cls: 'critical' };
}
function severityIcon(sev) {
  if (sev === 'positive') return 'check-circle';
  if (sev === 'caution') return 'alert-triangle';
  if (sev === 'critical') return 'alert-octagon';
  return 'info';
}

export default {
  _charts: [],
  async render(root) {
    root.innerHTML = `
      <div class="page-header">
        <div class="page-header-title">
          <div class="breadcrumb"><span>Main</span><span>/</span><span>Dashboard</span></div>
          <h1>Dashboard</h1>
          <p class="u-text-secondary u-text-sm">How healthy is this investment today?</p>
        </div>
        <div class="page-header-actions">
          <button class="btn btn-secondary btn-sm" id="dash-refresh"><i data-lucide="refresh-cw" style="width:14px;height:14px"></i> Refresh</button>
        </div>
      </div>

      <div id="dash-live" class="card" style="padding:10px 16px; margin-bottom:16px; display:flex; gap:12px; align-items:center; justify-content:space-between; flex-wrap:wrap; background: linear-gradient(135deg, var(--color-bg-elevated), var(--color-bg-subtle)); border:1px solid var(--color-border)">
        <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap; font-size:12px; color:var(--color-text-secondary)">
          <span style="display:inline-flex; align-items:center; gap:6px"><span style="width:8px;height:8px; border-radius:50%; background:var(--color-positive); box-shadow:0 0 0 6px var(--color-positive-soft); animation:pulse 2s infinite"></span> LIVE</span>
          <span id="live-eat">EAT --:--</span>
          <span class="u-text-muted">•</span><span id="live-last">Last log —</span>
          <span class="u-text-muted">•</span><span id="live-birds">— birds</span>
        </div>
        <div id="live-week" style="font-size:12px; color:var(--color-text-muted)"></div>
      </div>

      <div id="dash-health" class="card" style="padding:18px; margin-bottom:18px; overflow:hidden; position:relative">
        <div class="skeleton" style="height:72px"></div>
      </div>

      <div class="kpi-grid" id="dash-kpis" style="margin-bottom:18px"></div>

      <div class="grid-2" style="margin-bottom:18px">
        <div class="card" style="overflow:hidden">
          <div class="card-header"><h3>Egg Production Trend</h3><span class="badge badge-neutral" id="prod-badge">—</span></div>
          <div class="card-body"><div class="chart-container"><canvas id="chart-eggs"></canvas></div></div>
        </div>
        <div class="card">
          <div class="card-header"><h3>Executive Insights</h3></div>
          <div class="card-body" id="dash-insights"><div class="skeleton" style="height:120px"></div></div>
        </div>
      </div>

      <div class="grid-3" style="margin-bottom:18px">
        <div class="card">
          <div class="card-header"><h3>Capital Flow</h3><span class="u-text-xs u-text-muted">Invested → Spent → Net</span></div>
          <div class="card-body"><div class="chart-container" style="height:220px"><canvas id="chart-capital"></canvas></div></div>
        </div>
        <div class="card">
          <div class="card-header"><h3>Recent Activity</h3></div>
          <div class="card-body" id="dash-activity" style="max-height:280px;overflow-y:auto"><div class="skeleton" style="height:100px"></div></div>
        </div>
        <div class="card">
          <div class="card-header"><h3>Active Alerts</h3><button class="btn btn-ghost btn-sm" data-nav="alerts">View all</button></div>
          <div class="card-body" id="dash-alerts"><div class="skeleton" style="height:100px"></div></div>
        </div>
      </div>

      <div class="card" style="margin-bottom:18px">
        <div class="card-header"><h3>Quick Actions</h3></div>
        <div class="card-body" id="dash-actions" style="display:flex;flex-wrap:wrap;gap:8px"></div>
      </div>

      <style>
        @keyframes pulse{0%{box-shadow:0 0 0 0 var(--color-positive-soft)}70%{box-shadow:0 0 0 8px transparent}100%{box-shadow:0 0 0 0 transparent}}
        .kpi-card{ cursor:pointer; transition: transform 160ms var(--ease-out), box-shadow 160ms var(--ease-out); }
        .kpi-card:hover{ transform: translateY(-2px); box-shadow: var(--shadow-md); }
        .kpi-card.kpi-primary{ border-color: var(--color-accent); box-shadow: 0 2px 12px rgba(26,92,62,0.08); }
        #dash-health::before{ content:""; position:absolute; inset:0; background: radial-gradient(600px 200px at 20% 0%, rgba(26,92,62,0.06), transparent 60%); pointer-events:none; }
      </style>
    `;
    if (window.lucide) window.lucide.createIcons({ nodes: [root] });
    root.querySelector('#dash-refresh')?.addEventListener('click', async () => {
      const btn = root.querySelector('#dash-refresh');
      if (btn?.disabled) return;
      if (btn) { btn.disabled=true; const l=btn.innerHTML; btn.innerHTML='<span>Refreshing…</span>'; try{ await this.load(root);} finally{ btn.disabled=false; btn.innerHTML=l; if(window.lucide) window.lucide.createIcons({nodes:[btn]});} } else await this.load(root);
    });
    // EAT clock
    const tick=()=>{ try{ const s=new Date().toLocaleString('en-GB',{timeZone:'Africa/Kampala', hour:'2-digit', minute:'2-digit'}); const el=root.querySelector('#live-eat'); if(el) el.textContent='EAT '+s;} catch{} };
    tick(); this._liveTimer=setInterval(tick, 30000);
    await this.load(root);
  },
  async load(root) {
    if (this._charts?.length) { this._charts.forEach(c=>{try{c.destroy()}catch{}}); this._charts=[]; }
    let summary=emptySummary(), insights=[], activity=[], alerts=[];
    try{
      if(window.RMUSANA_API_URL){
        const [sumRes,insRes,actRes,alertRes]=await Promise.all([api.dashboard.summary(), api.dashboard.insights(), api.dashboard.activity().catch(()=>({data:[]})), api.alerts.list().catch(()=>({data:[]}))]);
        if(sumRes.data) summary={...summary, ...sumRes.data};
        insights=insRes.data||[]; activity=actRes.data||[]; alerts=(alertRes.data||[]).filter(a=>a.status==='Open'||a.Status==='Open').slice(0,5);
      } else insights=[{severity:'info', text:'No operational data yet.'}];
    } catch(err){ console.warn(err); if(err.code!=='NO_API') toastError(err.message||'Could not load dashboard'); }
    this.renderHealth(root.querySelector('#dash-health'), summary);
    this.renderKPIs(root.querySelector('#dash-kpis'), summary);
    this.renderInsights(root.querySelector('#dash-insights'), insights);
    this.renderActivity(root.querySelector('#dash-activity'), activity);
    this.renderAlerts(root.querySelector('#dash-alerts'), alerts, summary);
    this.renderActions(root.querySelector('#dash-actions'));
    this.renderCharts(root, summary);
    // live bar
    const last=root.querySelector('#live-last'); if(last) last.textContent= summary.eggTrend?.length ? `Last log ${summary.eggTrend[summary.eggTrend.length-1].date} · ${summary.productionPercent??'—'}%` : 'Last log —';
    const birds=root.querySelector('#live-birds'); if(birds) birds.textContent= formatNumber(summary.birdCount)+' birds';
    const week=root.querySelector('#live-week'); if(week) week.textContent= summary.currentWeek ? `Week ${summary.currentWeek} · ${summary.commercialReached?'Commercial active':'Pre-commercial'}` : '';
    const badge=root.querySelector('#prod-badge'); if(badge){ if(summary.productionPercent!=null){ badge.textContent=summary.productionPercent+'%'; badge.className='badge '+(summary.productionPercent>=88?'badge-positive':summary.productionPercent>=80?'badge-caution':'badge-critical'); } else { badge.textContent='No data'; badge.className='badge badge-neutral'; } }
    if(window.lucide) window.lucide.createIcons({nodes:[root]});
  },
  renderHealth(el,s){
    if(!el) return;
    const hl=healthLabel(s.healthScore); const score=s.healthScore!=null?s.healthScore:'—';
    const ring= hl.cls==='positive' ? 'var(--color-positive)' : hl.cls==='caution' ? 'var(--color-caution)' : hl.cls==='critical' ? 'var(--color-critical)' : 'var(--color-text-muted)';
    el.innerHTML=`
      <div style="display:flex;align-items:center;gap:20px;flex-wrap:wrap; position:relative">
        <div style="position:relative; width:96px; height:96px; flex-shrink:0; filter: drop-shadow(0 8px 20px rgba(0,0,0,0.08))">
          <svg viewBox="0 0 36 36" style="width:96px;height:96px;transform:rotate(-90deg)"><path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="var(--color-border)" stroke-width="3"/><path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="${ring}" stroke-width="3.2" stroke-dasharray="${s.healthScore!=null?s.healthScore:0},100" stroke-linecap="round" style="transition: stroke-dasharray 800ms var(--ease-out)"/></svg>
          <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column"><span style="font-size:22px;font-weight:800;letter-spacing:-0.02em">${score}</span><span style="font-size:10px;letter-spacing:0.08em;text-transform:uppercase;color:var(--color-text-muted)">Health</span></div>
          <span style="position:absolute; top:-4px; right:-4px; width:14px;height:14px; background:${ring}; border:2px solid var(--color-bg-elevated); border-radius:50%; box-shadow:0 0 0 4px ${ring}20"></span>
        </div>
        <div style="flex:1;min-width:220px">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px"><h2 style="font-size:16px; margin:0">Investment Health</h2><span class="badge badge-${hl.cls==='neutral'?'neutral':hl.cls}">${hl.text}</span><span style="margin-left:auto; font-size:11px; color:var(--color-text-muted)">Updated ${new Date().toLocaleDateString()}</span></div>
          <p class="u-text-sm u-text-secondary" style="max-width:620px;line-height:1.6">${s.healthScore!=null ? 'Composite of production, mortality, feed efficiency, budget adherence, capital recovery and alerts — '+(hl.cls==='positive'?'on track.':hl.cls==='caution'?'needs attention.':'requires action.') : 'Score populates once production, feed and financial records are available.'}</p>
          <div style="display:flex;gap:16px;margin-top:10px;flex-wrap:wrap"><span class="u-text-xs" style="background:var(--color-bg-subtle); padding:6px 10px; border-radius:999px">Week ${s.currentWeek ?? '—'} · ${formatNumber(s.birdCount)} birds</span><span class="u-text-xs" style="background:${s.commercialReached?'var(--color-positive-soft)':'var(--color-bg-subtle)'}; color:${s.commercialReached?'var(--color-positive)':'var(--color-text-muted)'}; padding:6px 10px; border-radius:999px">${s.commercialReached ? '● Commercial active' : (s.daysToCommercial!=null ? '◷ '+s.daysToCommercial+' days to commercial' : 'Building to commercial')}</span></div>
        </div>
      </div>`;
  },
  renderKPIs(el,s){
    if(!el) return;
    const role=getRole();
    const isInvestor= role==='Investor';
    const items=[
      {label:'Total Investment', value:formatUGX(s.totalInvestment), insight:'Total capital contributed', nav:'finance', primary:isInvestor},
      {label:'Total Expenses', value:formatUGX(s.totalExpenses), insight:'Cumulative expenditure', nav:'finance'},
      {label:'Gross Revenue', value:formatUGX(s.revenue), insight:s.commercialReached?'Egg sales':'Allocation not yet active', nav:'finance', primary:isInvestor},
      {label:'Net Profit (Investor)', value:formatUGX(s.netProfit), insight:'After feed + operator share', nav:'finance', primary:isInvestor},
      {label:'ROI', value:formatPercent(s.roi), insight:'Net profit ÷ capital', nav:'finance', trend: s.roi>0?{direction:'up', label:'vs capital'}:null},
      {label:'Cash Position', value:formatUGX(s.cashPosition), insight:'Capital − expenses + net', nav:'finance'},
      {label:'Outstanding Funding', value:formatUGX(s.outstandingFunding), insight: s.outstandingFunding>0?'Additional capital may be required':'Within estimate', nav:'finance'},
      {label:'Production', value:s.productionPercent!=null?formatPercent(s.productionPercent):'—', insight:'Target 88–92% · ≥85% commercial', nav:'operations'},
      {label:'Mortality Rate', value:s.mortalityRate!=null?formatPercent(s.mortalityRate):'—', insight:'Cumulative vs peak', nav:'operations'},
      {label:'Feed Days Remaining', value:s.feedDaysRemaining!=null?String(s.feedDaysRemaining):'—', insight: s.feedDaysRemaining!=null&&s.feedDaysRemaining<7?'Reorder soon':'7-day average', nav:'operations'},
      {label:'Budget Performance', value:s.budgetTotal?formatPercent(s.budgetSpent&&s.budgetTotal?(s.budgetSpent/s.budgetTotal)*100:0):'—', insight:'Actual vs estimate', nav:'finance'},
      {label:'Capital Recovery', value:formatPercent(s.capitalRecovery), insight:'Returned via net profit', nav:'finance'},
    ];
    // Investor sees finance KPIs larger
    el.innerHTML = items.map((it)=>`
      <div class="card kpi-card ${it.primary?'kpi-primary':''}" data-nav="${it.nav}" data-kpi="${it.label}" style="position:relative; overflow:hidden">
        <div class="kpi-label">${it.label}</div>
        <div class="kpi-value">${it.value ?? '—'}</div>
        ${it.trend?`<div class="kpi-trend ${it.trend.direction}"><i data-lucide="${it.trend.direction==='up'?'trending-up':'trending-down'}" style="width:14px;height:14px"></i><span>${it.trend.label}</span></div>`:''}
        <div class="kpi-insight">${it.insight||''}</div>
        <i data-lucide="chevron-right" style="position:absolute; right:12px; top:14px; width:14px;height:14px; opacity:0.18"></i>
      </div>
    `).join('');
    el.querySelectorAll('.kpi-card').forEach(card=>{
      card.addEventListener('click', ()=>{ const nav=card.dataset.nav; if(nav) navigate(nav); });
    });
    if(window.lucide) window.lucide.createIcons({nodes:[el]});
  },
  renderInsights(el, insights){
    if(!el) return;
    if(!insights.length){ el.innerHTML=`<div class="empty-state" style="padding:18px"><p class="empty-state-desc">No insights yet.</p></div>`; return; }
    el.innerHTML = insights.map(ins=>`
      <div class="insight-card ${ins.severity||'info'}" style="margin-bottom:10px">
        <div class="insight-icon"><i data-lucide="${severityIcon(ins.severity)}" style="width:18px;height:18px"></i></div>
        <div style="flex:1"><div class="insight-text">${ins.text}</div><button class="btn btn-ghost btn-sm" style="margin-top:6px; font-size:11px" data-nav="${ins.severity==='critical'?'alerts':'reports'}">View ${ins.severity==='critical'?'alerts':'report'} →</button></div>
      </div>
    `).join('');
    el.querySelectorAll('[data-nav]').forEach(b=> b.addEventListener('click', ()=> navigate(b.dataset.nav)));
  },
  renderActivity(el, activity){
    if(!el) return;
    if(!activity.length){ el.innerHTML=`<div class="empty-state" style="padding:14px"><p class="empty-state-desc">No recent activity. Daily logs and sales will appear here.</p></div>`; return; }
    el.innerHTML=activity.map(a=>`
      <div style="display:flex;gap:10px;padding:8px 0;border-bottom:1px solid var(--color-border)">
        <div style="width:32px;height:32px;border-radius:10px;background:var(--color-bg-subtle);display:flex;align-items:center;justify-content:center;color:var(--color-text-secondary)"><i data-lucide="${a.icon||'circle'}" style="width:16px;height:16px"></i></div>
        <div style="min-width:0"><div class="u-text-sm u-font-medium u-truncate">${a.title}</div><div class="u-text-xs u-text-muted">${a.detail||''}</div><div class="u-text-xs u-text-muted">${a.date? new Date(a.date).toLocaleDateString():''}</div></div>
      </div>
    `).join('');
  },
  renderAlerts(el, alerts, summary){
    if(!el) return;
    if(!alerts.length){ el.innerHTML=`<div class="empty-state" style="padding:14px"><i data-lucide="bell-off" class="empty-state-icon" style="width:28px;height:28px"></i><p class="empty-state-desc">${summary.criticalAlerts>0?summary.criticalAlerts+' critical': 'No open alerts'}</p></div>`; return; }
    el.innerHTML=alerts.map(a=>{
      const pri=(a.priority||a.Priority||'Medium').toLowerCase(); const badge=pri==='critical'?'critical':pri==='high'?'caution':'neutral';
      return `<div style="padding:8px 0;border-bottom:1px solid var(--color-border)"><div style="display:flex;align-items:center;gap:8px;margin-bottom:2px"><span class="badge badge-${badge}">${a.priority||a.Priority||'Medium'}</span><span class="u-text-sm u-font-medium u-truncate">${a.title||a.Title||'Alert'}</span></div><div class="u-text-xs u-text-muted">${a.reason||a.Reason||a.suggestedAction||a.SuggestedAction||''}</div></div>`;
    }).join('');
  },
  renderActions(el){
    if(!el) return;
    const actions=[];
    if(canWrite('operations')){ actions.push({label:'Log Daily Production', nav:'operations', icon:'clipboard-list', primary:true}); actions.push({label:'Record Mortality', nav:'operations', icon:'activity'}); actions.push({label:'Log Feed Issue', nav:'operations', icon:'package'}); }
    if(canApprove()){ actions.push({label:'Add Capital', nav:'finance', icon:'banknote', primary:true}); actions.push({label:'Review Funding', nav:'finance', icon:'wallet'}); }
    actions.push({label:'View Reports', nav:'reports', icon:'file-bar-chart'}); actions.push({label:'Open Alerts', nav:'alerts', icon:'bell'});
    el.innerHTML=actions.map(a=>`<button class="btn ${a.primary?'btn-primary':'btn-secondary'} btn-sm" data-nav="${a.nav}"><i data-lucide="${a.icon}" style="width:14px;height:14px"></i>${a.label}</button>`).join('');
  },
  renderCharts(root,s){
    const eggCanvas=root.querySelector('#chart-eggs'); const capCanvas=root.querySelector('#chart-capital');
    if(!eggCanvas||!window.Chart) return;
    const trend=s.eggTrend||[]; const labels=trend.length? trend.map(t=>{const d=new Date(t.date); return isNaN(d)?String(t.date):d.toLocaleDateString(undefined,{month:'short', day:'numeric'})}):['—']; const eggs=trend.length? trend.map(t=>t.eggs):[0]; const pcts=trend.length? trend.map(t=>t.percent):[0];
    const accent=getComputedStyle(document.documentElement).getPropertyValue('--color-accent').trim()||'#1a5c3e';
    // gradient
    const ctx=eggCanvas.getContext('2d'); const grad=ctx.createLinearGradient(0,0,0,180); grad.addColorStop(0, accent+'22'); grad.addColorStop(1, accent+'00');
    this._charts.push(renderLineChart(eggCanvas,{labels, datasets:[{label:'Eggs', data:eggs, borderColor:accent, backgroundColor:grad, fill:true, tension:0.32, pointRadius:2, yAxisID:'y'}, {label:'Laying %', data:pcts, borderColor:'#6b7280', backgroundColor:'transparent', borderDash:[4,4], tension:0.32, pointRadius:0, yAxisID:'y1'}], options:{ interaction:{mode:'index', intersect:false}, plugins:{ legend:{display:true}}, scales:{ y:{position:'left', title:{display:true, text:'Eggs'}}, y1:{position:'right', min:0,max:100, grid:{drawOnChartArea:false}, title:{display:true, text:'%'}}, x:{ grid:{display:false}}}, animation:{duration:600}}}));
    if(capCanvas){
      const inv=s.totalInvestment||0, exp=s.totalExpenses||0, profit=Math.max(0,s.netProfit||0), remaining=Math.max(0, inv-exp);
      // waterfall as bar
      this._charts.push(renderBarChart(capCanvas,{labels:['Invested','Spent','Unspent','Net Profit'], datasets:[{label:'UGX', data:[inv, exp, remaining, profit], backgroundColor:[accent, '#9ca3af', '#e8e0d6', '#059669'], borderRadius:8, barThickness:28}], options:{ plugins:{legend:{display:false}}, scales:{ y:{ beginAtZero:true, ticks:{ callback:(v)=>'UGX '+Number(v).toLocaleString()}}, x:{grid:{display:false}}}, animation:{delay:(ctx)=>ctx.dataIndex*80}}}));
    }
  },
  destroy(){ if(this._liveTimer) clearInterval(this._liveTimer); this._charts=[]; }
};
