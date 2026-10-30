/* How We Connect: app logic. Vanilla JS, no build step.
   All data is stored in this browser (localStorage) on this device only. */
(function () {
"use strict";

/* ================= state ================= */
var KEY = "hwc-data-v1";
var BLANK = function () {
  return {
    v: 1,
    setup: { p1: "", p2: "", therapist: "", me: "p1", updatedAt: 0 },
    results: {},          // p1/p2: {a, v, updatedAt}
    checks: {},           // small-move id -> true
    sessions: [],         // {id, date, worked, notes, updatedAt, deleted}
    followups: [],        // {id, sessionId, text, owner, done, updatedAt, deleted}
    log: [],              // {id, at, who, tag, text, flag, updatedAt, deleted}
    prep: { p1: {}, p2: {}, updatedAt: 0 },
    nextSession: ""
  };
};
var S = BLANK();
var storageOk = true;
try {
  var raw = localStorage.getItem(KEY);
  if (raw) { var o = JSON.parse(raw); if (o && typeof o === "object") S = Object.assign(BLANK(), o); }
} catch (e) { storageOk = false; }
["sessions", "followups", "log"].forEach(function (k) { if (!Array.isArray(S[k])) S[k] = []; });

var saveTimer = null;
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); storageOk = true; }
  catch (e) { storageOk = false; toast("Couldn’t save on this device. Export a backup in Settings."); }
}
function saveSoon() { clearTimeout(saveTimer); saveTimer = setTimeout(save, 400); }

var ui = { view: "prep", connect: "check", run: null, justDone: null, scene: SCENES[0].id, lens: null, usView: null,
  logTag: "note", logWho: null, logFlag: false, editLog: null, logFilter: "week", session: null };

/* ================= helpers ================= */
function $(id) { return document.getElementById(id); }
function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]; }); }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function now() { return Date.now(); }
function pad2(n) { return String(n).padStart(2, "0"); }
function ymd(d) { d = d || new Date(); return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()); }
function parseYmd(s) { var p = String(s).split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
function fmtDate(s) { if (!s) return ""; return parseYmd(s).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }); }
function fmtTime(ts) { return new Date(ts).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }); }
function live(arr) { return arr.filter(function (x) { return !x.deleted; }); }
function other(k) { return k === "p1" ? "p2" : "p1"; }
function N(k) { return (S.setup[k] || "").trim() || (k === "p1" ? "Partner 1" : "Partner 2"); }
function ME() { return S.setup.me === "p2" ? "p2" : "p1"; }
function isMe(k) { return k === ME(); }
function nm(k) { return isMe(k) ? "me" : N(k); }
function therapist() { return (S.setup.therapist || "").trim(); }
function COLOR(k) { return k === "p1" ? "var(--a)" : "var(--b)"; }
var toastTimer = null;
function toast(msg) {
  var t = document.querySelector(".toast"); if (t) t.remove();
  t = document.createElement("div"); t.className = "toast"; t.setAttribute("role", "status"); t.textContent = msg;
  document.body.appendChild(t); clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.remove(); }, 2400);
}
function styleOf(p) { var hiA = p.a > 3, hiV = p.v > 3; return hiA && hiV ? "fearful" : hiA ? "anxious" : hiV ? "avoidant" : "secure"; }
function st(k) { return S.results[k] ? STYLES[styleOf(S.results[k])] : null; }
function codeOf(p) { var f = function (x) { return pad2(Math.round(x * 10)); }; return "A" + f(p.a) + "V" + f(p.v); }
function parseCode(c) {
  var m = String(c).trim().toUpperCase().replace(/\s/g, "").match(/^A(\d)(\d)V(\d)(\d)$/);
  if (!m) return null;
  var a = +(m[1] + "." + m[2]), v = +(m[3] + "." + m[4]);
  return (a < 1 || a > 5 || v < 1 || v > 5) ? null : { a: a, v: v };
}
function pairKey(x, y) {
  if (x === "secure" && y === "secure") return "secure|secure";
  if (x === "secure" || y === "secure") return "secure|X";
  return [x, y].sort().join("|");
}
function lastSession() {
  var s = live(S.sessions).slice().sort(function (a, b) { return b.date.localeCompare(a.date) || b.updatedAt - a.updatedAt; });
  return s[0] || null;
}
function sinceTs() {
  var ls = lastSession();
  if (ls) return parseYmd(ls.date).getTime(); // from the start of the last session day
  return now() - 7 * 24 * 3600 * 1000;
}

/* ================= router ================= */
var VIEWS = ["prep", "log", "sessions", "connect", "settings", "setup"];
function setView(v, push) {
  if (VIEWS.indexOf(v) < 0) v = "prep";
  if (!S.setup.p1 || !S.setup.p2) v = "setup";
  ui.view = v;
  if (push !== false && location.hash !== "#" + v) history.replaceState(null, "", "#" + v);
  document.querySelectorAll("[data-act=nav]").forEach(function (b) {
    if (b.dataset.v === v) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
  });
  document.querySelector("nav.bottom").classList.toggle("hidden", v === "setup");
  render(); window.scrollTo(0, 0);
}
window.addEventListener("hashchange", function () { var v = location.hash.slice(1); if (v && v !== ui.view) setView(v, false); });

function render() {
  var el = $("app");
  var fn = { prep: vPrep, log: vLog, sessions: vSessions, connect: vConnect, settings: vSettings, setup: vSetup }[ui.view];
  el.innerHTML = fn();
  after();
}
function after() {
  var ta = document.querySelector("[data-autofocus]"); if (ta) ta.focus();
}

