/* 断档自愈三条判定（hasGap / isStale / needsBackfill）专项测试 */
const fs = require('fs');
const s = fs.readFileSync(__dirname + '/index.html', 'utf8');
const grab = name => {
  const re = new RegExp('Store\\.prototype\\.' + name + '=function\\(\\)\\{[\\s\\S]*?\\n\\};');
  const m = s.match(re);
  if (!m) { console.log('FAIL 未找到 ' + name); process.exit(1); }
  return m[0];
};
const Store = function () {};
eval(grab('hasGap'));
eval(grab('isStale'));
eval(grab('needsBackfill'));
const mk = list => { const st = new Store(); st.draws = list; return st; };

let pass = 0, fail = 0;
function ck(name, got, want) {
  const okv = got === want;
  okv ? pass++ : fail++;
  console.log((okv ? 'PASS ' : 'FAIL ') + name + ' -> ' + got + ' (期望 ' + want + ')');
}

/* 用当前真实时间生成"刚开奖"与"很久以前"两个时间戳 */
const now = new Date(Date.now() - 60 * 60 * 1000);        /* 1 小时前 = 新鲜 */
const fmt = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' +
  String(d.getDate()).padStart(2, '0') + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
const fresh = fmt(now);
const old = fmt(new Date(Date.now() - 10 * 24 * 3600 * 1000));   /* 10 天前 = 过期 */

const base = 297;
const seq = [];
for (let i = 0; i < 150; i++) seq.push({ issue: '2026' + String(base - i).padStart(3, '0'), time: fresh });

ck('连续150期且新鲜 hasGap', mk(seq).hasGap(), false);
ck('连续150期且新鲜 isStale', mk(seq).isStale(), false);
ck('连续150期且新鲜 needsBackfill', mk(seq).needsBackfill(), false);

const missing = ['2026290', '2026291', '2026292', '2026293', '2026294', '2026295', '2026296', '2026289'];
const gapList = seq.filter(x => missing.indexOf(x.issue) < 0);
ck('缺289~296（本次故障形态）hasGap', mk(gapList).hasGap(), true);
ck('缺289~296 needsBackfill', mk(gapList).needsBackfill(), true);

/* 用户实际形态：297 + 288..140，中间空 289~296 */
const userLike = [seq[0]].concat(seq.slice(10));
ck('297+288..140 hasGap', mk(userLike).hasGap(), true);

ck('连续但快照过期 isStale', mk(seq.map(x => ({ issue: x.issue, time: old }))).isStale(), true);
ck('连续但快照过期 needsBackfill', mk(seq.map(x => ({ issue: x.issue, time: old }))).needsBackfill(), true);

ck('空数据 hasGap', mk([]).hasGap(), true);
ck('空数据 needsBackfill', mk([]).needsBackfill(), true);

const crossYear = [
  { issue: '2027001', time: fresh },
  { issue: '2026365', time: fresh },
  { issue: '2026364', time: fresh }
];
ck('跨年 001<-365 不算缺口', mk(crossYear).hasGap(), false);

const noTime = [{ issue: '2026297', time: '' }, { issue: '2026296', time: '' }];
ck('时间缺失不误判过期', mk(noTime).isStale(), false);

const badTime = [{ issue: '2026297', time: 'not-a-date' }, { issue: '2026296', time: 'bad' }];
ck('时间无法解析不误判过期', mk(badTime).isStale(), false);

/* 12 小时内不算过期（轮询不会误触发整年拉取） */
const recent = fmt(new Date(Date.now() - 12 * 3600 * 1000));
ck('12小时前不算过期', mk(seq.map(x => ({ issue: x.issue, time: recent }))).isStale(), false);

console.log('\n==== 结果：' + pass + ' 通过 / ' + fail + ' 失败 ====');
process.exit(fail ? 1 : 0);