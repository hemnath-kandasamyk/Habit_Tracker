/* ================================================================
   HabitGrid — script.js
   Google Sheets backend via Google Apps Script (doGet / doPost)
   ================================================================ */

// ── CONFIG ──────────────────────────────────────────────────────
// 🔴 REPLACE THIS with your deployed Google Apps Script Web App URL
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbx2IatZWCUD9mQbcuLKgfM67CuiZJf5D8Jj7_mgGAqFIuNedkvLf4iTmejax0gC1IBb/exec';

// Month / Year tracked (April 2026)
const TRACK_YEAR  = 2026;
const TRACK_MONTH = 3; // 0-indexed: 3 = April

// Habit definitions
const HABITS = [
  { key: 'workout_yoga',  label: 'Workout / Yoga', emoji: '🏋️', color: '#f97316', colorRaw: '249,115,22'  },
  { key: 'reading',       label: 'Reading',         emoji: '📖', color: '#3b82f6', colorRaw: '59,130,246'  },
  { key: 'learning',      label: 'Learning',        emoji: '🧠', color: '#8b5cf6', colorRaw: '139,92,246'  },
  { key: 'ice_bath_wash', label: 'Ice Bath / Wash', emoji: '🧊', color: '#06b6d4', colorRaw: '6,182,212'   },
  { key: 'self_control',  label: 'Self Control',    emoji: '🎯', color: '#22c55e', colorRaw: '34,197,94'   },
  { key: 'audio_creation',label: 'Audio Creation',  emoji: '🎙️', color: '#ec4899', colorRaw: '236,72,153'  },
];

// Days in April 2026
const DAYS_IN_MONTH = new Date(TRACK_YEAR, TRACK_MONTH + 1, 0).getDate(); // 30

// ── STATE ───────────────────────────────────────────────────────
let currentUser  = null;
let habitData    = {};   // { "habit_key|YYYY-MM-DD": true/false }
let pendingCells = new Set(); // track in-flight saves

// ── INIT ─────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  currentUser = localStorage.getItem('hg_user');
  if (!currentUser) { window.location.href = 'index.html'; return; }

  document.getElementById('userBadge').textContent = currentUser;
  document.getElementById('logoutBtn').addEventListener('click', logout);

  buildTable();
  loadData();
});

function logout() {
  localStorage.removeItem('hg_user');
  window.location.href = 'index.html';
}

// ── DATE UTILS ───────────────────────────────────────────────────
function todayDate() {
  // Use April 2026 context. Real today for production.
  return new Date();
}