/* ================= setup ================= */
function vSetup() {
  var m = ui.setupMe || "p1";
  return '<div class="stack">' +
    '<h1>Welcome</h1>' +
    '<p class="lead">A private space for the two of you: a quick attachment check-in, notes from therapy, a running log of the week, and a simple way to prep before each session.</p>' +
    '<div class="panel stack">' +
      '<div><label for="s-p1">First partner’s name</label><input type="text" id="s-p1" maxlength="24" autocomplete="off" value="' + esc(S.setup.p1) + '"></div>' +
      '<div><label for="s-p2">Second partner’s name</label><input type="text" id="s-p2" maxlength="24" autocomplete="off" value="' + esc(S.setup.p2) + '"></div>' +
      '<div><p style="font-weight:700;margin-bottom:8px">Whose phone is this?</p><div class="seg" id="s-me">' +
        '<button data-act="setupMe" data-k="p1" aria-pressed="' + (m === "p1") + '">The first partner’s</button>' +
        '<button data-act="setupMe" data-k="p2" aria-pressed="' + (m === "p2") + '">The second partner’s</button></div></div>' +
      '<div><label for="s-th">Your therapist’s name <span class="small">(optional)</span></label><input type="text" id="s-th" maxlength="40" autocomplete="off" value="' + esc(S.setup.therapist) + '"></div>' +
      '<p class="err hidden" id="s-err">Add both first names to continue.</p>' +
      '<button class="btn" data-act="setupSave">Continue</button>' +
    '</div>' +
    '<p class="small">Setting this up on both phones? Enter the names in the same order on each one, so backups and codes line up.</p>' +
    '<p class="small">Everything stays in this browser on this phone. Nothing is sent anywhere, and there’s no account.</p>' +
  '</div>';
}

/* ================= settings ================= */
function vSettings() {
  var me = ME();
  return '<div class="stack">' +
    '<h1>Settings</h1>' +
    '<div class="panel stack">' +
      '<h2>Names</h2>' +
      '<div><label for="e-p1">Partner 1</label><input type="text" id="e-p1" data-bind="setup||p1" maxlength="24" value="' + esc(S.setup.p1) + '"></div>' +
      '<div><label for="e-p2">Partner 2</label><input type="text" id="e-p2" data-bind="setup||p2" maxlength="24" value="' + esc(S.setup.p2) + '"></div>' +
      '<div><label for="e-th">Therapist</label><input type="text" id="e-th" data-bind="setup||therapist" maxlength="40" value="' + esc(S.setup.therapist) + '"></div>' +
      '<div><p style="font-weight:700;margin-bottom:8px">Who usually uses this phone?</p><div class="seg">' +
        '<button data-act="setMe" data-k="p1" aria-pressed="' + (me === "p1") + '">' + esc(N("p1")) + '</button>' +
        '<button data-act="setMe" data-k="p2" aria-pressed="' + (me === "p2") + '">' + esc(N("p2")) + '</button></div>' +
        '<p class="small" style="margin-top:6px">This decides who “me” is in the app.</p></div>' +
    '</div>' +
    '<div class="panel stack">' +
      '<h2>Backup and moving data</h2>' +
      '<p>Your data lives only in this browser. Export a backup now and then. To bring notes onto your partner’s phone, export here, send the file, and import it there. Importing merges: nothing already on the other phone gets erased.</p>' +
      '<button class="btn" data-act="export">Export backup file</button>' +
      '<label class="btn ghost" for="importFile" style="margin:0;font-weight:700">Import a backup file</label>' +
      '<input type="file" id="importFile" accept="application/json,.json" class="hidden">' +
      '<p class="small">On iPhone, add this app to your Home Screen (Share, then Add to Home Screen). Safari can clear website data after a week of not visiting, but Home Screen apps keep it.</p>' +
    '</div>' +
    '<div class="panel stack">' +
      '<h2>Erase</h2>' +
      '<p class="small">Removes everything from this phone. Export first if you want to keep it.</p>' +
      '<button class="btn danger" data-act="erase">Erase all data on this phone</button>' +
    '</div>' +
    (storageOk ? '' : '<p class="err">This browser isn’t letting the app save. Private browsing can cause this.</p>') +
  '</div>';
}

/* ================= prep ================= */
function vPrep() {
  var ls = lastSession(), since = sinceTs();
  var entries = live(S.log).filter(function (x) { return x.at >= since; }).sort(function (a, b) { return b.at - a.at; });
  var flagged = entries.filter(function (x) { return x.flag; });
  var open = live(S.followups).filter(function (f) { return !f.done; });
  var th = therapist();
  var counts = {};
  entries.forEach(function (x) { counts[x.tag] = (counts[x.tag] || 0) + 1; });
  var countLine = LOG_TAGS.filter(function (t) { return counts[t.id]; }).map(function (t) { return counts[t.id] + " " + t.label.toLowerCase(); }).join(", ");
  var moves = movesProgress();

  var prepFields = function (k) {
    var p = S.prep[k] || {};
    var f = function (key, lab) {
      return '<div><label for="pp-' + k + key + '">' + lab + '</label><textarea id="pp-' + k + key + '" data-bind="prep|' + k + '|' + key + '" rows="2">' + esc(p[key]) + '</textarea></div>';
    };
    return '<div class="stack tight"><span class="tag ' + k + '" style="align-self:flex-start">' + esc(N(k)) + '</span>' +
      f("appreciate", "One thing I appreciated") + f("hard", "One thing that was hard") + f("bring", "One thing I want to bring up") + '</div>';
  };

  return '<div class="stack">' +
    '<div class="stack tight"><h1>Before your next session' + (th ? ' with ' + esc(th) : '') + '</h1>' +
    '<p class="lead">Sit down together for ten minutes. Read through, add your three lines, and you’re ready.</p></div>' +
    '<div class="panel"><label for="nextS">Next session</label><input type="date" id="nextS" data-bind="root||nextSession" data-rerender value="' + esc(S.nextSession) + '"></div>' +

    '<div class="panel stack tight"><h2>Last time</h2>' +
      (ls ? '<p class="small">' + fmtDate(ls.date) + '</p>' +
        (ls.worked ? '<p class="text" style="white-space:pre-wrap">' + esc(ls.worked) + '</p>' : '<p class="small">No “what we worked on” notes for this session.</p>') +
        '<button class="link" data-act="openSession" data-id="' + ls.id + '" style="align-self:flex-start">Open session notes</button>'
        : '<p class="small">No sessions yet. Add notes after your first one on the Sessions tab.</p>') +
    '</div>' +

    '<div class="panel stack tight"><h2>Open follow-ups</h2>' +
      (open.length ? open.map(fuRow).join("") : '<p class="small">Nothing open. Follow-ups you add to session notes show up here.</p>') +
    '</div>' +

    '<div class="panel stack tight"><h2>Since ' + (ls ? 'last session' : 'last week') + '</h2>' +
      (entries.length ? '<p>' + entries.length + ' log ' + (entries.length === 1 ? 'entry' : 'entries') + (countLine ? ': ' + esc(countLine) : '') + '.</p>' : '<p class="small">No log entries yet. Add moments as they happen on the Log tab.</p>') +
      (flagged.length ? '<h3 style="margin-top:8px">To bring up</h3>' + flagged.map(logItem).join("") : '') +
      (entries.length > flagged.length ? '<button class="link" data-act="nav" data-v="log" style="align-self:flex-start">See everything in the log</button>' : '') +
    '</div>' +

    (S.results.p1 && S.results.p2 ? '<div class="panel stack tight"><h2>Small moves this week</h2>' +
      '<div class="meter"><div class="bar"><i style="width:' + moves.pct + '%"></i></div><span class="small">' + moves.done + ' of ' + moves.total + '</span></div>' +
      '<button class="link" data-act="goConnect" data-t="us" style="align-self:flex-start">See your moves</button></div>' : '') +

    '<div class="panel stack"><h2>Your three lines</h2>' + prepFields(ME()) + prepFields(other(ME())) + '</div>' +
    '<button class="btn" data-act="prepToSession">Start notes for this session</button>' +
    '<p class="small">This creates a session dated ' + esc(fmtDate(S.nextSession || ymd())) + ' with your three lines and the items to bring up already in it, then clears the lines for next time.</p>' +
  '</div>';
}
function fuRow(f) {
  var o = f.owner === "both" ? "both" : f.owner;
  var who = f.owner === "both" ? "Both" : N(f.owner);
  return '<div class="fu"><input type="checkbox" aria-label="Done" data-act="fuToggle" data-id="' + f.id + '"' + (f.done ? " checked" : "") + ' style="width:24px;height:24px;margin-top:2px;flex:none;accent-color:var(--ink)">' +
    '<div class="grow"><span' + (f.done ? ' style="text-decoration:line-through;color:var(--muted)"' : '') + '>' + esc(f.text) + '</span><span class="tag ' + o + '" style="align-self:flex-start">' + esc(who) + '</span></div></div>';
}

