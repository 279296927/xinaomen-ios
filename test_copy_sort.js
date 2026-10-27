/* 一键复制 + 冷号规律排序 专项测试 */
const fs = require('fs');
const html = fs.readFileSync('/sdcard/Download/solab/XinAomen/ios/index.html', 'utf8');
const code = html.match(/<script>([\s\S]*)<\/script>/)[1];

const els = {};
const mkEl = id => els[id] || (els[id] = {
  id, innerHTML: '', textContent: '', clientWidth: 320, style: {},
  getContext: () => new Proxy({}, { get: () => () => {} }),
  appendChild() {}, setAttribute() {}, addEventListener() {}
});
globalThis.document = {
  head: { appendChild() {} }, body: { appendChild() {} }, getElementById: mkEl,
  createElement: () => ({
    style: {}, value: '', setAttribute() {}, select() {}, setSelectionRange() {},
    getContext: mkEl('cv').getContext, toDataURL: () => 'data:,', appendChild() {}, setAttribute2() {}
  }),
  execCommand: () => true,
  addEventListener() {}, hidden: false
};
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
let copied = null;
/* Node 24 的 navigator 是只读 getter，必须用 defineProperty 覆盖 */
Object.defineProperty(globalThis, 'navigator', {
  value: { clipboard: { writeText: t => { copied = t; return Promise.resolve(); } } },
  configurable: true, writable: true
});
globalThis.fetch = () => Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('[]') });
globalThis.window = globalThis;
globalThis.devicePixelRatio = 2;
globalThis.addEventListener = () => {};
globalThis.setInterval = () => 0;
globalThis.URL = globalThis.URL || {};
globalThis.Blob = globalThis.Blob || function () {};
/* 保留真实 setTimeout（copyCold 的复原依赖它，桩掉会导致微任务不执行） */

let PASS = 0, FAIL = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); c ? PASS++ : FAIL++; };

(async () => {
  (0, eval)(code + '\n;globalThis.__T={store,homeColdHtml,patternHtml,coldCopyText,copyCold,patternSortSet,COLD_T1,COLD_T2,pad,zodiacOfNum};');
  const T = globalThis.__T;
  const st = T.store;

  /* ---- ① 冷门号预览按钮 ---- */
  const home = T.homeColdHtml();
  ok(home.indexOf('id="coldCopyBtn"') >= 0, '冷门号预览含一键复制按钮');
  ok(home.indexOf('一键复制') >= 0, '按钮文案为「一键复制」');
  ok(home.indexOf('onclick="copyCold()"') >= 0, '按钮已绑定 copyCold');
  ok(home.indexOf('class="histhead"') >= 0, '标题与按钮同行（histhead）');
  ok(home.indexOf('冷门号预览') >= 0, '标题保留');

  /* ---- ② 复制文本格式：区分冷门/极冷 ---- */
  const txt = T.coldCopyText();
  console.log('--- 复制文本 ---\n' + txt + '\n----------------');
  ok(txt.indexOf('冷门（' + T.COLD_T1 + '期以上未开特）') >= 0, '含「冷门（' + T.COLD_T1 + '期…）」分段标题');
  ok(txt.indexOf('极冷（' + T.COLD_T2 + '期以上未开特）') >= 0, '含「极冷（' + T.COLD_T2 + '期…）」分段标题');
  ok(txt.split('\n').length >= 6, '多行结构（实际 ' + txt.split('\n').length + ' 行）');

  /* 交叉校验：文本里的号码必须与 coldLevel 判定一致 */
  const om = st.allOmissions();
  const expectCold = [], expectExtreme = [];
  for (let n = 1; n <= 49; n++) {
    const lv = st.coldLevel(om[n]);
    if (lv === 2) expectExtreme.push(n); else if (lv === 1) expectCold.push(n);
  }
  const seg = t => {
    const i = txt.indexOf(t); if (i < 0) return [];
    const after = txt.slice(i).split('\n');
    const body = after[1] === '无' ? '' : after[1];
    const out = [];
    (body.match(/\d{2}·/g) || []).forEach(s => out.push(parseInt(s, 10)));
    return out;
  };
  const gotCold = seg('冷门（'), gotExt = seg('极冷（');
  ok(gotCold.length === expectCold.length, '冷门段个数一致（文本 ' + gotCold.length + ' / 判定 ' + expectCold.length + '）');
  ok(gotExt.length === expectExtreme.length, '极冷段个数一致（文本 ' + gotExt.length + ' / 判定 ' + expectExtreme.length + '）');
  ok(gotCold.every(n => expectCold.indexOf(n) >= 0), '冷门段号码全部属于冷门集合');
  ok(gotExt.every(n => expectExtreme.indexOf(n) >= 0), '极冷段号码全部属于极冷集合');
  ok(gotCold.every(n => expectExtreme.indexOf(n) < 0), '冷门段不混入极冷号（两档已区分）');
  ok(gotExt.every(n => expectCold.indexOf(n) < 0), '极冷段不混入普通冷门号（两档已区分）');

  /* ---- ③ copyCold 实际写入剪贴板 ---- */
  globalThis.document.getElementById = id => (id === 'coldCopyBtn' ? mkEl(id) : mkEl(id));
  mkEl('coldCopyBtn').textContent = '一键复制';
  T.copyCold();
  await new Promise(r => setImmediate(r));
  ok(copied !== null && copied.indexOf('极冷') >= 0, 'copyCold 已把文本写入剪贴板');
  ok(copied === txt, '写入内容与 coldCopyText 完全一致');

  /* ---- ④ 冷号规律排序 ---- */
  const p0 = T.patternHtml();
  ok(p0.indexOf('按号码排列') >= 0, '默认（按遗漏）显示「按号码排列」按钮');
  const rowNums = htmlStr => (htmlStr.match(/(\d{2})·[\u4e00-\u9fa5]/g) || []).map(s => parseInt(s, 10));
  const r0 = rowNums(p0.slice(p0.indexOf('遗漏排行榜')));
  console.log('按遗漏排列顺序: ' + r0.join(','));
  let descOk = true;
  for (let i = 1; i < r0.length; i++) if (st.omission(r0[i - 1]) < st.omission(r0[i])) descOk = false;
  ok(descOk, '默认顺序为遗漏降序');

  T.patternSortSet(1);
  const p1 = T.patternHtml();
  ok(p1.indexOf('按遗漏排列') >= 0, '切换后按钮变为「按遗漏排列」');
  const r1 = rowNums(p1.slice(p1.indexOf('遗漏排行榜')));
  console.log('按号码排列顺序: ' + r1.join(','));
  let ascOk = true;
  for (let i = 1; i < r1.length; i++) if (r1[i - 1] >= r1[i]) ascOk = false;
  ok(ascOk, '切换后为号码升序');
  ok(r1.length === r0.length, '两种排序条目数相同（' + r0.length + ' 个）');
  ok(r1.slice().sort((a, b) => a - b).join() === r0.slice().sort((a, b) => a - b).join(), '两种排序集合完全相同');

  /* 条宽不应超过 170px（max 计算正确） */
  const widths = (p1.match(/width:(\d+)px;background/g) || []).map(s => parseInt(s.replace(/\D/g, ''), 10));
  ok(widths.every(w => w <= 170), '条形宽度均 ≤170px（实际最大 ' + Math.max(0, ...widths) + '）');

  console.log('\n==== 结果：' + PASS + ' 通过 / ' + FAIL + ' 失败 ====');
  process.exit(FAIL ? 1 : 0);
})();