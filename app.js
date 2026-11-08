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
    nextSession: "",
    history: []           // every check-in: {id, who, a, v, at}
  };
};
var S = BLANK();
var storageOk = true;
try {
  var raw = localStorage.getItem(KEY);
  if (raw) { var o = JSON.parse(raw); if (o && typeof o === "object") S = Object.assign(BLANK(), o); }
} catch (e) { storageOk = false; }
["sessions", "followups", "log"].forEach(function (k) { if (!Array.isArray(S[k])) S[k] = []; });
if (!Array.isArray(S.history)) {
  S.history = [];
  ["p1", "p2"].forEach(function (k) {
    var r = S.results && S.results[k];
    if (r) S.history.push({ id: "seed-" + k, who: k, a: r.a, v: r.v, at: r.updatedAt || Date.now(), updatedAt: r.updatedAt || Date.now() });
  });
}

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
var VIEWS = ["prep", "log", "sessions", "connect", "skills", "settings", "setup"];
function setView(v, push) {
  if (VIEWS.indexOf(v) < 0) v = "prep";
  if (!S.setup.p1 || !S.setup.p2) v = "setup";
  if (ui.view === "skills" && v !== "skills" && ui.cards) endCards(true);
  ui.view = v;
  if (push !== false && location.hash !== "#" + v) history.replaceState(null, "", "#" + v);
  document.querySelectorAll("[data-act=nav]").forEach(function (b) {
    if (b.dataset.v === v) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
  });
  document.querySelector("nav.bottom").classList.toggle("hidden", v === "setup");
  var g = document.getElementById("gear"); if (g) g.classList.toggle("hidden", v === "setup");
  render(); window.scrollTo(0, 0);
}
window.addEventListener("hashchange", function () { var v = location.hash.slice(1); if (v && v !== "reset" && v !== ui.view) setView(v, false); });

var lastRendered = null;
function render() {
  var el = $("app");
  var fn = { prep: vPrep, log: vLog, sessions: vSessions, connect: vConnect, skills: vSkills, settings: vSettings, setup: vSetup }[ui.view];
  stopSkillTimer();
  el.innerHTML = fn();
  var key = ui.view + "|" + (ui.session || "") + "|" + ui.connect + "|" + ui.skillsTab + "|" + ui.skill;
  if (key !== lastRendered) { el.classList.remove("enter"); void el.offsetWidth; el.classList.add("enter"); lastRendered = key; }
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
      '<h2>Notion</h2>' +
      '<p>Copy a tidy weekly summary to paste into your Weekly check-ins database in Notion.</p>' +
      '<button class="btn ghost" data-act="notion">Copy for Notion</button>' +
    '</div>' +
    '<div class="panel stack">' +
      '<h2>Start over</h2>' +
      '<p class="small">Erases everything in the app on this phone and takes you back to the welcome screen. Export a backup first if you might want it later.</p>' +
      '<button class="btn danger" data-act="erase">Erase and start over</button>' +
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

  return '<div class="stack">' + installCard() + checkinNudge() +
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
      (function () { var pr = entries.filter(function (x) { return x.tag === "practice"; }); return pr.length ? '<p>Skills practice: <strong>' + practiceMinutes(pr) + ' min</strong> across ' + pr.length + ' practice' + (pr.length === 1 ? '' : 's') + '.</p>' : ''; })() +
      (flagged.length ? '<h3 style="margin-top:8px">To bring up</h3>' + flagged.map(logItem).join("") : '') +
      (entries.length > flagged.length ? '<button class="link" data-act="nav" data-v="log" style="align-self:flex-start">See everything in the log</button>' : '') +
    '</div>' +

    (S.results.p1 && S.results.p2 ? '<div class="panel stack tight"><h2>Small moves this week</h2>' +
      '<div class="meter"><div class="bar"><i style="width:' + moves.pct + '%"></i></div><span class="small">' + moves.done + ' of ' + moves.total + '</span></div>' +
      '<button class="link" data-act="goConnect" data-t="us" style="align-self:flex-start">See your moves</button></div>' : '') +

    '<div class="panel stack"><h2>Your three lines</h2>' + prepFields(ME()) + prepFields(other(ME())) + '</div>' +
    '<button class="btn" data-act="prepToSession">Start notes for this session</button>' +
    '<button class="btn ghost" data-act="notion">Copy for Notion</button>' +
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
  var W = 340, pad = 44, inner = W - pad * 2;
  var pos = function (x) { return pad + 18 + (x - 1) / 4 * (inner - 36); };
  var mid = pad + inner / 2;
  var q = function (x, y, t) { return '<text x="' + x + '" y="' + y + '" text-anchor="middle" font-size="13" font-weight="700" fill="var(--muted)">' + t + '</text>'; };
  var shown = keys.filter(function (k) { return S.results[k]; });
  var body = shown.map(function (k) {
    var p = S.results[k], cx = pos(p.v), cy = W - pos(p.a);
    var label = (isMe(k) ? "You" : N(k)) + ", " + STYLES[styleOf(p)].name.toLowerCase() + ". Tap to see what this means.";
    return '<g class="dot" data-act="dotInfo" data-k="' + k + '" role="button" tabindex="0" aria-label="' + esc(label) + '">' +
      '<circle class="pulse" cx="' + cx + '" cy="' + cy + '" r="12" fill="' + COLOR(k) + '"/>' +
      '<circle cx="' + cx + '" cy="' + cy + '" r="22" fill="transparent"/>' +
      '<circle cx="' + cx + '" cy="' + cy + '" r="12" fill="' + COLOR(k) + '" stroke="var(--surface)" stroke-width="3"/></g>';
  }).join("");
  var legend = shown.map(function (k) {
    return '<button class="legend" data-act="dotInfo" data-k="' + k + '"><span class="sw" style="background:' + COLOR(k) + '"></span>' + esc(isMe(k) ? N(k) + " (you)" : N(k)) + '</button>';
  }).join("");
  return '<svg class="map" viewBox="0 0 ' + W + ' ' + W + '" role="group" aria-label="Attachment map: worry about closeness goes up, need for space goes right">' +
    '<rect x="' + pad + '" y="' + pad + '" width="' + inner + '" height="' + inner + '" rx="12" fill="var(--sunk)"/>' +
    '<line x1="' + mid + '" y1="' + pad + '" x2="' + mid + '" y2="' + (W - pad) + '" stroke="var(--line)" stroke-width="2"/>' +
    '<line x1="' + pad + '" y1="' + mid + '" x2="' + (W - pad) + '" y2="' + mid + '" stroke="var(--line)" stroke-width="2"/>' +
    q(pad + inner / 4, pad - 12, "Anxious") + q(pad + inner * 3 / 4, pad - 12, "Fearful") +
    q(pad + inner / 4, W - pad + 22, "Secure") + q(pad + inner * 3 / 4, W - pad + 22, "Avoidant") +
    '<text x="' + (W / 2) + '" y="' + (W - 4) + '" text-anchor="middle" font-size="12" fill="var(--muted)">Need for space →</text>' +
    '<text x="14" y="' + (W / 2) + '" text-anchor="middle" font-size="12" fill="var(--muted)" transform="rotate(-90 14 ' + (W / 2) + ')">Worry about closeness →</text>' +
    body + '</svg>' +
    '<div class="legendrow">' + legend + '</div>' +
    '<p class="small" style="text-align:center;margin-top:4px">Tap a dot to see what it means</p>';
}