/* ================= log ================= */
function vLog() {
  var who = ui.logWho || ME();
  var since = ui.logFilter === "week" ? now() - 7 * 24 * 3600 * 1000 : ui.logFilter === "session" ? sinceTs() : 0;
  var list = live(S.log).filter(function (x) { return x.at >= since; }).sort(function (a, b) { return b.at - a.at; });
  var byDay = [], last = null;
  list.forEach(function (x) {
    var d = ymd(new Date(x.at));
    if (d !== last) { byDay.push('<p class="day">' + fmtDate(d) + '</p>'); last = d; }
    byDay.push(logItem(x));
  });
  return '<div class="stack">' +
    '<h1>Log</h1>' +
    '<div class="panel stack tight">' +
      '<label for="logText">What happened?</label>' +
      '<textarea id="logText" rows="3" placeholder="A moment, a feeling, something to remember"></textarea>' +
      '<p style="font-weight:700;margin-top:4px">Kind of moment</p>' +
      '<div class="chips">' + LOG_TAGS.map(function (t) { return '<button class="chip" data-act="logTag" data-t="' + t.id + '" aria-pressed="' + (ui.logTag === t.id) + '">' + t.label + '</button>'; }).join("") + '</div>' +
      '<p style="font-weight:700;margin-top:4px">From</p>' +
      '<div class="seg"><button data-act="logWho" data-k="p1" aria-pressed="' + (who === "p1") + '">' + esc(N("p1")) + '</button><button data-act="logWho" data-k="p2" aria-pressed="' + (who === "p2") + '">' + esc(N("p2")) + '</button></div>' +
      '<label class="check"><input type="checkbox" id="logFlag"' + (ui.logFlag ? " checked" : "") + ' data-act="logFlag"><span style="text-decoration:none;color:var(--ink)">Bring this up at our next session</span></label>' +
      '<button class="btn" data-act="logAdd">Add to log</button>' +
    '</div>' +
    '<div class="seg"><button data-act="logFilter" data-f="week" aria-pressed="' + (ui.logFilter === "week") + '">Past 7 days</button><button data-act="logFilter" data-f="session" aria-pressed="' + (ui.logFilter === "session") + '">Since session</button><button data-act="logFilter" data-f="all" aria-pressed="' + (ui.logFilter === "all") + '">All</button></div>' +
    (byDay.length ? '<div class="stack tight">' + byDay.join("") + '</div>' : '<p class="empty">Nothing here yet. Small moments count, like a hug, a hard text, or a repair.</p>') +
  '</div>';
}
function tagLabel(id) { var t = LOG_TAGS.filter(function (x) { return x.id === id; })[0]; return t ? t.label : "Note"; }
function logItem(x) {
  if (ui.editLog === x.id) {
    return '<div class="item"><label for="el-' + x.id + '">Edit entry</label><textarea id="el-' + x.id + '" data-bind="log|' + x.id + '|text" data-autofocus>' + esc(x.text) + '</textarea>' +
      '<div class="between"><button class="link danger" data-act="logDel" data-id="' + x.id + '">Delete</button><button class="btn inline" data-act="logDone">Done</button></div></div>';
  }
  return '<div class="item' + (x.flag ? " flagged" : "") + '">' +
    '<div class="meta"><span class="tag ' + x.who + '">' + esc(N(x.who)) + '</span><span class="tag plain">' + esc(tagLabel(x.tag)) + '</span>' + (x.flag ? '<span class="tag flag">To bring up</span>' : '') + '<span class="small">' + fmtTime(x.at) + '</span></div>' +
    '<p class="text">' + esc(x.text) + '</p>' +
    '<div class="row" style="gap:16px"><button class="link" style="flex:0 0 auto" data-act="logEdit" data-id="' + x.id + '">Edit</button><button class="link" style="flex:0 0 auto" data-act="logFlagItem" data-id="' + x.id + '">' + (x.flag ? "Unmark" : "Bring up next session") + '</button></div>' +
  '</div>';
}

