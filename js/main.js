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