var DOT_MEANING = {
  anxious: "When closeness feels shaky, you tend to reach for more of it: checking in, explaining, wanting reassurance.",
  avoidant: "When closeness gets intense, you tend to turn feelings down and need some space to feel okay.",
  fearful: "You want closeness and feel wary of it at the same time, so you may reach and then pull back.",
  secure: "Closeness and space both feel mostly okay. You can ask for what you need and give room."
};
var DOT_MEANING_THEM = {
  anxious: "When closeness feels shaky, they tend to reach for more of it: checking in, explaining, wanting reassurance.",
  avoidant: "When closeness gets intense, they tend to turn feelings down and need some space to feel okay.",
  fearful: "They want closeness and feel wary of it at the same time, so they may reach and then pull back.",
  secure: "Closeness and space both feel mostly okay for them. They can ask for what they need and give room."
};
function dotInfo(k) {
  var p = S.results[k]; if (!p) return;
  var sk = styleOf(p), s = STYLES[sk];
  var lean = Math.max(Math.abs(p.a - 3), Math.abs(p.v - 3));
  var strength = lean < 0.5 ? "a light lean, close to the middle" : lean < 1.2 ? "a clear lean" : "a strong lean";
  var you = isMe(k);
  var level = function (x) { return x <= 2 ? "low" : x <= 3 ? "moderate" : x <= 4 ? "high" : "very high"; };
  var html =
    '<p class="small">' + esc(you ? "You" : N(k)) + '</p>' +
    '<h2>' + s.name + '</h2>' +
    '<p>' + (you ? "You’re in" : esc(N(k)) + " is in") + ' the ' + s.name.toLowerCase() + ' corner, with ' + strength + '.</p>' +
    '<p>' + esc((you ? DOT_MEANING : DOT_MEANING_THEM)[sk]) + '</p>' +
    '<p class="small">Worry about closeness: ' + level(p.a) + ' (' + p.a + ' of 5). Need for space: ' + level(p.v) + ' (' + p.v + ' of 5).</p>' +
    '<p class="small">This is where things are now, not who anyone is forever.</p>' +
    '<button class="btn" data-sheet="close">Got it</button>';
  sheet(html);
}
function sheet(html) {
  var old = document.querySelector(".sheetwrap"); if (old) old.remove();
  var w = document.createElement("div");
  w.className = "sheetwrap";
  w.innerHTML = '<div class="sheet" role="dialog" aria-modal="true">' + html + '</div>';
  document.body.appendChild(w);
  var close = function () { w.remove(); document.removeEventListener("keydown", key); };
  var key = function (e) { if (e.key === "Escape") close(); };
  document.addEventListener("keydown", key);
  w.addEventListener("click", function (e) { if (e.target === w || e.target.closest("[data-sheet=close]")) close(); });
  var b = w.querySelector("[data-sheet=close]"); if (b) b.focus();
}

/* Styles for the map dots and info sheet live here so styles.css doesn’t need to change. */
(function () {
  var css = '.dot{cursor:pointer;outline:none}' +
    '.dot:focus-visible circle:last-child{stroke:var(--focus);stroke-width:4}' +
    '.dot .pulse{transform-box:fill-box;transform-origin:center;animation:hwcPulse 2s ease-out infinite}' +
    '@keyframes hwcPulse{0%{transform:scale(1);opacity:.55}100%{transform:scale(2.6);opacity:0}}' +
    '@media (prefers-reduced-motion:reduce){.dot .pulse{animation:none;opacity:.25;transform:scale(1.6)}}' +
    '.legendrow{display:flex;justify-content:center;gap:10px;flex-wrap:wrap;margin-top:8px}' +
    '.legend{display:inline-flex;align-items:center;gap:8px;border:1.5px solid var(--line);background:transparent;border-radius:999px;padding:8px 14px;min-height:44px;font-weight:700;font-size:15px;cursor:pointer;color:var(--ink)}' +
    '.legend .sw{width:14px;height:14px;border-radius:50%;flex:none}' +
    '.sheetwrap{position:fixed;inset:0;z-index:30;background:rgba(10,12,24,.45);display:flex;align-items:flex-end;justify-content:center}' +
    '.sheet{background:var(--surface);color:var(--ink);width:100%;max-width:520px;border-radius:20px 20px 0 0;padding:22px 22px calc(22px + env(safe-area-inset-bottom,0px));display:flex;flex-direction:column;gap:12px;max-height:85vh;overflow:auto}' +
    '@media (min-width:600px){.sheetwrap{align-items:center}.sheet{border-radius:20px}}';
  var st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
})();

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
    '<div class="panel">' + mapSVG(["p1", "p2"]) + '</div>' +
    trendPanel() +
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

/* ================= native helpers ================= */
var isStandalone = (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || window.navigator.standalone === true;
var isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
var deferredInstall = null;
window.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); deferredInstall = e; if (ui.view === "prep") render(); });
window.addEventListener("appinstalled", function () { deferredInstall = null; });
if (navigator.storage && navigator.storage.persist) { try { navigator.storage.persist(); } catch (e) {} }
window.addEventListener("scroll", function () {
  var h = document.querySelector("header.top"); if (h) h.classList.toggle("scrolled", window.scrollY > 4);
}, { passive: true });
function tap() { try { if (navigator.vibrate) navigator.vibrate(8); } catch (e) {} }

function installCard() {
  var hidden = false; try { hidden = localStorage.getItem(KEY + "-installhint") === "1"; } catch (e) {}
  if (isStandalone || hidden) return "";
  var body;
  if (isIOS) {
    body = '<p>Add Toward to your Home Screen so it opens full screen like an app and keeps your notes safe.</p>' +
      '<p class="small">In Safari, tap <span class="kbd" aria-label="Share"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M12 3v12M8 7l4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span> Share, then <strong>Add to Home Screen</strong>. If you see <strong>Open as Web App</strong>, leave it on.</p>';
  } else if (deferredInstall) {
    body = '<p>Install Toward so it opens full screen like an app and keeps your notes safe.</p><button class="btn" data-act="installNow">Install app</button>';
  } else {
    body = '<p>Install Toward from your browser’s menu: look for <strong>Install app</strong> or <strong>Add to Home screen</strong>.</p>';
  }
  return '<div class="panel install install-card"><div class="mk"><img src="icons/icon-192.png" alt=""></div><div class="grow"><h2 style="font-size:19px">Make it an app</h2>' + body +
    '<button class="link" data-act="installHide" style="align-self:flex-start">Not now</button></div></div>';
}

function lastCheck(k) {
  var h = (S.history || []).filter(function (x) { return x.who === k && !x.deleted; }).sort(function (a, b) { return a.at - b.at; });
  return h.length ? h[h.length - 1] : null;
}
function checkinNudge() {
  if (!S.results.p1 || !S.results.p2) return "";
  var due = ["p1", "p2"].filter(function (k) { var l = lastCheck(k); return !l || now() - l.at > 28 * 24 * 3600 * 1000; });
  if (!due.length) return "";
  var names = due.map(function (k) { return N(k); }).join(" and ");
  return '<div class="panel stack tight"><h2 style="font-size:19px">Time for a monthly check-in</h2>' +
    '<p>It’s been about a month for ' + esc(names) + '. Retaking it every few weeks is how you’ll see things move.</p>' +
    '<button class="btn ghost" data-act="goConnect" data-t="check">Go to check-in</button></div>';
}

