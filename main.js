const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));
const pad2 = n => String(n).padStart(2, '0');
const toKey = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const parseKey = key => { const [y, m, dd] = key.split('-').map(Number); return new Date(y, m - 1, dd); };
const clampISO = (d) => d.toISOString().slice(0, 16);
const cmpKey = (a, b) => a === b ? 0 : (a < b ? -1 : 1);
const inRangeKey = (k, startK, endK) => cmpKey(startK, k) <= 0 && cmpKey(k, endK) <= 0;
const LS_KEY = 'club.events.v2';

let EVENTS = [];

function save() {
    localStorage.setItem(LS_KEY, JSON.stringify(EVENTS));
}
function escICS(t) {
    return String(t).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
}

function toICSDateTime(localISO) {
    const [date, time = '00:00'] = localISO.split('T');
    const [y, m, d] = date.split('-'); const [hh, mm] = time.split(':');
    return `${y}${m}${d}T${hh}${mm}00`;
}

function buildICS(events) {
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Club Calendar//Static//KO'];
    for (const ev of events) {
        lines.push('BEGIN:VEVENT');
        lines.push('UID:' + (ev.id + '@clubcal'));
        lines.push('DTSTAMP:' + toICSDateTime(clampISO(new Date())));
        lines.push('DTSTART:' + toICSDateTime(ev.startISO));
        lines.push('DTEND:' + toICSDateTime(ev.endISO));
        lines.push('SUMMARY:' + escICS(ev.title));
        if (ev.location) lines.push('LOCATION:' + escICS(ev.location));
        if (ev.notes) lines.push('DESCRIPTION:' + escICS(ev.notes));
        lines.push('END:VEVENT');
    }
    lines.push('END:VCALENDAR');
    return lines.join('\r\n');
}
function download(filename, text) {
    const blob = new Blob([text], { type: 'text/calendar' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
}
function parseICS(text) {
    const lines = text.replace(/\r\n/g, '\n').split('\n');
    const unfolded = [];
    for (const line of lines) {
        if (line.startsWith(' ') && unfolded.length) unfolded[unfolded.length - 1] += line.slice(1);
        else unfolded.push(line);
    }
    const out = []; let cur = null;
    for (const line of unfolded) {
        if (line === 'BEGIN:VEVENT') cur = {};
        else if (line === 'END:VEVENT') { if (cur) out.push(cur), cur = null; }
        else if (cur) {
            const [rawKey, ...rest] = line.split(':');
            const val = rest.join(':');
            const key = rawKey.split(';')[0];
            if (key === 'UID') cur.uid = val;
            if (key === 'SUMMARY') cur.title = val.replace(/\\n/g, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\');
            if (key === 'DTSTART') cur.dtstart = val;
            if (key === 'DTEND') cur.dtend = val;
            if (key === 'LOCATION') cur.location = val.replace(/\\n/g, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\');
            if (key === 'DESCRIPTION') cur.notes = val.replace(/\\n/g, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\');
        }
    }
    const toLocalISO = (dt) => {
        const m = dt?.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?Z?)?$/);
        if (!m) { const now = new Date(); return clampISO(now); }
        const [, y, mo, d, hh = '00', mm = '00', ss = '00'] = m;
        const date = new Date(+y, +mo - 1, +d, +hh, +mm, +ss);
        return clampISO(date);
    };
    return out.map(e => {
        const startISO = toLocalISO(e.dtstart);
        const endISO = toLocalISO(e.dtend || e.dtstart);
        const startKey = startISO.slice(0, 10);
        const endKey = endISO.slice(0, 10);
        return {
            id: (e.uid || hash(e.title + startISO + endISO)),
            title: e.title || '(제목 없음)',
            startISO, endISO, startKey, endKey,
            location: e.location || '', notes: e.notes || '',
        };
    });
}
function hash(s) { let h = 0; for (let i = 0; i < s.length; i++) { h = ((h << 5) - h) + s.charCodeAt(i); h |= 0; } return 'e' + Math.abs(h); }

let current = new Date(); current.setDate(1);
let selectedKey = toKey(new Date());

function renderCalendar() {
    $('#calYear').textContent = String(current.getFullYear());
    $('#calMonth').textContent = String(current.getMonth() + 1);

    const cal = $('#calendar'); cal.innerHTML = '';
    const weekHeader = ['일', '월', '화', '수', '목', '금', '토'];
    const header = document.createElement('div'); header.className = 'cal-row header';
    for (const w of weekHeader) {
        const cell = document.createElement('div'); cell.className = 'cal-cell head'; cell.textContent = w; header.appendChild(cell);
    }
    cal.appendChild(header);

    const first = new Date(current.getFullYear(), current.getMonth(), 1);
    const last = new Date(current.getFullYear(), current.getMonth() + 1, 0);
    const offset = first.getDay(); const days = last.getDate();

    let row = document.createElement('div'); row.className = 'cal-row';
    for (let i = 0; i < offset; i++) { const c = document.createElement('div'); c.className = 'cal-cell blank'; row.appendChild(c); }

    for (let d = 1; d <= days; d++) {
        if ((offset + d - 1) % 7 === 0 && row.childElementCount) { cal.appendChild(row); row = document.createElement('div'); row.className = 'cal-row'; }
        const date = new Date(current.getFullYear(), current.getMonth(), d);
        const key = toKey(date);
        const c = document.createElement('button');
        c.type = 'button'; c.className = 'cal-cell day'; c.setAttribute('data-date', key);
        c.innerHTML = `<div class="d">${d}</div>`;
        const has = EVENTS.some(e => inRangeKey(key, e.startKey, e.endKey));
        if (has) { const dot = document.createElement('span'); dot.className = 'dot'; c.appendChild(dot); }
        if (key === selectedKey) c.classList.add('selected');
        c.addEventListener('click', () => { selectedKey = key; renderDay(); $$('.cal-cell.day.selected').forEach(el => el.classList.remove('selected')); c.classList.add('selected'); });
        row.appendChild(c);
    }
    while (row.childElementCount < 7) { const c = document.createElement('div'); c.className = 'cal-cell blank'; row.appendChild(c); }
    cal.appendChild(row);
}

function renderDay() {
    const d = parseKey(selectedKey);
    $('#dayLabel').textContent = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    const list = $('#eventList'); list.innerHTML = '';

    const items = EVENTS
        .filter(e => inRangeKey(selectedKey, e.startKey, e.endKey))
        .sort((a, b) => a.startISO.localeCompare(b.startISO));

    if (items.length === 0) { list.innerHTML = '<li class="muted">이 날짜의 일정이 없습니다.</li>'; return; }

    for (const ev of items) {
        const li = document.importNode($('#eventItemTpl').content, true);
        let label = '';
        if (ev.startKey === ev.endKey) { // same day
            label = `${ev.startISO.slice(11, 16)}–${ev.endISO.slice(11, 16)}`;
        } else if (selectedKey === ev.startKey) {
            label = `${ev.startISO.slice(11, 16)}–▶`;
        } else if (selectedKey === ev.endKey) {
            label = `◀–${ev.endISO.slice(11, 16)}`;
        } else {
            label = '종일';
        }
        li.querySelector('.event-time').textContent = label;
        li.querySelector('.event-title').textContent = ev.title;
        const sub = [];
        if (ev.location) sub.push(ev.location);
        if (ev.notes) sub.push(ev.notes.length > 30 ? ev.notes.slice(0, 30) + '…' : ev.notes);
        li.querySelector('.event-sub').textContent = sub.join(' · ');
        li.querySelector('.edit').addEventListener('click', () => loadToForm(ev.id));
        li.querySelector('.delete').addEventListener('click', () => removeEvent(ev.id));
        list.appendChild(li);
    }
}

const form = $('#eventForm');
form.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const title = String(fd.get('title') || '').trim();
    let startDate = String(fd.get('date') || '').trim();
    let endDate = String(fd.get('endDate') || '').trim();
    const start = String(fd.get('start') || '').trim();
    const end = String(fd.get('end') || '').trim();
    const location = String(fd.get('location') || '').trim();
    const notes = String(fd.get('notes') || '').trim();

    if (!title || !startDate || !start || !end) { alert('제목/날짜/시간을 입력해 주세요'); return; }
    if (!endDate) endDate = startDate;

    if (endDate === startDate && end < start) {
        const dt = parseKey(startDate); dt.setDate(dt.getDate() + 1);
        endDate = toKey(dt);
    }

    const startISO = `${startDate}T${start}`;
    const endISO = `${endDate}T${end}`;

    if (endISO < startISO) { alert('종료가 시작보다 빠릅니다'); return; }

    const startKey = startDate;
    const endKey = endDate;

    const editId = form.dataset.editId;
    if (editId) {
        const idx = EVENTS.findIndex(e => e.id === editId);
        if (idx > -1) EVENTS[idx] = { id: editId, title, startISO, endISO, startKey, endKey, location, notes };
        delete form.dataset.editId; $('#createEventBtn').textContent = '추가';
    } else {
        const id = hash(title + startISO + endISO + Math.random());
        EVENTS.push({ id, title, startISO, endISO, startKey, endKey, location, notes });
    }
    save(); renderCalendar(); selectedKey = startKey; renderDay(); form.reset();
});

function loadToForm(id) {
    const ev = EVENTS.find(e => e.id === id); if (!ev) return;
    $('#title').value = ev.title;
    $('#date').value = ev.startISO.slice(0, 10);
    $('#endDate').value = ev.endISO.slice(0, 10);
    $('#start').value = ev.startISO.slice(11, 16);
    $('#end').value = ev.endISO.slice(11, 16);
    $('#location').value = ev.location || '';
    $('#notes').value = ev.notes || '';
    form.dataset.editId = id;
    $('#createEventBtn').textContent = '수정 저장';
}
function removeEvent(id) {
    if (!confirm('이 일정을 삭제할까요?')) return;
    EVENTS = EVENTS.filter(e => e.id !== id);
    save(); renderCalendar(); renderDay();
}

$('#downloadIcsBtn').addEventListener('click', () => {
    if (!EVENTS.length) { alert('내보낼 일정이 없습니다.'); return; }
    download('club-events.ics', buildICS(EVENTS));
});
$('#importIcsInput').addEventListener('change', async (e) => {
    const file = e.target.files[0]; if (!file) return;
    const text = await file.text();
    const imported = parseICS(text);
    const keyOf = (ev) => ev.id + '|' + ev.title + '|' + ev.startISO;
    const existing = new Set(EVENTS.map(keyOf));
    let added = 0, updated = 0;
    for (const ev of imported) {
        const k = keyOf(ev);
        const idx = EVENTS.findIndex(e => e.id === ev.id || (e.title === ev.title && e.startISO === ev.startISO));
        if (idx > -1) { EVENTS[idx] = ev; updated++; }
        else if (!existing.has(k)) { EVENTS.push(ev); added++; }
    }
    save(); renderCalendar(); renderDay();
    alert(`가져오기 완료 — 새 ${added}건, 업데이트 ${updated}건`);
    e.target.value = '';
});

$('#prevMonth').addEventListener('click', () => { current.setMonth(current.getMonth() - 1); renderCalendar(); });
$('#nextMonth').addEventListener('click', () => { current.setMonth(current.getMonth() + 1); renderCalendar(); });

(function init() {
    const now = new Date();
    $('#date').value = toKey(now);
    $('#start').value = '18:00';
    $('#end').value = '19:00';
    renderCalendar();
    selectedKey = toKey(new Date());
    renderDay();
})();


(function themeInit() {
    const root = document.documentElement;
    const btn = document.getElementById('themeButton');
    const menu = document.getElementById('themeMenu');
    const label = document.getElementById('themeLabel');
    const options = Array.from(menu.querySelectorAll('[role="option"]'));

    function setTheme(theme) {
        root.classList.remove('theme-dark', 'theme-neon');
        if (theme === 'dark') root.classList.add('theme-dark');
        else if (theme === 'neon') root.classList.add('theme-neon');
        label.textContent = theme === 'dark' ? '다크' : theme === 'neon' ? '네온' : '밝음';
        options.forEach(li => li.setAttribute('aria-selected', li.dataset.theme === theme ? 'true' : 'false'));
    }

    function openMenu() { menu.classList.add('open'); btn.setAttribute('aria-expanded', 'true'); menu.focus(); }
    function closeMenu() { menu.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); }

    setTheme('light');

    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (menu.classList.contains('open')) closeMenu(); else openMenu();
    });

    options.forEach(li => {
        li.tabIndex = 0;
        li.addEventListener('click', () => { setTheme(li.dataset.theme); closeMenu(); btn.focus(); });
        li.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setTheme(li.dataset.theme); closeMenu(); btn.focus(); } });
    });

    menu.addEventListener('keydown', (e) => {
        const idx = options.findIndex(li => li.getAttribute('aria-selected') === 'true');
        if (e.key === 'Escape') { closeMenu(); btn.focus(); }
        else if (e.key === 'ArrowDown') { e.preventDefault(); const n = (idx + 1) % options.length; options[n].focus(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); const p = (idx - 1 + options.length) % options.length; options[p].focus(); }
    });

    document.addEventListener('click', (e) => {
        if (!menu.classList.contains('open')) return;
        if (!menu.contains(e.target) && !btn.contains(e.target)) closeMenu();
    });
})();