/* ================= sessions ================= */
function vSessions() {
  if (ui.session) {
    var s = live(S.sessions).filter(function (x) { return x.id === ui.session; })[0];
    if (s) return sessionEditor(s);
    ui.session = null;
  }
  var list = live(S.sessions).slice().sort(function (a, b) { return b.date.localeCompare(a.date); });
  var th = therapist();
  return '<div class="stack">' +
    '<div class="between"><h1>Sessions</h1></div>' +
    '<p class="lead">Notes from therapy' + (th ? ' with ' + esc(th) : '') + ': what you worked on and what to follow up on.</p>' +
    '<button class="btn" data-act="sessionNew">Add session notes</button>' +
    (list.length ? '<div class="stack tight">' + list.map(function (s) {
      var fus = live(S.followups).filter(function (f) { return f.sessionId === s.id; });
      var openN = fus.filter(function (f) { return !f.done; }).length;
      return '<button class="cardbtn" data-act="openSession" data-id="' + s.id + '"><span style="font-weight:700">' + fmtDate(s.date) + '</span>' +
        (s.worked ? '<span class="clamp">' + esc(s.worked) + '</span>' : '<span class="small">No notes yet</span>') +
        (fus.length ? '<span class="small">' + fus.length + ' follow-up' + (fus.length === 1 ? '' : 's') + (openN ? ', ' + openN + ' open' : ', all done') + '</span>' : '') + '</button>';
    }).join("") + '</div>' : '<p class="empty">No sessions yet. After your next one, add what you worked on while it’s fresh.</p>') +
  '</div>';
}
function sessionEditor(s) {
  var fus = live(S.followups).filter(function (f) { return f.sessionId === s.id; });
  return '<div class="stack">' +
    '<button class="link" data-act="sessionBack" style="align-self:flex-start">← All sessions</button>' +
    '<h1>' + esc(fmtDate(s.date)) + '</h1>' +
    '<div class="panel stack">' +
      '<div><label for="sd">Date</label><input type="date" id="sd" data-bind="sessions|' + s.id + '|date" data-rerender value="' + esc(s.date) + '"></div>' +
      '<div><label for="sw">What we worked on</label><textarea id="sw" rows="4" data-bind="sessions|' + s.id + '|worked" placeholder="The main thing, in a sentence or two">' + esc(s.worked) + '</textarea></div>' +
      '<div><label for="sn">Notes and insights</label><textarea id="sn" rows="6" data-bind="sessions|' + s.id + '|notes" placeholder="Anything worth remembering">' + esc(s.notes) + '</textarea></div>' +
      '<p class="small">Saves as you type.</p>' +
    '</div>' +
    '<div class="panel stack tight">' +
      '<h2>Follow-ups</h2>' +
      (fus.length ? fus.map(function (f) { return '<div class="fu" style="align-items:center">' + fuRow(f).replace(/^<div class="fu">|<\/div>$/g, "") + '<button class="x" aria-label="Remove follow-up" data-act="fuDel" data-id="' + f.id + '">×</button></div>'; }).join("") : '<p class="small">Homework, things to try, or things to come back to.</p>') +
      '<label for="fuText" style="margin-top:8px">Add a follow-up</label>' +
      '<input type="text" id="fuText" placeholder="e.g. Try the pause signal once this week">' +
      '<div class="seg" id="fuOwner"><button data-act="fuOwner" data-k="p1" aria-pressed="' + (ui.fuOwner === "p1") + '">' + esc(N("p1")) + '</button><button data-act="fuOwner" data-k="p2" aria-pressed="' + (ui.fuOwner === "p2") + '">' + esc(N("p2")) + '</button><button data-act="fuOwner" data-k="both" aria-pressed="' + (!ui.fuOwner || ui.fuOwner === "both") + '">Both</button></div>' +
      '<button class="btn ghost" data-act="fuAdd" data-id="' + s.id + '">Add follow-up</button>' +
    '</div>' +
    '<button class="btn danger" data-act="sessionDel" data-id="' + s.id + '">Delete this session</button>' +
  '</div>';
}

/* ================= connect (check-in / moments / us) ================= */
function vConnect() {
  var t = ui.connect;
  var body = t === "check" ? vCheck() : t === "moments" ? vMoments() : vUs();
  return '<div class="stack">' +
    '<div class="seg"><button data-act="goConnect" data-t="check" aria-pressed="' + (t === "check") + '">Check-in</button><button data-act="goConnect" data-t="moments" aria-pressed="' + (t === "moments") + '">Moments</button><button data-act="goConnect" data-t="us" aria-pressed="' + (t === "us") + '">Us</button></div>' +
    body + '</div>';
}