/* Check-in history chart */
function shortDate(ts) { return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" }); }
function trendSVG(k) {
  var h = (S.history || []).filter(function (x) { return x.who === k && !x.deleted; }).sort(function (a, b) { return a.at - b.at; });
  if (h.length < 2) return null;
  var W = 320, H = 170, L = 30, R = 12, T = 12, B = 28;
  var x = function (i) { return L + (h.length === 1 ? 0 : i * (W - L - R) / (h.length - 1)); };
  var y = function (v) { return T + (5 - v) / 4 * (H - T - B); };
  var grid = [1, 2, 3, 4, 5].map(function (v) {
    return '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '" stroke="var(--line)" stroke-width="1"/>' +
      '<text x="' + (L - 8) + '" y="' + (y(v) + 4) + '" font-size="11" text-anchor="end" fill="var(--muted)">' + v + '</text>';
  }).join("");
  var line = function (key, dash) {
    var d = h.map(function (p, i) { return (i ? "L" : "M") + x(i).toFixed(1) + " " + y(p[key]).toFixed(1); }).join(" ");
    var dots = h.map(function (p, i) { return '<circle cx="' + x(i).toFixed(1) + '" cy="' + y(p[key]).toFixed(1) + '" r="3.5" fill="' + (dash ? "var(--muted)" : COLOR(k)) + '"/>'; }).join("");
    return '<path d="' + d + '" fill="none" stroke="' + (dash ? "var(--muted)" : COLOR(k)) + '" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"' + (dash ? ' stroke-dasharray="5 5"' : '') + '/>' + dots;
  };
  var labels = '<text x="' + L + '" y="' + (H - 8) + '" font-size="11" fill="var(--muted)">' + shortDate(h[0].at) + '</text>' +
    '<text x="' + (W - R) + '" y="' + (H - 8) + '" font-size="11" text-anchor="end" fill="var(--muted)">' + shortDate(h[h.length - 1].at) + '</text>';
  return '<svg class="trend" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(N(k)) + '’s check-in scores over time">' + grid + line("v", true) + line("a", false) + labels + '</svg>';
}
function trendWords(k) {
  var h = (S.history || []).filter(function (x) { return x.who === k && !x.deleted; }).sort(function (a, b) { return a.at - b.at; });
  if (!h.length) return "";
  if (h.length === 1) return "One check-in so far (" + shortDate(h[0].at) + "). Retake in about a month to start a trend.";
  var f = h[0], l = h[h.length - 1];
  var dir = function (d, name) { return Math.abs(d) < 0.15 ? name + " about the same" : name + (d < 0 ? " down " : " up ") + Math.abs(d).toFixed(1); };
  return "Since " + shortDate(f.at) + ": " + dir(l.a - f.a, "worry") + ", " + dir(l.v - f.v, "need for space") + ". Lower over time means more settled.";
}
function trendPanel() {
  var parts = ["p1", "p2"].map(function (k) {
    var svg = trendSVG(k), words = trendWords(k);
    if (!words) return "";
    return '<div class="stack tight"><span class="tag ' + k + '" style="align-self:flex-start">' + esc(N(k)) + '</span>' +
      (svg ? svg + '<div class="keyrow"><span style="color:' + COLOR(k) + '"><i></i>Worry about closeness</span><span><i class="dash"></i>Need for space</span></div>' : '') +
      '<p class="small">' + esc(words) + '</p></div>';
  }).join("");
  return '<div class="panel stack"><h2>Over time</h2>' + parts +
    '<button class="btn ghost" data-act="goConnect" data-t="check">Retake the check-in</button></div>';
}

/* Copy for Notion */
function fmtLong(d) { return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }); }
function notionSummary(range) {
  var end = new Date(), start;
  if (range === "session") { start = new Date(sinceTs()); }
  else { start = new Date(); start.setDate(start.getDate() - 6); }
  start.setHours(0, 0, 0, 0);
  var s0 = start.getTime(), sYmd = ymd(start), eYmd = ymd(end);
  var entries = live(S.log).filter(function (x) { return x.at >= s0; }).sort(function (a, b) { return a.at - b.at; });
  var counts = {}; entries.forEach(function (x) { counts[x.tag] = (counts[x.tag] || 0) + 1; });
  var sessions = live(S.sessions).filter(function (s) { return s.date >= sYmd && s.date <= eYmd; }).sort(function (a, b) { return a.date.localeCompare(b.date); });
  var sIds = sessions.map(function (s) { return s.id; });
  var fus = live(S.followups).filter(function (f) { return !f.done || sIds.indexOf(f.sessionId) >= 0; });
  var mp = movesProgress();
  var L = [];
  L.push("**For the Notion row**");
  L.push("Week of: " + fmtLong(start));
  if (mp.total) L.push("Small moves done: " + mp.done + " · Small moves total: " + mp.total);
  L.push("Something good: " + (counts.win || 0) + " · Bids: " + (counts.bid || 0) + " · Hit the loop: " + (counts.loop || 0) + " · Repairs: " + (counts.repair || 0) + " · Hard moments: " + (counts.hard || 0) + " · Skill practices: " + (counts.practice || 0));
  var prac = entries.filter(function (x) { return x.tag === "practice"; });
  L.push("Practice minutes: " + practiceMinutes(prac));
  L.push("Session this week: " + (sessions.length ? "Yes (" + sessions.map(function (s) { return fmtDate(s.date); }).join(", ") + ")" : "No"));
  var sc = ["p1", "p2"].filter(function (k) { return S.results[k]; }).map(function (k) { return N(k) + " worry: " + S.results[k].a + " · " + N(k) + " space: " + S.results[k].v; });
  if (sc.length) L.push(sc.join(" · "));
  L.push("");
  if (sessions.length) {
    L.push("## Sessions");
    sessions.forEach(function (s) {
      L.push("### " + fmtDate(s.date));
      if (s.worked) L.push("**What we worked on:** " + s.worked.replace(/\n+/g, " "));
      if (s.notes) { L.push(""); L.push(s.notes.trim()); }
      L.push("");
    });
  }
  if (fus.length) {
    L.push("## Follow-ups");
    fus.forEach(function (f) { L.push("- [" + (f.done ? "x" : " ") + "] " + f.text + " (" + (f.owner === "both" ? "Both" : N(f.owner)) + ")"); });
    L.push("");
  }
  if (prac.length) {
    L.push("## Skills practice");
    prac.forEach(function (x) {
      L.push("- **" + fmtDate(ymd(new Date(x.at))) + "** · " + N(x.who) + " · " + practiceName(x) + (x.seconds ? " · " + fmtMin(x.seconds) : "") + (x.helpful != null ? " · helpful " + x.helpful + "/5" : "") + (x.short ? ": " + x.short : "") + (x.noticed ? " (noticed: " + x.noticed.replace(/\n+/g, " ") + ")" : ""));
    });
    L.push("");
  }
  var other = entries.filter(function (x) { return x.tag !== "practice"; });
  if (other.length) {
    L.push("## Log");
    other.forEach(function (x) { L.push("- **" + fmtDate(ymd(new Date(x.at))) + "** · " + N(x.who) + " · " + tagLabel(x.tag) + ": " + x.text.replace(/\n+/g, " ")); });
    L.push("");
  }
  var lines = ["p1", "p2"].map(function (k) {
    var p = S.prep[k] || {}, bits = [];
    if (p.appreciate) bits.push("Appreciated: " + p.appreciate);
    if (p.hard) bits.push("Hard: " + p.hard);
    if (p.bring) bits.push("Bring up: " + p.bring);
    return bits.length ? "**" + N(k) + ":** " + bits.join(" · ") : "";
  }).filter(Boolean);
  if (lines.length) { L.push("## Our three lines"); lines.forEach(function (x) { L.push(x); L.push(""); }); }
  L.push("## Notes");
  L.push("**" + N("p1") + ":** ");
  L.push("");
  L.push("**" + N("p2") + ":** ");
  return L.join("\n");
}
function openNotion() {
  var r = ui.notionRange || "week";
  var text = notionSummary(r);
  sheet('<h2>Copy for Notion</h2>' +
    '<div class="seg"><button data-act="notionRange" data-r="week" aria-pressed="' + (r === "week") + '">Past 7 days</button><button data-act="notionRange" data-r="session" aria-pressed="' + (r === "session") + '">Since last session</button></div>' +
    '<textarea id="notionText" class="preview" readonly aria-label="Summary to paste into Notion">' + esc(text) + '</textarea>' +
    '<p class="small">In Notion, open Weekly check-ins, tap New, and paste into the page. Copy the numbers under “For the Notion row” into the matching columns.</p>' +
    '<button class="btn" data-act="notionCopy">Copy</button>' +
    (navigator.share ? '<button class="btn ghost" data-act="notionShare">Share to the Notion app</button>' : '') +
    '<button class="btn ghost" data-sheet="close">Done</button>');
}
function openCopySheet(title, text, hint) {
  sheet('<h2>' + esc(title) + '</h2>' +
    '<textarea id="notionText" class="preview" readonly aria-label="Text to paste into Notion">' + esc(text) + '</textarea>' +
    '<p class="small">' + esc(hint) + '</p>' +
    '<button class="btn" data-act="notionCopy">Copy</button>' +
    (navigator.share ? '<button class="btn ghost" data-act="notionShare">Share to the Notion app</button>' : '') +
    '<button class="btn ghost" data-sheet="close">Done</button>');
}
function copyText(t, btn) {
  var done = function () { btn.textContent = "Copied"; tap(); setTimeout(function () { if (btn.isConnected) btn.textContent = "Copy"; }, 1800); };
  var fallback = function () {
    var ta = $("notionText"); if (!ta) return;
    ta.removeAttribute("readonly"); ta.focus(); ta.select(); ta.setSelectionRange(0, ta.value.length);
    var ok = false; try { ok = document.execCommand("copy"); } catch (e) {}
    ta.setAttribute("readonly", "");
    if (ok) done(); else toast("Select the text and copy it by hand.");
  };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(done, fallback);
  else fallback();
}

