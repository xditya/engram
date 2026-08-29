// Releases page: lists what the GitHub releases API returns for the repo, newest first, with direct asset links.
// Unauthenticated calls are limited to 60 an hour per address; the response is cached in sessionStorage.
(function () {
  var REPO = 'xditya/engram';
  var API = 'https://api.github.com/repos/' + REPO + '/releases?per_page=100';
  var PAGE = 'https://github.com/' + REPO + '/releases';
  var latest = document.getElementById('latest');
  var history = document.getElementById('history-list');

  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var mb = function (n) { return n >= 1048576 ? (n / 1048576).toFixed(n >= 104857600 ? 0 : 1) + ' MB' : Math.round(n / 1024) + ' KB'; };
  var when = function (iso) {
    var d = new Date(iso), days = Math.floor((Date.now() - d) / 86400000);
    if (days < 1) return 'today';
    if (days < 2) return 'yesterday';
    if (days < 30) return days + ' days ago';
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  };
  var platform = function (a) {
    var n = a.name.toLowerCase();
    if (/\.apk$/.test(n)) return { label: 'Android', hint: 'APK', cls: 'android' };
    if (/\.ipa$/.test(n)) return { label: 'iPhone', hint: 'unsigned IPA', cls: 'ios' };
    if (/\.aab$/.test(n)) return { label: 'Play bundle', hint: 'AAB', cls: 'android' };
    return { label: a.name, hint: '', cls: 'other' };
  };
  var isCi = function (r) { return /^build-\d+$/.test(r.tag_name); };

  // Release notes are markdown; only headings, bullets and paragraphs are rendered, everything else is text.
  var notes = function (md) {
    if (!md || !md.trim()) return '';
    var out = [], list = [];
    var flush = function () { if (list.length) { out.push('<ul>' + list.join('') + '</ul>'); list = []; } };
    md.split(/\r?\n/).forEach(function (line) {
      var m;
      if ((m = /^\s*[-*]\s+(.*)/.exec(line))) { list.push('<li>' + inline(m[1]) + '</li>'); return; }
      flush();
      if ((m = /^#{1,6}\s+(.*)/.exec(line))) { out.push('<h4>' + inline(m[1]) + '</h4>'); return; }
      if (line.trim()) out.push('<p>' + inline(line) + '</p>');
    });
    flush();
    return out.join('');
  };
  var inline = function (s) {
    return esc(s)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2">$1</a>')
      .replace(/(^|\s)(https?:\/\/[^\s<]+)/g, '$1<a href="$2">$2</a>')
      .replace(/\b([0-9a-f]{7,40})\b/g, '<code>$1</code>');
  };

  var assetLinks = function (r, big) {
    return r.assets.map(function (a) {
      var p = platform(a);
      return '<a class="rel-asset rel-asset-' + p.cls + (big ? ' big' : '') + '" href="' + esc(a.browser_download_url) + '" download>'
        + '<span class="rel-asset-label">' + esc(p.label) + '</span>'
        + '<span class="rel-asset-meta mono">' + esc(p.hint ? p.hint + ' · ' : '') + mb(a.size) + (big ? ' · ' + a.download_count + ' downloads' : '') + '</span>'
        + '</a>';
    }).join('');
  };

  var renderLatest = function (r) {
    var badge = r.prerelease ? (isCi(r) ? 'ci build' : 'pre-release') : 'release';
    latest.innerHTML =
      '<div class="rel-card">'
      + '<div class="rel-card-top"><span class="rel-badge mono">' + badge + '</span><span class="mono rel-tag">' + esc(r.tag_name) + '</span><span class="mono rel-date">' + when(r.published_at) + '</span></div>'
      + '<h2>' + esc(r.name || r.tag_name) + '</h2>'
      + (r.assets.length ? '<div class="rel-assets">' + assetLinks(r, true) + '</div>' : '<p class="rel-empty">This build has no files attached. <a href="' + esc(r.html_url) + '">See it on GitHub.</a></p>')
      + (notes(r.body) ? '<div class="rel-notes">' + notes(r.body) + '</div>' : '')
      + '<p class="rel-gh"><a href="' + esc(r.html_url) + '">Release on GitHub →</a></p>'
      + '</div>';
  };

  var renderHistory = function (rs) {
    if (!rs.length) { document.getElementById('history').hidden = true; return; }
    history.innerHTML = rs.map(function (r) {
      return '<li class="rel-row">'
        + '<div class="rel-row-head"><span class="mono rel-tag">' + esc(r.tag_name) + '</span>'
        + (r.prerelease ? '<span class="rel-badge mono">' + (isCi(r) ? 'ci build' : 'pre-release') + '</span>' : '')
        + '<span class="mono rel-date">' + when(r.published_at) + '</span>'
        + '<a class="rel-row-gh" href="' + esc(r.html_url) + '">notes</a></div>'
        + (r.assets.length ? '<div class="rel-assets small">' + assetLinks(r, false) + '</div>' : '')
        + '</li>';
    }).join('');
  };

  // Every asset GitHub reports, CI builds included; .aab counts as Android, which barely anyone downloads.
  var renderTotals = function (rs) {
    var el = document.getElementById('totals'), t = { all: 0, android: 0, ios: 0 };
    if (!el) return;
    rs.forEach(function (r) {
      r.assets.forEach(function (a) {
        var cls = platform(a).cls, n = a.download_count || 0;
        t.all += n;
        if (cls === 'android' || cls === 'ios') t[cls] += n;
      });
    });
    if (!t.all) return;
    var n = function (x) { return x.toLocaleString(); };
    el.textContent = n(t.all) + ' downloads · ' + n(t.android) + ' Android · ' + n(t.ios) + ' iPhone';
    el.hidden = false;
  };

  var fail = function () {
    latest.innerHTML = '<p class="rel-empty">Couldn\'t reach GitHub just now. <a href="' + PAGE + '">Open the releases page →</a></p>';
    document.getElementById('history').hidden = true;
  };

  var render = function (all) {
    var rs = all.filter(function (r) { return !r.draft; });
    if (!rs.length) { fail(); return; }
    // A proper tagged release outranks the CI builds that follow it only when it is newer than them.
    renderTotals(rs);
    renderLatest(rs[0]);
    renderHistory(rs.slice(1));
  };

  try {
    var cached = sessionStorage.getItem('engram.releases');
    if (cached) { var c = JSON.parse(cached); if (Date.now() - c.at < 10 * 60 * 1000) { render(c.data); return; } }
  } catch (e) { /* storage unavailable */ }

  fetch(API, { headers: { Accept: 'application/vnd.github+json' } })
    .then(function (res) { if (!res.ok) throw new Error(res.status); return res.json(); })
    .then(function (data) {
      try { sessionStorage.setItem('engram.releases', JSON.stringify({ at: Date.now(), data: data })); } catch (e) { /* quota */ }
      render(data);
    })
    .catch(fail);
})();