function vCheck() {
  var r = ui.run;
  if (r) {
    var it = ITEMS[r.i];
    return '<div class="meter"><div class="bar"><i style="width:' + (r.i / ITEMS.length * 100) + '%"></i></div><span class="small">' + (r.i + 1) + ' of ' + ITEMS.length + '</span></div>' +
      '<p class="small">' + esc(N(r.who)) + ', how much is this like you in your relationship?</p>' +
      '<p class="q">' + esc(it.t) + '</p>' +
      '<div class="scale">' + SCALE.map(function (l, k) { return '<button data-act="answer" data-k="' + (k + 1) + '">' + l + '</button>'; }).join("") + '</div>' +
      (r.i > 0 ? '<button class="btn ghost" data-act="qBack">Back</button>' : '<button class="btn ghost" data-act="qCancel">Cancel</button>');
  }
  if (ui.justDone) return resultView(ui.justDone);
  var me = ME(), pt = other(me);
  if (!S.results[me]) {
    return '<h1>Start with you</h1>' +
      '<p class="lead">A quick check-in on how you handle closeness. Ten statements, one tap each, about two minutes. There are no right answers.</p>' +
      '<button class="btn ' + me + '" data-act="startQ" data-k="' + me + '">Start my check-in (' + esc(N(me)) + ')</button>' +
      '<button class="btn ghost" data-act="startQ" data-k="' + pt + '">Start for ' + esc(N(pt)) + ' instead</button>' +
      '<p class="small">A quick reflection based on attachment research, not a diagnosis.</p>';
  }
  if (!S.results[pt]) {
    return '<div class="panel stack"><h2>Now ' + esc(N(pt)) + '</h2>' +
      '<p>The rest works best with both of you. ' + esc(N(pt)) + ' can take it here, or on their own phone.</p>' +
      '<button class="btn ' + pt + '" data-act="startQ" data-k="' + pt + '">Pass the phone to ' + esc(N(pt)) + '</button></div>' +
      '<div class="panel stack"><h2>Or add ' + esc(N(pt)) + '’s code</h2>' +
      '<p class="small">If ' + esc(N(pt)) + ' checked in on their phone, they’ll see a short code to send you.</p>' +
      '<div><label for="cd">' + esc(N(pt)) + '’s code</label><input type="text" id="cd" placeholder="A34V21" autocomplete="off" autocapitalize="characters"></div>' +
      '<p class="err hidden" id="cdErr">That code doesn’t look right. It should look like A34V21.</p>' +
      '<button class="btn ghost" data-act="useCode" data-k="' + pt + '">Add code</button></div>' +
      '<p class="small">Your code: <strong>' + codeOf(S.results[me]) + '</strong></p>' +
      '<button class="btn ghost" data-act="startQ" data-k="' + me + '">Retake mine</button>';
  }
  return '<h1>You’re both in</h1>' +
    '<div class="panel">' + mapSVG(["p1", "p2"]) + '</div>' +
    '<p>' + esc(N("p1")) + ' leans <strong>' + st("p1").name.toLowerCase() + '</strong>. ' + esc(N("p2")) + ' leans <strong>' + st("p2").name.toLowerCase() + '</strong>.</p>' +
    '<button class="btn" data-act="goConnect" data-t="moments">See your moments</button>' +
    '<button class="btn ghost" data-act="goConnect" data-t="us">See how you fit together</button>' +
    '<div class="row"><button class="btn ghost" data-act="startQ" data-k="p1">Retake for ' + esc(N("p1")) + '</button><button class="btn ghost" data-act="startQ" data-k="p2">Retake for ' + esc(N("p2")) + '</button></div>' +
    '<p class="small">Codes: ' + esc(N("p1")) + ' <strong>' + codeOf(S.results.p1) + '</strong>, ' + esc(N("p2")) + ' <strong>' + codeOf(S.results.p2) + '</strong></p>';
}
function resultView(k) {
  var p = S.results[k], s = STYLES[styleOf(p)], code = codeOf(p);
  return '<p class="small">' + esc(N(k)) + ', you lean</p>' +
    '<h1 style="font-size:38px">' + s.name + '</h1>' +
    '<p style="font-family:Literata,Georgia,serif;font-size:19px;color:var(--muted)">' + s.nick + '</p>' +
    '<div class="panel">' + mapSVG([k]) + '</div>' +
    '<p>' + esc(s.desc) + '</p>' +
    '<div class="panel stack"><h2>Your code</h2><p class="small">If ' + esc(N(other(k))) + ' uses another phone, send this so they can add you.</p><div class="code">' + code + '</div><button class="btn ghost" data-act="copy" data-code="' + code + '">Copy code</button></div>' +
    '<button class="btn" data-act="resultDone">Continue</button>';
}
function mapSVG(keys) {
  var W = 320, pad = 34, inner = W - pad * 2;
  var pos = function (x) { return pad + 16 + (x - 1) / 4 * (inner - 32); };
  var mid = pos(3);
  var q = function (x, y, t) { return '<text x="' + x + '" y="' + y + '" text-anchor="middle" font-size="13" fill="var(--muted)">' + t + '</text>'; };
  var body = keys.filter(function (k) { return S.results[k]; }).map(function (k) {
    var p = S.results[k], cx = pos(p.v), cy = W - pos(p.a);
    return '<circle cx="' + cx + '" cy="' + cy + '" r="10" fill="' + COLOR(k) + '"/>' +
      '<text x="' + cx + '" y="' + (cy - 15) + '" text-anchor="middle" font-size="14" font-weight="700" fill="' + COLOR(k) + '">' + esc(N(k)) + '</text>';
  }).join("");
  return '<svg class="map" viewBox="0 0 ' + W + ' ' + W + '" role="img" aria-label="Attachment map: worry about closeness going up, need for space going right">' +
    '<rect x="' + pad + '" y="' + pad + '" width="' + inner + '" height="' + inner + '" rx="12" fill="var(--sunk)"/>' +
    '<line x1="' + mid + '" y1="' + pad + '" x2="' + mid + '" y2="' + (W - pad) + '" stroke="var(--line)" stroke-width="2"/>' +
    '<line x1="' + pad + '" y1="' + (W - mid) + '" x2="' + (W - pad) + '" y2="' + (W - mid) + '" stroke="var(--line)" stroke-width="2"/>' +
    q(pad + inner / 4, pad + 22, "Anxious") + q(pad + inner * 3 / 4, pad + 22, "Fearful") +
    q(pad + inner / 4, W - pad - 12, "Secure") + q(pad + inner * 3 / 4, W - pad - 12, "Avoidant") +
    '<text x="' + (W / 2) + '" y="' + (W - 8) + '" text-anchor="middle" font-size="12" fill="var(--muted)">Need for space</text>' +
    '<text x="12" y="' + (W / 2) + '" text-anchor="middle" font-size="12" fill="var(--muted)" transform="rotate(-90 12 ' + (W / 2) + ')">Worry about closeness</text>' +
    body + '</svg>';
}