/* In-app confirm, styled like a native alert */
function ask(msg, okLabel, onOk, onCancel) {
  var old = document.querySelector(".sheetwrap"); if (old) old.remove();
  var w = document.createElement("div");
  w.className = "sheetwrap";
  w.innerHTML = '<div class="sheet" role="alertdialog" aria-modal="true" aria-labelledby="askMsg"><p id="askMsg" style="font-size:18px">' + esc(msg) + '</p>' +
    '<button class="btn" data-ask="yes" style="background:var(--danger);color:var(--surface)">' + esc(okLabel) + '</button>' +
    '<button class="btn ghost" data-ask="no">Cancel</button></div>';
  document.body.appendChild(w);
  var close = function () { w.remove(); document.removeEventListener("keydown", key); };
  var key = function (e) { if (e.key === "Escape") { close(); if (onCancel) onCancel(); } };
  document.addEventListener("keydown", key);
  w.addEventListener("click", function (e) {
    var b = e.target.closest("[data-ask]");
    if (!b && e.target !== w) return;
    close();
    if (b && b.dataset.ask === "yes") onOk(); else if (onCancel) onCancel();
  });
  w.querySelector("[data-ask=no]").focus();
}

/* ================= skills (mindfulness coach) ================= */
/* Timed practice: the timer is based on clock time, so it stays right if the phone locks or the app goes to the background. */
var TARGETS = [60, 180, 300, 600];
var ticker = null, wakeLock = null, audioCtx = null;
function stopSkillTimer() {} // kept for render(); the practice timer runs independently of screens

function fmtClock(sec) { sec = Math.max(0, Math.round(sec)); return Math.floor(sec / 60) + ":" + pad2(sec % 60); }
function fmtMin(sec) { var m = sec / 60; return m < 1 ? Math.max(1, Math.round(sec)) + " sec" : (Math.round(m * 2) / 2).toString().replace(/\.0$/, "") + " min"; }
function practices(since) { return live(S.log).filter(function (x) { return x.tag === "practice" && x.at >= (since || 0); }); }
function practiceName(x) {
  if (x.kind === "cards") return "Flashcards: " + (x.deck === "life" ? "Real life" : "Concepts");
  var s = DBT_SKILLS.filter(function (k) { return k.id === x.skill; })[0];
  return s ? s.name : "Skill practice";
}
function practiceCount(id) { return practices(now() - 7 * 24 * 3600 * 1000).filter(function (x) { return x.skill === id; }).length; }
function practiceMinutes(list) { return Math.round(list.reduce(function (t, x) { return t + (x.seconds || 0); }, 0) / 60); }

function chime() {
  try {
    if (!audioCtx) return;
    [0, 0.35].forEach(function (d) {
      var o = audioCtx.createOscillator(), g = audioCtx.createGain(), t = audioCtx.currentTime + d;
      o.type = "sine"; o.frequency.value = d ? 784 : 659;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
      o.connect(g); g.connect(audioCtx.destination); o.start(t); o.stop(t + 1.3);
    });
  } catch (e) {}
  try { if (navigator.vibrate) navigator.vibrate([80, 80, 80]); } catch (e) {}
}
function keepAwake(on) {
  try {
    if (on && "wakeLock" in navigator && !wakeLock) navigator.wakeLock.request("screen").then(function (l) { wakeLock = l; l.addEventListener("release", function () { wakeLock = null; }); }).catch(function () {});
    if (!on && wakeLock) { wakeLock.release(); wakeLock = null; }
  } catch (e) {}
}
document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible" && S.active) { keepAwake(true); tick(); } });

function startPractice(i) {
  var s = DBT_SKILLS[i];
  try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); audioCtx.resume(); } catch (e) {}
  S.active = { skill: s.id, i: i, start: now(), target: ui.target || 60, chimed: false };
  save(); keepAwake(true); startTicker(); render(); tap();
}
function startTicker() { if (!ticker) ticker = setInterval(tick, 500); tick(); }
function tick() {
  var a = S.active, pill = document.getElementById("activePill");
  if (!a) { if (ticker) { clearInterval(ticker); ticker = null; } if (pill) pill.remove(); return; }
  var el = (now() - a.start) / 1000, left = a.target - el;
  if (left <= 0 && !a.chimed) { a.chimed = true; save(); chime(); toast("Goal reached. Keep going or finish."); }
  var out = $("timerOut"), arc = $("ringArc"), sub = $("timerSub");
  if (out) out.textContent = left > 0 ? fmtClock(left) : "+" + fmtClock(-left);
  if (arc) arc.style.strokeDashoffset = (119.4 * Math.max(0, left) / a.target).toFixed(1);
  if (sub) sub.textContent = left > 0 ? "Goal: " + fmtMin(a.target) + ". Elapsed " + fmtClock(el) + "." : "Goal reached. Total " + fmtClock(el) + ".";
  var onIt = ui.view === "skills" && (ui.skillsTab || "skills") === "skills" && ui.skill === a.i;
  if (onIt) { if (pill) pill.remove(); return; }
  if (!pill) {
    pill = document.createElement("button"); pill.id = "activePill"; pill.className = "activepill";
    pill.setAttribute("data-act", "openSkill"); pill.setAttribute("data-i", a.i);
    document.body.appendChild(pill);
  }
  pill.textContent = DBT_SKILLS[a.i].name + " · " + fmtClock(el);
}
function finishPractice() {
  var a = S.active; if (!a) return;
  var secs = Math.round((now() - a.start) / 1000);
  S.active = null; save(); keepAwake(false); tick(); render();
  openPracticeSheet({ kind: "skill", i: a.i, skill: a.skill, seconds: secs, at: a.start });
}
function cancelPractice() {
  ask("Stop this practice without logging it?", "Stop without logging", function () { S.active = null; save(); keepAwake(false); tick(); render(); });
}

