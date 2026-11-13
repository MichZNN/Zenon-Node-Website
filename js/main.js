// node.zenon.nom.co: copy buttons and live node status
// Copy buttons
document.querySelectorAll('.copy, .copy-sm').forEach(function (btn) {
  btn.addEventListener('click', function () {
    var text = document.getElementById(btn.dataset.target).textContent.trim();
    var done = function () {
      btn.textContent = 'Copied'; btn.classList.add('done');
      setTimeout(function () { btn.textContent = 'Copy'; btn.classList.remove('done'); }, 1600);
    };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(done, fallback);
    } else { fallback(); }
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); } catch (e) {}
      document.body.removeChild(ta);
    }
  });
});

// Live status from the node itself
var RPC = 'https://node.zenon.nom.co:35997';
function call(method) {
  var ctrl = new AbortController();
  var t = setTimeout(function () { ctrl.abort(); }, 15000);
  return fetch(RPC, {
    method: 'POST', headers: { 'content-type': 'application/json' }, signal: ctrl.signal,
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: method, params: [] })
  }).then(function (r) { clearTimeout(t); return r.json(); }).then(function (j) { return j.result; });
}
function setState(cls, text) {
  document.getElementById('dot').className = 'dot ' + cls;
  document.getElementById('state').textContent = text;
}
function refresh() {
  call('stats.syncInfo').then(function (s) {
    if (s.state === 2) setState('ok', 'Synced');
    else setState('sync', 'Syncing');
    document.getElementById('height').textContent = Number(s.currentHeight).toLocaleString('en-US');
  }).catch(function () { setState('bad', 'Not responding'); });
  call('stats.networkInfo').then(function (n) {
    document.getElementById('peers').textContent = n.numPeers;
  }).catch(function () {});
  call('stats.processInfo').then(function (p) {
    document.getElementById('version').textContent = 'go-zenon ' + p.version;
  }).catch(function () {});
}
refresh();
setInterval(refresh, 20000);

// Sync history: periods in which the node was out of sync, stalled or restarting
var MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function pad(n) { return (n < 10 ? '0' : '') + n; }
function day(d) { return d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()]; }
function hm(d) { return pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()); }
function duration(s) {
  if (s < 60) return s + ' s';
  var m = Math.round(s / 60);
  if (m < 60) return m + ' min';
  return Math.floor(m / 60) + ' h ' + (m % 60) + ' min';
}
var LABELS = { out_of_sync: 'out of sync', stalled: 'stalled', restart: 'restart' };
var DOTS = { out_of_sync: 'sync', stalled: 'bad', restart: '' };
function historyItem(e) {
  var start = new Date(e.start), when;
  if (!e.end) {
    when = 'since ' + day(start) + ' ' + hm(start) + ' UTC';
  } else {
    var end = new Date(e.end);
    when = day(start) + ' ' + hm(start) + '–' +
      (day(end) === day(start) ? '' : day(end) + ' ') + hm(end) + ' UTC';
  }
  var li = document.createElement('li');
  var dot = document.createElement('span');
  dot.className = 'dot ' + (DOTS[e.type] || '');
  var w = document.createElement('span');
  w.className = 'when'; w.textContent = when;
  var what = document.createElement('span');
  what.className = 'what';
  what.textContent = (LABELS[e.type] || e.type) + ' (' + (e.end ? '' : 'ongoing, ') + duration(e.seconds) + ')';
  var txt = document.createElement('span');
  txt.appendChild(w); txt.appendChild(document.createTextNode(' ')); txt.appendChild(what);
  li.appendChild(dot); li.appendChild(txt);
  return li;
}
function loadHistory() {
  fetch('/sync-history.json', { cache: 'no-store' })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (h) {
      var list = document.getElementById('history');
      var note = document.getElementById('history-note');
      list.textContent = '';
      var updated = new Date(h.updated);
      var period = 'Last ' + h.days + ' days · updated ' + hm(updated) + ' UTC';
      if (!h.events.length) {
        note.textContent = 'No sync issues in the last ' + h.days + ' days. ' + period.replace(/^Last \d+ days · /, '(') + ')';
        return;
      }
      note.textContent = period;
      h.events.forEach(function (e) { list.appendChild(historyItem(e)); });
    })
    .catch(function () {
      document.getElementById('history-note').textContent = 'Sync history is not available right now.';
    });
}
loadHistory();
setInterval(loadHistory, 60000);
