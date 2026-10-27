/* 端到端：复刻"缓存满 150 期、最新只到 288、fetchLatest 塞进 297 → 中间缺 289~296"
   的真实故障态，验证修复后 syncNow 能自动把缺口补齐 */
const fs = require('fs');
const html = fs.readFileSync('/sdcard/Download/solab/XinAomen/ios/index.html', 'utf8');
const code = html.match(/<script>([\s\S]*)<\/script>/)[1];
const bootRaw = html.match(/var BOOT_DATA='([^']*)'/)[1];
const recs = bootRaw.split(';').filter(Boolean);
const W = { r: 'red', g: 'green', b: 'blue' };
const toDraw = rec => {
  const f = rec.split('|');
  return { issue: f[0], time: f[1], wave: f[2].split('').map(c => W[c] || '').join(','), nums: f[3].split(',').map(Number), zodiac: f[4].split(',') };
};
const all = recs.map(toDraw);
const byIssue = {};
all.forEach(d => { byIssue[d.issue] = d; });

/* 从快照动态推导编号：最新期 = N，故障态 = N + (N-9)..(N-157)，中间缺 N-8..N-1 共 8 期 */
const NEWEST = parseInt(recs[0].split('|')[0], 10);
const GAP_FROM = NEWEST - 8;      /* 缺档起点（较早） */
const GAP_TO = NEWEST - 1;        /* 缺档终点（较新） */
const issueOf = n => String(n);
const fault = [byIssue[issueOf(NEWEST)] || all[0]];
for (let n = NEWEST - 9; fault.length < 150 && n > NEWEST - 400; n--) {
  const d = byIssue[issueOf(n)];
  if (d) fault.push(d);
}
const store0 = { xam_draws: JSON.stringify(fault) };
let setCount = 0;
globalThis.localStorage = {
  getItem: k => (store0[k] === undefined ? null : store0[k]),
  setItem: (k, v) => { setCount++; store0[k] = v; },
  removeItem: k => { delete store0[k]; }
};

/* 上游桩：真实格式，补回整段缺口（含最新期）；时间用快照真实开奖时间避免误判过期 */
const realTime = (byIssue[issueOf(NEWEST)] || {}).time || '2026-10-26 21:32';
const upstream = [];
for (let n = NEWEST; n >= GAP_FROM; n--) {
  upstream.push({
    expect: issueOf(n),
    openTime: realTime + ':00',
    openCode: '01,02,03,04,05,06,07',
    zodiac: '龍,馬,雞,豬,鼠,牛,虎',
    wave: 'red,green,blue,red,green,blue,red'
  });
}
let fetchCalls = 0, historyCalls = 0;
globalThis.fetch = url => {
  fetchCalls++;
  if (String(url).indexOf('history.macaumarksix.com') >= 0) {
    historyCalls++;
    return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify({ data: upstream })) });
  }
  return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('[]') });
};

const els = {};
const mkEl = id => els[id] || (els[id] = {
  id, innerHTML: '', textContent: '', clientWidth: 320, style: {},
  getContext: () => new Proxy({}, { get: () => () => {} }),
  appendChild() {}, setAttribute() {}, addEventListener() {}
});
globalThis.document = {
  head: { appendChild() {} }, body: { appendChild() {} }, getElementById: mkEl,
  createElement: () => ({ style: {}, getContext: mkEl('cv').getContext, toDataURL: () => 'data:,', appendChild() {}, setAttribute() {} }),
  addEventListener() {}, hidden: false
};
globalThis.window = globalThis;
globalThis.devicePixelRatio = 2;
globalThis.addEventListener = () => {};
globalThis.setInterval = () => 0;
globalThis.URL = globalThis.URL || {};
globalThis.Blob = globalThis.Blob || function () {};

let PASS = 0, FAIL = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); c ? PASS++ : FAIL++; };

(async () => {
  /* 页面内联脚本末尾会自动 syncNow(...,true)，等它把 busy 释放 */
  (0, eval)(code + '\n;globalThis.__T={store,syncNow};');
  const T = globalThis.__T;
  const st = T.store;

  /* 复位到故障态（eval 期间的启动同步可能改动过数据） */
  st.draws = JSON.parse(JSON.stringify(fault));
  st.sortDesc(); st.trim();

  const before = st.draws.length;
  /* 期望缺档：N-8 .. N-1 共 8 期 */
  const want = [];
  for (let n = GAP_FROM; n <= GAP_TO; n++) want.push(issueOf(n));
  const missingBefore = want.filter(i => !st.draws.some(d => d.issue === i));
  console.log('故障态 ' + before + ' 期，缺档 ' + missingBefore.length + ' 期: ' + missingBefore.join(','));
  /* 快照本身只跨 150 期，挖掉 8 期后剩 142 期；关键在于"有缺口时能否自愈" */
  ok(before === 142, '故障态为快照剩余 142 期（实得 ' + before + '）');
  ok(missingBefore.length === 8, '故障态缺 ' + GAP_FROM + '~' + GAP_TO + ' 共 8 期（实得 ' + missingBefore.length + '）');
  ok(st.needsBackfill() === true, 'needsBackfill 识别出缺口/过期');

  const wait = () => new Promise(r => setTimeout(r, 30));
  await wait();
  await T.syncNow('测试同步', true);
  await wait();

  const after = st.draws;
  const missingAfter = want.filter(i => !after.some(d => d.issue === i));
  console.log('同步后 ' + after.length + ' 期，最新 ' + after[0].issue + '，最旧 ' + after[after.length - 1].issue);
  console.log('缺档: ' + (missingAfter.join(',') || '无'));
  ok(missingAfter.length === 0, GAP_FROM + '~' + GAP_TO + ' 全部补齐（剩余缺口 ' + missingAfter.length + ' 期）');
  ok(after.some(d => d.issue === issueOf(GAP_TO - 2) || d.issue === issueOf(GAP_TO - 3)), '中间段号码已就位');
  ok(after.length === 150, '仍保持 150 期（trim 生效，实得 ' + after.length + '）');
  const iss = after.map(d => d.issue);
  let gap = 0;
  for (let i = 1; i < iss.length; i++) if (parseInt(iss[i - 1], 10) - parseInt(iss[i], 10) !== 1) gap++;
  ok(gap === 0, '补齐后期号完全连续（断裂 ' + gap + ' 处）');
  ok(historyCalls >= 1, '发起了整年历史回补（history 请求 ' + historyCalls + ' 次 / 总 ' + fetchCalls + '）');
  ok(setCount > 0, '结果已落盘 localStorage（' + setCount + ' 次）');
  ok(st.needsBackfill() === false, '补齐后 needsBackfill 归位为 false');
  console.log('\n==== 端到端：' + PASS + ' 通过 / ' + FAIL + ' 失败 ====');
  process.exit(FAIL ? 1 : 0);
})();