function vSkills() {
  var t = ui.skillsTab || "skills";
  var body = t === "cards" ? vCards() : t === "history" ? vPracticeHistory() : (ui.skill != null ? vSkill(ui.skill) : vSkillList());
  return '<div class="stack">' +
    '<div class="seg"><button data-act="skillsTab" data-t="skills" aria-pressed="' + (t === "skills") + '">Skills</button><button data-act="skillsTab" data-t="cards" aria-pressed="' + (t === "cards") + '">Flashcards</button><button data-act="skillsTab" data-t="history" aria-pressed="' + (t === "history") + '">History</button></div>' +
    body + '</div>';
}
function vSkillList() {
  var wk = practices(now() - 7 * 24 * 3600 * 1000);
  var html = '<div class="stack tight"><h1>Mindfulness skills</h1><p class="lead">Your pocket coach. One skill a week, starting with Wise Mind. On a busy day, one minute of “Try it now” is the whole practice.</p></div>' +
    (wk.length ? '<button class="cardbtn" data-act="skillsTab" data-t="history"><span style="font-weight:700">This week: ' + practiceMinutes(wk) + ' min across ' + wk.length + ' practice' + (wk.length === 1 ? '' : 's') + '</span><span class="small">See your history</span></button>' : '');
  var last = "";
  DBT_SKILLS.forEach(function (s, i) {
    if (s.g !== last) { if (last) html += '</div>'; html += '<h3 class="grouplab">' + esc(s.g) + '</h3><div class="skillgrid">'; last = s.g; }
    var n = practiceCount(s.id);
    html += '<button class="cardbtn skillcard" data-act="openSkill" data-i="' + i + '"><span class="tile" aria-hidden="true">' + s.ic + '</span>' +
      '<span class="grow"><span style="font-weight:700">' + esc(s.name) + '</span><span class="clamp">' + esc(s.one) + '</span>' +
      (n ? '<span class="tag flag" style="align-self:flex-start">Practiced ' + n + '× this week</span>' : '') + '</span></button>';
  });
  return html + '</div>' + vSkillsHow();
}
function timerBlock(i) {
  var a = S.active, mine = a && a.i === i;
  if (a && !mine) {
    return '<div class="timer"><p style="flex:1">A ' + esc(DBT_SKILLS[a.i].name) + ' practice is running.</p><button class="btn inline" data-act="openSkill" data-i="' + a.i + '">Open it</button></div>';
  }
  var ring = '<div class="ring" aria-hidden="true"><svg viewBox="0 0 44 44"><circle cx="22" cy="22" r="19" fill="none" stroke="var(--line)" stroke-width="4"/><circle id="ringArc" cx="22" cy="22" r="19" fill="none" stroke="var(--b)" stroke-width="4" stroke-linecap="round" stroke-dasharray="119.4" stroke-dashoffset="' + (mine ? "0" : "119.4") + '" transform="rotate(-90 22 22)"/></svg></div>';
  if (mine) {
    return '<div class="timer">' + ring + '<div class="grow"><span class="t" id="timerOut" aria-live="off">' + fmtClock(a.target) + '</span><span class="small" id="timerSub"></span></div></div>' +
      '<button class="btn" data-act="finishPractice">Finish and log</button>' +
      '<button class="link" data-act="cancelPractice" style="align-self:center">Stop without logging</button>';
  }
  var tg = ui.target || 60;
  return '<div class="chips" role="group" aria-label="How long">' + TARGETS.map(function (t) { return '<button class="chip" data-act="target" data-s="' + t + '" aria-pressed="' + (t === tg) + '">' + (t / 60) + ' min</button>'; }).join("") + '</div>' +
    '<div class="timer">' + ring + '<div class="grow"><span class="t" id="timerOut">' + fmtClock(tg) + '</span><span class="small">The timer keeps going after the goal, so you can stay longer.</span></div></div>' +
    '<button class="btn" data-act="startPractice" data-i="' + i + '">Start</button>';
}
function vSkill(i) {
  var s = DBT_SKILLS[i], prev = DBT_SKILLS[i - 1], next = DBT_SKILLS[i + 1];
  var n = practiceCount(s.id);
  return '<button class="link" data-act="skillBack" style="align-self:flex-start">← All skills</button>' +
    '<div class="skilltop"><span class="tile big" aria-hidden="true">' + s.ic + '</span><div><p class="small" style="font-weight:700">' + esc(s.g) + '</p><h1>' + esc(s.name) + '</h1></div></div>' +
    '<p class="lead" style="color:var(--ink)">' + esc(s.one) + '</p>' +
    (s.states ? '<div class="minds"><div><strong>Reasonable</strong><span>Cool, logic only</span></div><div class="wise"><strong>Wise</strong><span>Both</span></div><div><strong>Emotion</strong><span>Hot, urges</span></div></div>' : '') +
    '<div class="panel try stack tight"><h2 style="font-size:19px">Try it now</h2><p>' + esc(s.tryit) + '</p>' + timerBlock(i) + '</div>' +
    '<div class="panel stack tight"><h2 style="font-size:19px">Why it helps</h2><p>' + esc(s.why) + '</p></div>' +
    '<div class="panel stack tight"><h2 style="font-size:19px">Practice ideas</h2><ul class="ideas">' + s.ideas.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join("") + '</ul></div>' +
    '<div class="panel stack tight"><h2 style="font-size:19px">Self-check</h2><p style="font-family:Literata,Georgia,serif;font-size:18px">' + esc(s.check) + '</p></div>' +
    '<button class="btn ghost" data-act="logPractice" data-i="' + i + '">Already practiced? Log it without the timer</button>' +
    (n ? '<p class="small" style="text-align:center">Practiced ' + n + '× in the past week</p>' : '') +
    '<p class="small">Original: ' + esc(s.src) + '</p>' +
    '<div class="row">' + (prev ? '<button class="btn ghost" data-act="openSkill" data-i="' + (i - 1) + '">← ' + esc(prev.name) + '</button>' : '<span></span>') +
      (next ? '<button class="btn ghost" data-act="openSkill" data-i="' + (i + 1) + '">' + esc(next.name) + ' →</button>' : '<span></span>') + '</div>';
}

/* Flashcards: a session starts when you open the deck and is timed until you finish or leave */
function deckOrder() {
  var d = ui.deck || "concepts";
  if (!ui.order || ui.order.length !== DBT_CARDS[d].length) ui.order = DBT_CARDS[d].map(function (_, i) { return i; });
  return ui.order;
}
function cardSession() {
  if (!ui.cards) ui.cards = { start: now(), seen: {}, deck: ui.deck || "concepts" };
  return ui.cards;
}
function endCards(auto) {
  var c = ui.cards; ui.cards = null;
  if (!c) return;
  var secs = Math.round((now() - c.start) / 1000), n = Object.keys(c.seen).length;
  if (auto) {
    if (secs < 30 || n < 2) return;
    S.log.push({ id: uid(), at: c.start, who: ME(), tag: "practice", kind: "cards", deck: c.deck, skill: "cards-" + c.deck, seconds: secs, cards: n,
      text: practiceName({ kind: "cards", deck: c.deck }) + " · " + fmtMin(secs) + " · " + n + " cards", flag: false, updatedAt: now() });
    save(); toast("Logged " + fmtMin(secs) + " of flashcards");
    return;
  }
  openPracticeSheet({ kind: "cards", deck: c.deck, skill: "cards-" + c.deck, seconds: secs, cards: n, at: c.start });
}
function vCards() {
  var d = ui.deck || "concepts", order = deckOrder(), pos = Math.min(ui.pos || 0, order.length - 1);
  var c = DBT_CARDS[d][order[pos]], sess = cardSession();
  sess.deck = d; sess.seen[d + order[pos]] = 1;
  var n = Object.keys(sess.seen).length;
  var br = function (s) { return esc(s).replace(/\n/g, "<br>"); };
  return '<div class="chips"><button class="chip" data-act="deck" data-d="concepts" aria-pressed="' + (d === "concepts") + '">Concepts (' + DBT_CARDS.concepts.length + ')</button>' +
      '<button class="chip" data-act="deck" data-d="life" aria-pressed="' + (d === "life") + '">Real life (' + DBT_CARDS.life.length + ')</button></div>' +
    '<button class="flip' + (ui.flipped ? ' on' : '') + '" data-act="flip" aria-label="Flip card"><span class="inner">' +
      '<span class="face"><span class="lab">' + (d === "life" ? "Which skill?" : "Question") + '</span><span class="fq">' + br(c[0]) + '</span><span class="hint">Tap to flip</span></span>' +
      '<span class="face back"><span class="lab">Answer</span><span class="fq">' + br(c[1]) + '</span><span class="hint">Tap to flip back</span></span>' +
    '</span></button>' +
    '<div class="between"><button class="btn ghost inline" data-act="cardPrev"' + (pos === 0 ? ' disabled' : '') + '>← Prev</button>' +
      '<span class="small" style="font-variant-numeric:tabular-nums">' + (pos + 1) + ' of ' + order.length + '</span>' +
      '<button class="btn inline" data-act="cardNext">' + (pos === order.length - 1 ? 'Start over' : 'Next →') + '</button></div>' +
    '<div class="row"><button class="btn ghost" data-act="shuffle">Shuffle</button><button class="btn ghost" data-act="finishCards">Finish and log (' + n + ' card' + (n === 1 ? '' : 's') + ')</button></div>' +
    '<p class="small">Answer in your head first, then flip. About 5 cards a day is plenty. Your time here is tracked, and if you leave after a few cards, it’s logged for you.</p>';
}

