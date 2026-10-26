export const sourceFields = ['page','drawing','revision','area','symbol','quantity','original','unit','note','record'];
export const requestFields = ['id','area','quantity','unit','revision','page','drawing','record'];
export function numberCell(value, field) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  if (!/^\d+$/.test(text) || !Number.isSafeInteger(Number(text))) throw Error(`${field}は整数か空欄にしてください`);
  return Number(text);
}
export function parseCSV(text, fields) {
  const rows = []; let row = [], cell = '', quoted = false, afterQuote = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) { if (c === '"' && text[i+1] === '"') { cell += '"'; i++; } else if (c === '"') { quoted = false; afterQuote = true; } else cell += c; }
    else if (c === '"') { if (cell || afterQuote) throw Error('CSVの引用符が不正です'); quoted = true; }
    else if (c === ',' || c === '\n' || c === '\r') {
      row.push(cell); cell = ''; afterQuote = false;
      if (c !== ',') { if (c === '\r' && text[i+1] === '\n') i++; if (row.some(x => x.trim())) rows.push(row); row = []; }
    } else { if (afterQuote) throw Error('引用符の後に区切りが必要です'); cell += c; }
  }
  if (quoted) throw Error('CSVの引用符が閉じていません');
  row.push(cell); if (row.some(x => x.trim())) rows.push(row);
  if (JSON.stringify(rows.shift()) !== JSON.stringify(fields)) throw Error('列名・順序を見本と同じにしてください');
  if (!rows.length) throw Error('データ行が必要です');
  return rows.map(r => {
    if (r.length !== fields.length) throw Error('CSVの列数が一致しません');
    return Object.fromEntries(fields.map((f,i) => [f, ['page','quantity'].includes(f) ? numberCell(r[i],f) : r[i].trim()]));
  });
}
export function csv(rows, fields) {
  const quote = x => '"' + String(x ?? '').replace(/"/g,'""') + '"';
  return [fields.join(','), ...rows.map(r => fields.map(f => quote(r[f])).join(','))].join('\n');
}
export function reconcile(r, input) {
  const atPage = input.sources.filter(s => s.page === r.page);
  const matches = input.sources.filter(s => s.drawing === r.drawing && s.revision === r.revision);
  const related = input.sources.filter(s => s.area === r.area && s.symbol && atPage.some(p => p.symbol === s.symbol));
  const evidence = [...new Set([...atPage,...matches,...related])];
  const flags = [];
  if (atPage.length !== 1) flags.push('指定ページがない、または重複しています');
  if (!atPage.some(s => s.drawing === r.drawing && s.revision === r.revision)) flags.push('指定ページと図面番号・版が不一致');
  if (atPage.some(s => s.area !== r.area)) flags.push('依頼と原文の区画が不一致');
  if (r.quantity === null || atPage.some(s => s.quantity === null)) flags.push('数量の資料なし');
  if (atPage.some(s => s.quantity !== r.quantity || s.unit !== r.unit)) flags.push('記載値・単位が不一致');
  if (r.record && r.record !== r.revision) flags.push('確認記録は旧版のみ');
  if (evidence.some(s => /再確認/.test(s.note)) && !evidence.some(s => s.revision === r.revision && s.record === r.revision)) flags.push('対象版の注記の確認記録がない');
  const attachments = [...new Set(evidence.flatMap(s => s.note.match(/A-\d+/g) || []))];
  for (const name of attachments) if (!input.attachments.includes(name)) flags.push(`別紙${name}が不足`);
  if (evidence.some(s => /再掲|同一|追加ではない/.test(s.note))) flags.push('同一パネルの再掲あり（加算しない）');
  return {atPage,matches,evidence,flags};
}