function isoDate(day) {
  const m = String(TRACK_MONTH + 1).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${TRACK_YEAR}-${m}-${d}`;
}

function isToday(day) {
  const now = todayDate();
  return now.getFullYear() === TRACK_YEAR &&
         now.getMonth()    === TRACK_MONTH &&
         now.getDate()     === day;
}

function isPast(day) {
  const now = todayDate();
  const cellDate = new Date(TRACK_YEAR, TRACK_MONTH, day);
  const today    = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return cellDate < today;
}

function isFuture(day) {
  return !isToday(day) && !isPast(day);
}

function isWeekend(day) {
  const d = new Date(TRACK_YEAR, TRACK_MONTH, day);
  return d.getDay() === 0 || d.getDay() === 6;
}

// ── BUILD TABLE ───────────────────────────────────────────────────
function buildTable() {
  const headerRow = document.getElementById('dateHeaderRow');
  const body      = document.getElementById('habitBody');

  // Header: date columns
  for (let d = 1; d <= DAYS_IN_MONTH; d++) {
    const th = document.createElement('th');
    th.className = 'date-th' +
      (isToday(d)   ? ' today-col'  : '') +
      (isWeekend(d) ? ' weekend'    : '');
    const dayOfWeek = ['Su','Mo','Tu','We','Th','Fr','Sa'][new Date(TRACK_YEAR, TRACK_MONTH, d).getDay()];
    th.innerHTML = `<div>${d}</div><div style="font-size:0.55rem;opacity:0.6">${dayOfWeek}</div>`;
    headerRow.appendChild(th);
  }

  // Rows: one per habit
  HABITS.forEach(habit => {
    const tr = document.createElement('tr');
    tr.className = 'habit-row';
    tr.dataset.habit = habit.key;

    // Sticky habit name cell
    const nameTd = document.createElement('td');
    nameTd.className = 'habit-name-cell';
    nameTd.innerHTML = `
      <div class="habit-name-inner">
        <div class="habit-color-bar" style="background:${habit.color}"></div>
        <span class="habit-emoji">${habit.emoji}</span>
        <span class="habit-label">${habit.label}</span>
      </div>`;
    tr.appendChild(nameTd);

    // Day cells
    for (let d = 1; d <= DAYS_IN_MONTH; d++) {
      const td = document.createElement('td');
      td.className = 'cell-td' + (isToday(d) ? ' today-col-cell' : '');
      td.dataset.day = d;

      const circle = document.createElement('div');
      circle.className = 'circle' + (isToday(d) ? ' today-circle' : '') + (isFuture(d) ? ' locked' : '');
      circle.dataset.habit = habit.key;
      circle.dataset.day   = d;
      circle.style.setProperty('--habit-color', habit.color);
      circle.style.setProperty('--habit-color-raw', habit.colorRaw);

      if (!isFuture(d)) {
        circle.addEventListener('click', onCircleClick);
      }

      td.appendChild(circle);
      tr.appendChild(td);
    }

    body.appendChild(tr);
  });

  buildSummaryCards();
}

// ── SUMMARY CARDS ─────────────────────────────────────────────────
function buildSummaryCards() {
  const row = document.getElementById('summaryRow');
  row.innerHTML = '';
  HABITS.forEach(habit => {
    const card = document.createElement('div');
    card.className = 'summary-card';
    card.dataset.habitCard = habit.key;
    card.style.setProperty('--habit-color', habit.color);
    card.innerHTML = `
      <div class="summary-habit-name">${habit.emoji} ${habit.label}</div>
      <div class="summary-streak" id="streak-${habit.key}">0</div>
      <div class="summary-streak-label">day streak</div>
      <div class="summary-completion" id="comp-${habit.key}">0 / ${DAYS_IN_MONTH}</div>`;
    row.appendChild(card);
  });
}

// ── LOAD DATA FROM GOOGLE SHEETS ─────────────────────────────────
async function loadData() {
  showLoader(true);
  try {
    const url = `${APPS_SCRIPT_URL}?username=${encodeURIComponent(currentUser)}`;
    const res  = await fetch(url);
    if (!res.ok) throw new Error('Network error');
    const json = await res.json();

    habitData = {};
    if (json.data && Array.isArray(json.data)) {
      json.data.forEach(row => {
        // Expected: { username, date, habit, status }
        const key = `${row.habit}|${row.date}`;
        habitData[key] = row.status === true || row.status === 'TRUE' || row.status === 'true';
      });
    }
  } catch (err) {
    console.warn('Could not load from Sheets (offline/demo mode):', err.message);
    showToast('⚠️ Running in demo mode (Sheets not connected)');
  }

  renderAllCells();
  updateAllSummaries();
  showLoader(false);
}

// ── RENDER ────────────────────────────────────────────────────────
function renderAllCells() {
  document.querySelectorAll('.circle').forEach(circle => {
    const habit = circle.dataset.habit;
    const day   = parseInt(circle.dataset.day);
    const key   = `${habit}|${isoDate(day)}`;
    const done  = habitData[key] === true;
    circle.classList.toggle('done', done);
  });
}

function renderCell(habit, day) {
  const circle = document.querySelector(`.circle[data-habit="${habit}"][data-day="${day}"]`);
  if (!circle) return;
  const key  = `${habit}|${isoDate(day)}`;
  const done = habitData[key] === true;
  circle.classList.toggle('done', done);
}

// ── CLICK HANDLER ─────────────────────────────────────────────────
function onCircleClick(e) {
  const circle = e.currentTarget;
  const habit  = circle.dataset.habit;
  const day    = parseInt(circle.dataset.day);

  if (isFuture(day) || circle.classList.contains('pending')) return;

  const key    = `${habit}|${isoDate(day)}`;
  const newVal = !(habitData[key] === true);

  // Optimistic update
  habitData[key] = newVal;
  renderCell(habit, day);
  updateSummary(habit);

  // Send to Sheets
  saveRecord(habit, day, newVal, circle);
}

// ── SAVE TO GOOGLE SHEETS ─────────────────────────────────────────
async function saveRecord(habit, day, status, circleEl) {
  const dateStr = isoDate(day);
  circleEl.classList.add('pending');

  const payload = {
    username: currentUser,
    date: dateStr,
    habit: habit,
    status: status
  };

  try {
    const res = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      // Google Apps Script requires no-cors for direct POST or use a CORS proxy
      mode: 'no-cors'
    });
    // no-cors returns opaque response; assume success
    circleEl.classList.remove('pending');
    showToast(status ? '✓ Marked complete' : '○ Unmarked');
  } catch (err) {
    console.error('Save failed:', err);
    circleEl.classList.remove('pending');
    showToast('❌ Save failed — check connection');
  }
}

// ── STREAK & SUMMARY ─────────────────────────────────────────────
function calcStreak(habitKey) {
  // Current consecutive streak ending at today (or most recent past day)
  const now = todayDate();
  let streak = 0;

  for (let d = DAYS_IN_MONTH; d >= 1; d--) {
    const cellDate = new Date(TRACK_YEAR, TRACK_MONTH, d);
    const today    = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (cellDate > today) continue; // skip future

    const key  = `${habitKey}|${isoDate(d)}`;
    const done = habitData[key] === true;
    if (done) {
      streak++;
    } else {
      break; // streak broken
    }
  }
  return streak;
}

function calcCompletion(habitKey) {
  let count = 0;
  const now   = todayDate();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  for (let d = 1; d <= DAYS_IN_MONTH; d++) {
    const cellDate = new Date(TRACK_YEAR, TRACK_MONTH, d);
    if (cellDate > today) break;
    const key = `${habitKey}|${isoDate(d)}`;
    if (habitData[key] === true) count++;
  }
  return count;
}

function updateSummary(habitKey) {
  const streak = calcStreak(habitKey);
  const comp   = calcCompletion(habitKey);
  const streakEl = document.getElementById(`streak-${habitKey}`);
  const compEl   = document.getElementById(`comp-${habitKey}`);
  if (streakEl) streakEl.textContent = streak;
  if (compEl)   compEl.textContent   = `${comp} / ${DAYS_IN_MONTH}`;
}

function updateAllSummaries() {
  HABITS.forEach(h => updateSummary(h.key));
}

// ── UI HELPERS ───────────────────────────────────────────────────
function showLoader(show) {
  const el = document.getElementById('loadingOverlay');
  if (show) {
    el.classList.remove('hidden');
  } else {
    setTimeout(() => el.classList.add('hidden'), 300);
  }
}

let toastTimer = null;
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}


/* ================================================================
   GOOGLE APPS SCRIPT — paste into a new Apps Script project
   ================================================================

function doGet(e) {
  const username = e.parameter.username;
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('habits');
  const data  = sheet.getDataRange().getValues();
  const headers = data[0]; // username | date | habit | status
  const results = [];

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === username) {
      results.push({
        username: data[i][0],
        date:     data[i][1],
        habit:    data[i][2],
        status:   data[i][3]
      });
    }
  }

  return ContentService
    .createTextOutput(JSON.stringify({ data: results }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  const body    = JSON.parse(e.postData.contents);
  const sheet   = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('habits');
  const data    = sheet.getDataRange().getValues();

  // Find existing row
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === body.username &&
        String(data[i][1]) === String(body.date) &&
        data[i][2] === body.habit) {
      sheet.getRange(i + 1, 4).setValue(body.status); // update status
      return ContentService
        .createTextOutput(JSON.stringify({ success: true, action: 'updated' }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  // Insert new row
  sheet.appendRow([body.username, body.date, body.habit, body.status]);
  return ContentService
    .createTextOutput(JSON.stringify({ success: true, action: 'inserted' }))
    .setMimeType(ContentService.MimeType.JSON);
}

================================================================ */