/* Practice history */
function vPracticeHistory() {
  var wk = practices(now() - 7 * 24 * 3600 * 1000), all = practices(0).sort(function (a, b) { return b.at - a.at; });
  if (!all.length) return '<div class="stack tight"><h1>Practice history</h1><p class="lead">Nothing logged yet. Open a skill, tap Start, and it shows up here with how long you practiced.</p></div>' +
    '<button class="btn" data-act="skillsTab" data-t="skills">Go to skills</button>';
  var by = {};
  wk.forEach(function (x) { var k = practiceName(x); by[k] = (by[k] || 0) + (x.seconds || 0); });
  var keys = Object.keys(by).sort(function (a, b) { return by[b] - by[a]; }), max = keys.length ? by[keys[0]] : 1;
  var bars = keys.map(function (k) {
    return '<div class="hbar"><span class="hl">' + esc(k) + '</span><span class="ht"><i style="width:' + Math.max(4, by[k] / max * 100) + '%"></i></span><span class="hv">' + fmtMin(by[k]) + '</span></div>';
  }).join("");
  var list = [], last = null;
  all.slice(0, 60).forEach(function (x) {
    var d = ymd(new Date(x.at));
    if (d !== last) { list.push('<p class="day">' + fmtDate(d) + '</p>'); last = d; }
    list.push('<button class="cardbtn" data-act="practiceOpen" data-id="' + x.id + '"><span class="between" style="width:100%"><span style="font-weight:700">' + esc(practiceName(x)) + '</span><span class="small">' + (x.seconds ? fmtMin(x.seconds) : '') + '</span></span>' +
      '<span class="meta" style="display:flex;gap:6px;flex-wrap:wrap"><span class="tag ' + x.who + '">' + esc(N(x.who)) + '</span>' + (x.helpful != null ? '<span class="tag plain">Helpful ' + x.helpful + '/5</span>' : '') + (x.cards ? '<span class="tag plain">' + x.cards + ' cards</span>' : '') + (x.bring ? '<span class="tag flag">Bring to therapy</span>' : '') + '</span>' +
      (x.short ? '<span class="clamp">' + esc(x.short) + '</span>' : '') + '</button>');
  });
  return '<div class="stack tight"><h1>Practice history</h1></div>' +
    '<div class="panel stack tight"><h2>Past 7 days</h2><p><strong>' + practiceMinutes(wk) + ' min</strong> across ' + wk.length + ' practice' + (wk.length === 1 ? '' : 's') + '.</p>' + (bars || '<p class="small">Nothing this week yet.</p>') + '</div>' +
    '<div class="panel stack tight"><h2>Send to Notion</h2><p class="small">Copy your practice to paste into Notion, or export a file to add every entry as a row in your Practice Log database.</p>' +
      '<button class="btn" data-act="practiceCopy">Copy for Notion</button><button class="btn ghost" data-act="practiceCsv">Export CSV for Notion</button></div>' +
    '<div class="stack tight">' + list.join("") + '</div>';
}
function vSkillsHow() {
  return '<div class="panel stack"><h2>How to use this</h2><ol class="ideas">' +
    '<li><strong>Skills:</strong> tap any card to open it. Go in order, one skill a week, starting with Wise Mind.</li>' +
    '<li><strong>Start with “Try it now.”</strong> Pick a length, tap Start, and do it. On a busy day, one minute is the whole practice, and it counts.</li>' +
    '<li><strong>Finish and log</strong> saves how long you practiced, plus a line on what you noticed and how helpful it was.</li>' +
    '<li><strong>Flashcards:</strong> tap a card to flip it. Concepts builds vocabulary. Real life asks which skill fits a moment. Your time is tracked too.</li>' +
    '<li><strong>History</strong> shows your minutes by skill and sends your practice to Notion.</li>' +
    '<li><strong>Want the original?</strong> Each skill lists its handout and PDF page.</li>' +
    '</ol><p class="small">For anyone reading: these are personal learning notes, written in my own words. Nothing here is for you to do.</p></div>';
}

/* Log sheet: shared by timed practice, flashcards, and logging without the timer */
function openPracticeSheet(p) {
  ui.pending = p; ui.practiceWho = ME(); ui.helpful = null;
  var name = p.kind === "cards" ? practiceName(p) : DBT_SKILLS[p.i].name;
  var mins = p.seconds ? Math.max(0.5, Math.round(p.seconds / 30) / 2) : "";
  sheet('<h2>Log practice</h2><p><strong>' + esc(name) + '</strong>' + (p.cards ? ' · ' + p.cards + ' cards' : '') + '</p>' +
    '<div><label for="pMin">Minutes</label><input type="text" id="pMin" inputmode="decimal" value="' + mins + '" placeholder="e.g. 3"></div>' +
    '<div><label for="pShort">In short <span class="small">(optional)</span></label><input type="text" id="pShort" maxlength="120" placeholder="One line, like 10 breaths with morning coffee"></div>' +
    '<div><label for="pNote">What I noticed <span class="small">(body, feeling, thought)</span></label><textarea id="pNote" rows="3"></textarea></div>' +
    '<div><p style="font-weight:700;margin-bottom:8px">Helpful? <span class="small">(0 to 5)</span></p><div class="chips" id="pHelp">' +
      [0, 1, 2, 3, 4, 5].map(function (n) { return '<button class="chip" data-act="helpful" data-n="' + n + '" aria-pressed="false" style="min-width:48px;text-align:center">' + n + '</button>'; }).join("") + '</div></div>' +
    '<label class="check"><input type="checkbox" id="pBring"><span style="text-decoration:none;color:var(--ink)">Bring this to therapy</span></label>' +
    '<div><p style="font-weight:700;margin-bottom:8px">Who practiced</p><div class="seg" id="practiceWho"><button data-act="practiceWho" data-k="p1" aria-pressed="' + (ME() === "p1") + '">' + esc(N("p1")) + '</button><button data-act="practiceWho" data-k="p2" aria-pressed="' + (ME() === "p2") + '">' + esc(N("p2")) + '</button></div></div>' +
    '<button class="btn" data-act="practiceSave">Save</button>' +
    '<button class="btn ghost" data-sheet="close">Cancel</button>');
}
function savePractice() {
  var p = ui.pending; if (!p) return;
  var m = parseFloat(String(($("pMin") || {}).value || "").replace(",", "."));
  var secs = isFinite(m) && m > 0 ? Math.round(m * 60) : (p.seconds || 0);
  var short = (($("pShort") || {}).value || "").trim(), noticed = (($("pNote") || {}).value || "").trim(), bring = !!(($("pBring") || {}).checked);
  var entry = { id: uid(), at: p.at || now(), who: ui.practiceWho || ME(), tag: "practice", kind: p.kind, skill: p.skill || (DBT_SKILLS[p.i] || {}).id, deck: p.deck,
    seconds: secs, cards: p.cards, short: short, noticed: noticed, helpful: ui.helpful, bring: bring, flag: false, updatedAt: now() };
  entry.text = practiceName(entry) + (secs ? " · " + fmtMin(secs) : "") + (short ? ": " + short : "") + (noticed ? "\nNoticed: " + noticed : "");
  S.log.push(entry); ui.pending = null;
  save(); var w = document.querySelector(".sheetwrap"); if (w) w.remove(); tap(); render(); toast("Logged" + (secs ? " " + fmtMin(secs) : ""));
}
function openPracticeDetail(id) {
  var x = find("log", id); if (!x) return;
  sheet('<h2>' + esc(practiceName(x)) + '</h2>' +
    '<p class="small">' + esc(fmtDate(ymd(new Date(x.at)))) + ' at ' + fmtTime(x.at) + ' · ' + esc(N(x.who)) + '</p>' +
    '<p><strong>' + (x.seconds ? fmtMin(x.seconds) : 'No time logged') + '</strong>' + (x.cards ? ' · ' + x.cards + ' cards' : '') + (x.helpful != null ? ' · Helpful ' + x.helpful + '/5' : '') + '</p>' +
    (x.short ? '<p>' + esc(x.short) + '</p>' : '') + (x.noticed ? '<p><strong>Noticed:</strong> ' + esc(x.noticed) + '</p>' : '') +
    (x.bring ? '<p><span class="tag flag">Bring to therapy</span></p>' : '') +
    '<button class="btn danger" data-act="practiceDel" data-id="' + x.id + '">Delete</button>' +
    '<button class="btn ghost" data-sheet="close">Done</button>');
}