function sideFor(k) {
  var s = st(k); if (s) return s.side;
  var o = st(other(k)); if (o) return o.side === "reach" ? "pull" : "reach";
  return k === ME() ? "reach" : "pull";
}
function vMoments() {
  var me = ME(), pt = other(me);
  if (!ui.lens) ui.lens = me;
  var lens = ui.lens, ls = st(lens), side = sideFor(lens);
  var lab = function (k) {
    var s = st(k);
    return (isMe(k) ? "Me" : esc(N(k))) + '<span class="sub">' + (s ? s.nick : (sideFor(k) === "reach" ? "The one who reaches" : "The one who pulls away")) + '</span>';
  };
  var notes = [];
  if (!S.results.p1 || !S.results.p2) notes.push("This gets more accurate once you’ve both checked in.");
  if (ls && ls.name === "Fearful") notes.push(N(lens) + " leans fearful, so both sides of each moment can fit. This shows the pulling-away side.");
  if (ls && ls.name === "Secure") notes.push(N(lens) + " leans secure, so these are milder versions of what may show up under stress.");
  if (S.results.p1 && S.results.p2 && sideFor("p1") === sideFor("p2")) notes.push("You two lean the same way, so both views look alike.");
  var sc = SCENES.filter(function (x) { return x.id === ui.scene; })[0][side];
  var who = nm(lens), target = nm(other(lens));
  return '<div class="stack tight"><h1>Same fear, opposite moves</h1><p class="lead">When closeness feels uncertain, some of us reach harder. Others turn feelings down and need space. Both are trying to stay safe.</p></div>' +
    '<div><p style="font-weight:700;margin-bottom:8px">Pick a moment</p><div class="chips">' +
      SCENES.map(function (s) { return '<button class="chip" data-act="scene" data-s="' + s.id + '" aria-pressed="' + (s.id === ui.scene) + '">' + esc(s.label) + '</button>'; }).join("") + '</div></div>' +
    '<div><p style="font-weight:700;margin-bottom:8px">See it through</p><div class="switch">' +
      '<button class="' + me + '" data-act="lens" data-k="' + me + '" aria-pressed="' + (lens === me) + '">' + lab(me) + '</button>' +
      '<button class="' + pt + '" data-act="lens" data-k="' + pt + '" aria-pressed="' + (lens === pt) + '">' + lab(pt) + '</button></div>' +
      (notes.length ? '<p class="small" style="margin-top:8px">' + esc(notes.join(" ")) + '</p>' : '') + '</div>' +
    '<div class="panel"><span class="tag ' + lens + '">' + esc(N(lens)) + '’s side</span>' +
      '<div class="sect" style="margin-top:10px"><h3>What’s happening in ' + esc(who) + '</h3><p>' + esc(sc.inside) + '</p></div>' +
      '<div class="sect"><h3>How it can land on ' + esc(target) + '</h3><p>' + esc(sc.lands) + '</p></div>' +
      '<div class="sect"><h3>One thing for ' + esc(who) + '</h3><p>' + esc(sc.self) + '</p></div>' +
      '<div class="sect"><h3>One thing for us</h3><p>' + esc(sc.us) + '</p></div></div>' +
    '<div class="panel stack tight"><h2>The loop</h2><p>One reaches. The other feels pressure and pulls back. The distance feels like rejection, so the reaching grows, and the pulling back grows too.</p>' +
      '<p style="font-family:Literata,Georgia,serif;font-size:19px">The cycle is the problem, not either person.</p>' +
      '<p class="small">The core idea of Emotionally Focused Therapy, from Dr. Sue Johnson.</p></div>' +
    '<button class="btn ghost" data-act="logFromMoment">Log a moment like this</button>';
}

function movesList() {
  if (!S.results.p1 || !S.results.p2) return null;
  var pr = PAIRS[pairKey(styleOf(S.results.p1), styleOf(S.results.p2))];
  var ours = TOGETHER.concat([pr.move]).map(function (m, k) { return { id: "us-" + k, t: m }; });
  var p1 = st("p1").moves.map(function (m, k) { return { id: "p1-" + k, t: m }; });
  var p2 = st("p2").moves.map(function (m, k) { return { id: "p2-" + k, t: m }; });
  return { p1: p1, p2: p2, us: ours, pair: pr };
}
function movesProgress() {
  var m = movesList(); if (!m) return { done: 0, total: 0, pct: 0 };
  var all = m.p1.concat(m.p2, m.us), done = all.filter(function (o) { return S.checks[o.id]; }).length;
  return { done: done, total: all.length, pct: done / all.length * 100 };
}
function vUs() {
  var me = ME(), pt = other(me);
  if (!S.results.p1 || !S.results.p2) {
    return '<h1>This fills in when you’re both in</h1><p class="lead">' + (S.results[me] ? 'You’re in. Add ' + esc(N(pt)) + ' on the Check-in tab.' : 'Start with the check-in. It takes about two minutes each.') + '</p>' +
      '<button class="btn" data-act="goConnect" data-t="check">Go to check-in</button>';
  }
  if (!ui.usView) ui.usView = me;
  var v = ui.usView, t = other(v), sv = st(v), stt = st(t), m = movesList(), mp = movesProgress();
  var ck = function (list) { return list.map(function (o) { return '<label class="check"><input type="checkbox" data-act="moveCheck" data-id="' + o.id + '"' + (S.checks[o.id] ? ' checked' : '') + '><span>' + esc(o.t) + '</span></label>'; }).join(""); };
  var I = isMe(v) ? "I" : esc(N(v));
  var verb = isMe(v) ? sv.move : sv.move.replace(/^reach/, "reaches").replace(/^go /, "goes ").replace(/ need /, " needs ").replace(/pull back/, "pulls back").replace(/^stay/, "stays");
  return '<h1>' + esc(N("p1")) + ' and ' + esc(N("p2")) + '</h1>' +
    '<div class="panel">' + mapSVG(["p1", "p2"]) + '<p class="small" style="text-align:center;margin-top:6px">' + esc(N("p1")) + ' leans ' + st("p1").name.toLowerCase() + '. ' + esc(N("p2")) + ' leans ' + st("p2").name.toLowerCase() + '.</p></div>' +
    '<div class="panel stack tight"><h2>How you weave together</h2><p>' + esc(m.pair.text) + '</p></div>' +
    '<div class="panel stack tight"><h2>Where it comes from</h2>' +
      '<div><span class="tag p1">' + esc(N("p1")) + '</span><p style="margin-top:6px">' + esc(st("p1").roots) + '</p></div>' +
      '<div><span class="tag p2">' + esc(N("p2")) + '</span><p style="margin-top:6px">' + esc(st("p2").roots) + '</p></div>' +
      '<p class="small">Patterns that started as protection can soften with time and safety.</p></div>' +
    '<div><p style="font-weight:700;margin-bottom:8px">See it through</p><div class="switch">' +
      '<button class="' + me + '" data-act="usView" data-k="' + me + '" aria-pressed="' + (v === me) + '">My eyes</button>' +
      '<button class="' + pt + '" data-act="usView" data-k="' + pt + '" aria-pressed="' + (v === pt) + '">' + esc(N(pt)) + '’s eyes</button></div></div>' +
    '<div class="panel">' +
      '<div class="sect"><h3>Under stress</h3><p>' + I + ' ' + verb + '.</p></div>' +
      '<div class="sect"><h3>How that can land on ' + esc(nm(t)) + '</h3><p>' + esc(sv.lands) + '</p></div>' +
      '<div class="sect"><h3>What helps ' + esc(nm(t)) + '</h3><p>' + esc(stt.helps) + '</p></div>' +
      '<div class="sect"><h3>What helps ' + esc(nm(v)) + '</h3><p>' + esc(sv.helps) + '</p></div></div>' +
    '<div class="panel stack tight"><h2>Small moves</h2>' +
      '<div class="meter"><div class="bar"><i style="width:' + mp.pct + '%"></i></div><span class="small">' + mp.done + ' of ' + mp.total + ' this week</span></div>' +
      '<h3 style="margin-top:6px">For ' + esc(N(v)) + '</h3>' + ck(m[v]) +
      '<h3 style="margin-top:6px">For both of you</h3>' + ck(m.us) +
      '<p class="small">Pick one. Doing it once counts. Flip above to see ' + esc(N(t)) + '’s moves.</p>' +
      '<button class="btn ghost" data-act="newWeek">Start a new week</button></div>' +
    '<p class="small">A quick reflection based on attachment research, not a diagnosis. To go deeper: <em>Attached</em> by Levine and Heller, and <em>Hold Me Tight</em> by Dr. Sue Johnson.</p>';
}

/* ================= actions ================= */
var A = {
  nav: function (b) { ui.session = null; setView(b.dataset.v); },
  setupSave: function () {
    var p1 = $("s-p1").value.trim(), p2 = $("s-p2").value.trim();
    if (!p1 || !p2) { $("s-err").classList.remove("hidden"); return; }
    S.setup.p1 = p1; S.setup.p2 = p2; S.setup.therapist = $("s-th").value.trim(); S.setup.me = ui.setupMe || "p1"; S.setup.updatedAt = now();
    save(); setView("prep");
  },
  setupMe: function (b) { ui.setupMe = b.dataset.k; document.querySelectorAll("#s-me button").forEach(function (x) { x.setAttribute("aria-pressed", x === b); }); },
  setMe: function (b) { S.setup.me = b.dataset.k; S.setup.updatedAt = now(); ui.lens = null; ui.usView = null; save(); render(); },
  export: function () {
    var data = JSON.stringify(Object.assign({ exportedAt: new Date().toISOString(), app: "how-we-connect" }, S), null, 2);
    var blob = new Blob([data], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "how-we-connect-backup-" + ymd() + ".json";
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    toast("Backup exported");
  },
  erase: function () {
    if (!confirm("Erase all data on this phone? This can’t be undone.")) return;
    try { localStorage.removeItem(KEY); } catch (e) {}
    S = BLANK(); ui.run = null; ui.justDone = null; setView("setup");
  },

  /* prep */
  prepToSession: function () {
    var date = S.nextSession || ymd();
    var since = sinceTs();
    var flagged = live(S.log).filter(function (x) { return x.flag && x.at >= since; });
    var lines = [];
    ["p1", "p2"].forEach(function (k) {
      var p = S.prep[k] || {}, part = [];
      if (p.appreciate) part.push("Appreciated: " + p.appreciate);
      if (p.hard) part.push("Hard: " + p.hard);
      if (p.bring) part.push("Bring up: " + p.bring);
      if (part.length) lines.push(N(k) + "\n" + part.join("\n"));
    });
    if (flagged.length) lines.push("From the log\n" + flagged.map(function (x) { return "• " + x.text + " (" + N(x.who) + ")"; }).join("\n"));
    var s = { id: uid(), date: date, worked: "", notes: lines.length ? "Prep\n\n" + lines.join("\n\n") + "\n\n" : "", updatedAt: now() };
    S.sessions.push(s);
    flagged.forEach(function (x) { x.flag = false; x.updatedAt = now(); });
    S.prep = { p1: {}, p2: {}, updatedAt: now() };
    S.nextSession = "";
    save(); ui.session = s.id; setView("sessions");
  },
  goConnect: function (b) { ui.connect = b.dataset.t; if (ui.view !== "connect") setView("connect"); else { render(); window.scrollTo(0, 0); } },

  /* follow-ups */
  fuToggle: function (b) { var f = find("followups", b.dataset.id); if (f) { f.done = b.checked; f.updatedAt = now(); save(); render(); } },
  fuOwner: function (b) { ui.fuOwner = b.dataset.k; document.querySelectorAll("#fuOwner button").forEach(function (x) { x.setAttribute("aria-pressed", x === b); }); },
  fuAdd: function (b) {
    var t = $("fuText").value.trim(); if (!t) { $("fuText").focus(); return; }
    S.followups.push({ id: uid(), sessionId: b.dataset.id, text: t, owner: ui.fuOwner || "both", done: false, updatedAt: now() });
    save(); render(); var i = $("fuText"); if (i) i.focus();
  },
  fuDel: function (b) { var f = find("followups", b.dataset.id); if (f) { f.deleted = true; f.updatedAt = now(); save(); render(); } },

  /* log */
  logTag: function (b) { ui.logTag = b.dataset.t; document.querySelectorAll("[data-act=logTag]").forEach(function (x) { x.setAttribute("aria-pressed", x === b); }); },
  logWho: function (b) { ui.logWho = b.dataset.k; document.querySelectorAll("[data-act=logWho]").forEach(function (x) { x.setAttribute("aria-pressed", x === b); }); },
  logFlag: function (b) { ui.logFlag = b.checked; },
  logAdd: function () {
    var t = $("logText").value.trim(); if (!t) { $("logText").focus(); return; }
    S.log.push({ id: uid(), at: now(), who: ui.logWho || ME(), tag: ui.logTag, text: t, flag: !!ui.logFlag, updatedAt: now() });
    ui.logFlag = false; save(); render(); toast("Added to log");
  },
  logFilter: function (b) { ui.logFilter = b.dataset.f; render(); },
  logEdit: function (b) { ui.editLog = b.dataset.id; render(); },
  logDone: function () { ui.editLog = null; save(); render(); },
  logDel: function (b) { var x = find("log", b.dataset.id); if (x && confirm("Delete this entry?")) { x.deleted = true; x.updatedAt = now(); ui.editLog = null; save(); render(); } },
  logFlagItem: function (b) { var x = find("log", b.dataset.id); if (x) { x.flag = !x.flag; x.updatedAt = now(); save(); render(); } },
  logFromMoment: function () { var s = SCENES.filter(function (x) { return x.id === ui.scene; })[0]; ui.logTag = "loop"; setView("log"); var ta = $("logText"); if (ta) { ta.value = s.label + ": "; ta.focus(); } },

  /* sessions */
  sessionNew: function () { var s = { id: uid(), date: ymd(), worked: "", notes: "", updatedAt: now() }; S.sessions.push(s); save(); ui.session = s.id; render(); window.scrollTo(0, 0); },
  openSession: function (b) { ui.session = b.dataset.id; if (ui.view !== "sessions") setView("sessions"); else { render(); window.scrollTo(0, 0); } },
  sessionBack: function () { ui.session = null; render(); window.scrollTo(0, 0); },
  sessionDel: function (b) {
    var s = find("sessions", b.dataset.id); if (!s || !confirm("Delete this session and its follow-ups?")) return;
    s.deleted = true; s.updatedAt = now();
    S.followups.forEach(function (f) { if (f.sessionId === s.id) { f.deleted = true; f.updatedAt = now(); } });
    ui.session = null; save(); render();
  },

  /* check-in */
  startQ: function (b) { ui.run = { who: b.dataset.k, i: 0, ans: [] }; ui.justDone = null; render(); window.scrollTo(0, 0); },
  answer: function (b) {
    var r = ui.run; r.ans[r.i] = +b.dataset.k; r.i++;
    if (r.i >= ITEMS.length) {
      var a = 0, v = 0, na = 0, nv = 0;
      ITEMS.forEach(function (it, k) { if (it.d === "a") { a += r.ans[k]; na++; } else { v += r.ans[k]; nv++; } });
      S.results[r.who] = { a: +(a / na).toFixed(1), v: +(v / nv).toFixed(1), updatedAt: now() };
      ui.justDone = r.who; ui.run = null; save();
    }
    render(); window.scrollTo(0, 0);
  },
  qBack: function () { ui.run.i--; render(); },
  qCancel: function () { ui.run = null; render(); },
  resultDone: function () { ui.justDone = null; render(); window.scrollTo(0, 0); },
  useCode: function (b) {
    var p = parseCode($("cd").value);
    if (!p) { $("cdErr").classList.remove("hidden"); return; }
    p.updatedAt = now(); S.results[b.dataset.k] = p; save(); render(); toast("Added");
  },
  copy: function (b) {
    var c = b.dataset.code;
    try { navigator.clipboard.writeText(c).then(function () { b.textContent = "Copied"; }, function () { b.textContent = "Copy didn’t work. Code: " + c; }); }
    catch (e) { b.textContent = "Copy didn’t work. Code: " + c; }
  },
  scene: function (b) { ui.scene = b.dataset.s; render(); },
  lens: function (b) { ui.lens = b.dataset.k; render(); },
  usView: function (b) { ui.usView = b.dataset.k; render(); },
  moveCheck: function (b) { S.checks[b.dataset.id] = b.checked; save(); render(); },
  newWeek: function () { S.checks = {}; save(); render(); toast("New week started"); }
};
function find(coll, id) { return S[coll].filter(function (x) { return x.id === id; })[0]; }

document.addEventListener("click", function (e) {
  var b = e.target.closest("[data-act]");
  if (!b) return;
  var act = b.dataset.act;
  if (b.type === "checkbox") return; // handled on change
  if (A[act]) { e.preventDefault(); A[act](b); }
});
document.addEventListener("change", function (e) {
  var t = e.target;
  if (t.type === "checkbox" && t.dataset.act && A[t.dataset.act]) A[t.dataset.act](t);
  if (t.id === "importFile" && t.files && t.files[0]) importFile(t.files[0]);
  if (t.dataset.bind && t.hasAttribute("data-rerender")) { bindValue(t); save(); render(); }
});
document.addEventListener("input", function (e) { var t = e.target; if (t.dataset.bind) { bindValue(t); saveSoon(); } });

function bindValue(t) {
  var parts = t.dataset.bind.split("|"), kind = parts[0], id = parts[1], field = parts[2], val = t.value;
  if (kind === "root") { S[field] = val; return; }
  if (kind === "setup") { S.setup[field] = val; S.setup.updatedAt = now(); return; }
  if (kind === "prep") { S.prep[id] = S.prep[id] || {}; S.prep[id][field] = val; S.prep.updatedAt = now(); return; }
  var x = find(kind, id); if (x) { x[field] = val; x.updatedAt = now(); }
}

/* ================= import / merge ================= */
function importFile(file) {
  var r = new FileReader();
  r.onload = function () {
    var inc;
    try { inc = JSON.parse(r.result); } catch (e) { toast("That file isn’t a How We Connect backup."); return; }
    if (!inc || inc.app !== "how-we-connect") { toast("That file isn’t a How We Connect backup."); return; }
    merge(inc); save(); render(); toast("Backup imported and merged");
  };
  r.onerror = function () { toast("Couldn’t read that file. Try exporting it again."); };
  r.readAsText(file);
}
function merge(inc) {
  ["sessions", "followups", "log"].forEach(function (k) {
    var map = {};
    S[k].forEach(function (x) { map[x.id] = x; });
    (Array.isArray(inc[k]) ? inc[k] : []).forEach(function (x) {
      if (!x || !x.id) return;
      if (!map[x.id] || (x.updatedAt || 0) > (map[x.id].updatedAt || 0)) map[x.id] = x;
    });
    S[k] = Object.keys(map).map(function (id) { return map[id]; });
  });
  if (inc.results) ["p1", "p2"].forEach(function (k) {
    var a = S.results[k], b = inc.results[k];
    if (b && (!a || (b.updatedAt || 0) > (a.updatedAt || 0))) S.results[k] = b;
  });
  if (inc.prep && (inc.prep.updatedAt || 0) > (S.prep.updatedAt || 0)) S.prep = inc.prep;
  if (inc.checks) Object.keys(inc.checks).forEach(function (k) { if (inc.checks[k]) S.checks[k] = true; });
  if (!S.nextSession && inc.nextSession) S.nextSession = inc.nextSession;
  if (inc.setup) {
    ["p1", "p2", "therapist"].forEach(function (k) { if (!S.setup[k] && inc.setup[k]) S.setup[k] = inc.setup[k]; });
  }
}

/* ================= start ================= */
setView((location.hash || "").slice(1) || "prep", false);
})();