/* Practice for Notion: text to paste, or a CSV whose columns match the Practice Log database */
function practiceText() {
  var since = now() - 7 * 24 * 3600 * 1000, list = practices(since).sort(function (a, b) { return a.at - b.at; });
  var L = ["**Practice, past 7 days:** " + practiceMinutes(list) + " min across " + list.length + " practices", ""];
  list.forEach(function (x) {
    L.push("### " + practiceName(x) + " · " + fmtDate(ymd(new Date(x.at))));
    L.push("- **Minutes:** " + (x.seconds ? Math.round(x.seconds / 6) / 10 : ""));
    if (x.short) L.push("- **In short:** " + x.short);
    if (x.noticed) L.push("- **What I noticed:** " + x.noticed.replace(/\n+/g, " "));
    if (x.helpful != null) L.push("- **Helpful (0–5):** " + x.helpful);
    if (x.cards) L.push("- **Cards:** " + x.cards);
    if (x.bring) L.push("- **Bring to therapy:** Yes");
    L.push("");
  });
  return L.join("\n");
}
function csvCell(v) { v = v == null ? "" : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
function practiceCsv() {
  var rows = [["In short", "Date", "Skill", "Type", "Minutes", "Helpful", "What I noticed", "Bring to therapy", "Logged by"]];
  practices(0).sort(function (a, b) { return a.at - b.at; }).forEach(function (x) {
    rows.push([x.short || practiceName(x), ymd(new Date(x.at)), practiceName(x), x.kind === "cards" ? "Flashcards" : "Skill practice",
      x.seconds ? Math.round(x.seconds / 6) / 10 : "", x.helpful != null ? x.helpful : "", x.noticed || "", x.bring ? "Yes" : "No", N(x.who)]);
  });
  return rows.map(function (r) { return r.map(csvCell).join(","); }).join("\n");
}
function shareOrDownload(filename, text, type) {
  var file;
  try { file = new File([text], filename, { type: type }); } catch (e) { file = null; }
  if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
    navigator.share({ files: [file], title: filename }).catch(function () {});
    return;
  }
  var a = document.createElement("a"), blob = new Blob([text], { type: type });
  a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

(function () {
  var css = '.grouplab{font-family:"Atkinson Hyperlegible",Arial,sans-serif;font-size:14px;font-weight:700;color:var(--muted);margin:8px 2px -4px}' +
    '.skillgrid{display:grid;grid-template-columns:1fr;gap:10px}' +
    '@media (min-width:560px){.skillgrid{grid-template-columns:1fr 1fr}}' +
    '.skillcard{flex-direction:row;align-items:flex-start;gap:14px}' +
    '.skillcard .grow{display:flex;flex-direction:column;gap:4px;min-width:0;flex:1}' +
    '.tile{flex:none;width:44px;height:44px;border-radius:12px;background:var(--sunk);display:grid;place-items:center;font-size:24px;line-height:1}' +
    '.tile.big{width:60px;height:60px;border-radius:16px;font-size:34px}' +
    '.skilltop{display:flex;gap:14px;align-items:center}' +
    '.minds{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;text-align:center}' +
    '.minds div{background:var(--surface);border-radius:14px;padding:12px 6px;display:flex;flex-direction:column;gap:2px;font-size:15px}' +
    '.minds span{font-size:13px;color:var(--muted)}' +
    '.minds .wise{background:var(--a-soft);box-shadow:inset 0 0 0 2px var(--a)}' +
    '.minds .wise strong{color:var(--a)}' +
    '.panel.try{background:var(--b-soft)}' +
    '.timer{display:flex;align-items:center;gap:14px;margin-top:4px}' +
    '.ring{width:44px;height:44px;flex:none}.ring svg{width:44px;height:44px;display:block}' +
    '#ringArc{transition:stroke-dashoffset 1s linear}' +
    '.timer .t{font-variant-numeric:tabular-nums;font-weight:700;font-size:22px;min-width:64px}' +
    '.timer .btn{margin-left:auto;min-width:110px}' +
    '.ideas{margin:0;padding-left:22px;display:flex;flex-direction:column;gap:8px}' +
    '.flip{display:block;width:100%;border:0;padding:0;background:transparent;perspective:1000px;cursor:pointer;height:300px;color:inherit;font:inherit;text-align:center}' +
    '.flip .inner{display:block;position:relative;width:100%;height:100%;transition:transform .45s;transform-style:preserve-3d}' +
    '.flip.on .inner{transform:rotateY(180deg)}' +
    '.flip .face{position:absolute;inset:0;backface-visibility:hidden;-webkit-backface-visibility:hidden;border-radius:20px;background:var(--surface);display:flex;flex-direction:column;justify-content:center;align-items:center;padding:28px 22px;box-shadow:0 1px 3px rgba(20,20,40,.08)}' +
    '.flip .face.back{transform:rotateY(180deg);background:var(--a-soft);box-shadow:inset 0 0 0 2px var(--a)}' +
    '.flip .lab{position:absolute;top:16px;left:20px;font-size:14px;font-weight:700;color:var(--muted)}' +
    '.flip .fq{font-family:Literata,Georgia,serif;font-size:21px;line-height:1.4;font-weight:600}' +
    '.flip .back .fq{font-family:"Atkinson Hyperlegible",Arial,sans-serif;font-weight:400;font-size:18px}' +
    '.flip .hint{position:absolute;bottom:14px;font-size:13px;color:var(--muted)}' +
    '.btn[disabled]{opacity:.4;pointer-events:none}' +
    '.timer .grow{display:flex;flex-direction:column;gap:2px;flex:1}' +
    '.hbar{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px 10px;align-items:center;font-size:15px}' +
    '.hbar .hl{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '.hbar .ht{grid-column:1/-1;grid-row:2}' +
    '.hbar .ht{height:10px;background:var(--sunk);border-radius:99px;overflow:hidden}.hbar .ht i{display:block;height:100%;background:var(--b);border-radius:99px}' +
    '.hbar .hv{font-variant-numeric:tabular-nums;color:var(--muted);font-size:14px}' +
    '.activepill{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(72px + env(safe-area-inset-bottom,0px));z-index:6;border:0;border-radius:999px;background:var(--b);color:var(--surface);font-weight:700;font-size:15px;padding:10px 18px;min-height:44px;box-shadow:0 4px 14px rgba(20,20,40,.25);cursor:pointer;font-variant-numeric:tabular-nums}' +
    '@media (prefers-reduced-motion:reduce){.flip .inner{transition:none}#ringArc{transition:none}}';
  var el = document.createElement("style"); el.textContent = css; document.head.appendChild(el);
})();

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
    ask("Erase everything in the app on this phone and start over? This can’t be undone.", "Erase and start over", function () {
      try { localStorage.removeItem(KEY); } catch (e) {}
      S = BLANK(); ui.run = null; ui.justDone = null; setView("setup");
    });
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
  logDel: function (b) { var x = find("log", b.dataset.id); if (x) ask("Delete this entry?", "Delete", function () { x.deleted = true; x.updatedAt = now(); ui.editLog = null; save(); render(); }); },
  logFlagItem: function (b) { var x = find("log", b.dataset.id); if (x) { x.flag = !x.flag; x.updatedAt = now(); save(); render(); } },
  logFromMoment: function () { var s = SCENES.filter(function (x) { return x.id === ui.scene; })[0]; ui.logTag = "loop"; setView("log"); var ta = $("logText"); if (ta) { ta.value = s.label + ": "; ta.focus(); } },

  /* sessions */
  sessionNew: function () { var s = { id: uid(), date: ymd(), worked: "", notes: "", updatedAt: now() }; S.sessions.push(s); save(); ui.session = s.id; render(); window.scrollTo(0, 0); },
  openSession: function (b) { ui.session = b.dataset.id; if (ui.view !== "sessions") setView("sessions"); else { render(); window.scrollTo(0, 0); } },
  sessionBack: function () { ui.session = null; render(); window.scrollTo(0, 0); },
  sessionDel: function (b) {
    var s = find("sessions", b.dataset.id); if (!s) return;
    ask("Delete this session and its follow-ups?", "Delete", function () {
      s.deleted = true; s.updatedAt = now();
      S.followups.forEach(function (f) { if (f.sessionId === s.id) { f.deleted = true; f.updatedAt = now(); } });
      ui.session = null; save(); render();
    });
  },

  /* check-in */
  startQ: function (b) { ui.run = { who: b.dataset.k, i: 0, ans: [] }; ui.justDone = null; render(); window.scrollTo(0, 0); },
  answer: function (b) {
    var r = ui.run; r.ans[r.i] = +b.dataset.k; r.i++;
    if (r.i >= ITEMS.length) {
      var a = 0, v = 0, na = 0, nv = 0;
      ITEMS.forEach(function (it, k) { if (it.d === "a") { a += r.ans[k]; na++; } else { v += r.ans[k]; nv++; } });
      S.results[r.who] = { a: +(a / na).toFixed(1), v: +(v / nv).toFixed(1), updatedAt: now() };
      S.history.push({ id: uid(), who: r.who, a: S.results[r.who].a, v: S.results[r.who].v, at: now(), updatedAt: now() });
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
    p.updatedAt = now(); S.results[b.dataset.k] = p;
    S.history.push({ id: uid(), who: b.dataset.k, a: p.a, v: p.v, at: now(), updatedAt: now(), fromCode: true });
    save(); render(); toast("Added");
  },
  copy: function (b) {
    var c = b.dataset.code;
    try { navigator.clipboard.writeText(c).then(function () { b.textContent = "Copied"; }, function () { b.textContent = "Copy didn’t work. Code: " + c; }); }
    catch (e) { b.textContent = "Copy didn’t work. Code: " + c; }
  },
  skillsTab: function (b) { if ((ui.skillsTab || "skills") === "cards" && b.dataset.t !== "cards") endCards(true); ui.skillsTab = b.dataset.t; if (b.dataset.t === "skills") ui.skill = null; render(); window.scrollTo(0, 0); },
  openSkill: function (b) { if (ui.skillsTab === "cards") endCards(true); ui.skillsTab = "skills"; ui.skill = +b.dataset.i; if (ui.view !== "skills") setView("skills"); else { render(); window.scrollTo(0, 0); } },
  skillBack: function () { ui.skill = null; render(); window.scrollTo(0, 0); },
  target: function (b) { ui.target = +b.dataset.s; render(); },
  startPractice: function (b) { startPractice(+b.dataset.i); },
  finishPractice: function () { finishPractice(); },
  cancelPractice: function () { cancelPractice(); },
  logPractice: function (b) { var i = +b.dataset.i; openPracticeSheet({ kind: "skill", i: i, skill: DBT_SKILLS[i].id, seconds: 0, at: now() }); },
  practiceWho: function (b) { ui.practiceWho = b.dataset.k; document.querySelectorAll("#practiceWho button").forEach(function (x) { x.setAttribute("aria-pressed", x === b); }); },
  helpful: function (b) { ui.helpful = +b.dataset.n; document.querySelectorAll("#pHelp button").forEach(function (x) { x.setAttribute("aria-pressed", x === b); }); },
  practiceSave: function () { savePractice(); },
  practiceOpen: function (b) { openPracticeDetail(b.dataset.id); },
  practiceDel: function (b) {
    var x = find("log", b.dataset.id); if (!x) return;
    ask("Delete this practice?", "Delete", function () { x.deleted = true; x.updatedAt = now(); save(); render(); });
  },
  finishCards: function () { endCards(false); },
  practiceCopy: function () { openCopySheet("Practice for Notion", practiceText(), "Paste into your DBT page in Notion, or into a row of your Practice Log."); },
  practiceCsv: function () { shareOrDownload("toward-practice-" + ymd() + ".csv", practiceCsv(), "text/csv"); },
  deck: function (b) { if (ui.cards && ui.cards.deck !== b.dataset.d) endCards(true); ui.deck = b.dataset.d; ui.order = null; ui.pos = 0; ui.flipped = false; render(); },
  flip: function () { ui.flipped = !ui.flipped; var f = document.querySelector(".flip"); if (f) f.classList.toggle("on", ui.flipped); },
  cardPrev: function () { if ((ui.pos || 0) > 0) { ui.pos--; ui.flipped = false; render(); } },
  cardNext: function () { var o = deckOrder(); ui.pos = (ui.pos || 0) >= o.length - 1 ? 0 : (ui.pos || 0) + 1; ui.flipped = false; render(); },
  shuffle: function () {
    var o = deckOrder().slice();
    for (var i = o.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = o[i]; o[i] = o[j]; o[j] = t; }
    ui.order = o; ui.pos = 0; ui.flipped = false; render(); toast("Shuffled");
  },
  dotInfo: function (b) { dotInfo(b.dataset.k); },
  notion: function () { ui.notionRange = ui.notionRange || "week"; openNotion(); },
  notionRange: function (b) { ui.notionRange = b.dataset.r; openNotion(); },
  notionCopy: function (b) { copyText($("notionText").value, b); },
  notionShare: function () {
    var t = $("notionText").value;
    navigator.share({ title: "Toward weekly summary", text: t }).catch(function () {});
  },
  installNow: function () {
    if (!deferredInstall) return;
    deferredInstall.prompt();
    deferredInstall.userChoice.finally(function () { deferredInstall = null; render(); });
  },
  installHide: function () { try { localStorage.setItem(KEY + "-installhint", "1"); } catch (e) {} render(); },
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
  if (A[act]) { e.preventDefault(); if (act === "answer" || act === "logAdd" || act === "fuAdd" || act === "nav") tap(); A[act](b); }
});
document.addEventListener("keydown", function (e) {
  var g = e.target.closest && e.target.closest(".dot");
  if (g && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); dotInfo(g.dataset.k); }
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
  if (!Array.isArray(inc.history)) inc.history = [];
  ["sessions", "followups", "log", "history"].forEach(function (k) {
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
/* Emergency reset: open the app's link with #reset at the end to erase this phone and start over. */
function hardReset() {
  try { localStorage.removeItem(KEY); } catch (e) {}
  S = BLANK(); ui.run = null; ui.justDone = null; ui.session = null;
  history.replaceState(null, "", "#setup");
}
if (S.active) startTicker();
document.addEventListener("visibilitychange", function () {
  if (document.visibilityState === "hidden" && ui.cards) { endCards(true); }
  if (document.visibilityState === "visible" && ui.view === "skills" && ui.skillsTab === "cards" && !ui.cards) cardSession();
});
function askReset() {
  ask("Start over? This erases everything saved in this app on this phone.", "Erase and start over",
    function () { hardReset(); setView("setup", false); },
    function () { setView("prep"); });
}
window.addEventListener("hashchange", function () { if (location.hash === "#reset") askReset(); });
if (location.hash === "#reset") { history.replaceState(null, "", "#prep"); setView("prep", false); askReset(); }
else setView((location.hash || "").slice(1) || "prep", false);
})();
