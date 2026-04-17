(() => {
  if (document.getElementById('ftd-root')) return;

  // ── Shadow DOM setup ───────────────────────────────────────────────────────

  const root = document.createElement('div');
  root.id = 'ftd-root';
  document.body.appendChild(root);

  const shadow = root.attachShadow({ mode: 'open' });

  const styleLink = document.createElement('link');
  styleLink.rel = 'stylesheet';
  styleLink.href = chrome.runtime.getURL('content.css');
  shadow.appendChild(styleLink);

  const inner = document.createElement('div');
  inner.style.cssText = 'display:contents';
  shadow.appendChild(inner);

  inner.innerHTML = `
    <div id="ftd-tab">📋 Daily</div>
    <div id="ftd-drawer">
      <div id="ftd-inner">

        <div class="ftd-topbar">
          <div class="ftd-topbar-left">
            <h2>Daily To-Do</h2>
            <span class="ftd-date" id="ftd-date"></span>
          </div>
          <div class="ftd-actions">
            <button class="ftd-icon-btn" id="ftd-pin" title="Pin panel">📌</button>
            <button class="ftd-icon-btn" id="ftd-theme" title="Switch to dark">🌙</button>
            <button class="ftd-icon-btn" id="ftd-export" title="Export weekly wrap-up">📥</button>
            <button class="ftd-icon-btn" id="ftd-clear" title="Clear completed">🧹</button>
          </div>
        </div>

        <div class="ftd-progress-wrap">
          <div class="ftd-progress-meta">
            <span id="ftd-prog-text">0 / 0 done</span>
            <span id="ftd-prog-pct">0%</span>
          </div>
          <div class="ftd-progress-track">
            <div class="ftd-progress-fill" id="ftd-prog-fill"></div>
          </div>
        </div>

        <div class="ftd-scroll" id="ftd-todo-scroll">
          <div id="ftd-todo-view"></div>
        </div>

        <div class="ftd-add-area">
          <div class="ftd-add-row">
            <input class="ftd-input" id="ftd-input" placeholder="Add todo… (Enter to confirm)" />
            <select class="ftd-tag-sel" id="ftd-tag-sel">
              <option value="">none</option>
              <option value="work">work</option>
              <option value="life">life</option>
              <option value="learn">learn</option>
            </select>
            <button class="ftd-add-btn" id="ftd-add-btn">+</button>
          </div>
        </div>

      </div>
    </div>
  `;

  const $  = id  => shadow.querySelector('#' + id);
  const $$ = sel => shadow.querySelectorAll(sel);

  // ── State & Storage ────────────────────────────────────────────────────────

  const STORE_KEY = 'ftd-todos-v1';
  const THEME_KEY = 'ftd-theme-v1';
  const DOCK_KEY  = 'ftd-dock-v1';

  let state = { items: [] };
  let isDark = false;
  const expandedIds = new Set();
  const previewIds  = new Set();
  const noteTimers  = {};

  // ── Dock state ─────────────────────────────────────────────────────────────
  // edge: 'right' | 'left' | 'top' | 'bottom'
  // pos:  percentage (0–100) along the edge for the panel's center

  let dockEdge = 'right';
  let dockPos  = 50;

  const EDGE_CLASSES = ['ftd-edge-left', 'ftd-edge-top', 'ftd-edge-bottom'];

  function applyDock() {
    root.classList.remove(...EDGE_CLASSES);

    // Override all sides to 'auto' first so old values don't bleed through
    root.style.right     = 'auto';
    root.style.left      = 'auto';
    root.style.top       = 'auto';
    root.style.bottom    = 'auto';
    root.style.transform = 'none';

    const pct = `${Math.min(85, Math.max(15, dockPos))}%`;

    switch (dockEdge) {
      case 'right':
        root.style.right     = '0';
        root.style.top       = pct;
        root.style.transform = 'translateY(-50%)';
        break;
      case 'left':
        root.classList.add('ftd-edge-left');
        root.style.left      = '0';
        root.style.top       = pct;
        root.style.transform = 'translateY(-50%)';
        break;
      case 'top':
        root.classList.add('ftd-edge-top');
        root.style.top       = '0';
        root.style.left      = pct;
        root.style.transform = 'translateX(-50%)';
        break;
      case 'bottom':
        root.classList.add('ftd-edge-bottom');
        root.style.bottom    = '0';
        root.style.left      = pct;
        root.style.transform = 'translateX(-50%)';
        break;
    }
  }

  function saveDock() {
    chrome.storage.local.set({ [DOCK_KEY]: { edge: dockEdge, pos: dockPos } });
  }

  // Apply defaults immediately so the panel is positioned on first paint
  applyDock();

  // ── Drag-to-dock ───────────────────────────────────────────────────────────

  const tabEl = shadow.querySelector('#ftd-tab');

  tabEl.addEventListener('mousedown', e => {
    e.preventDefault(); // prevent text selection while dragging

    const startX = e.clientX;
    const startY = e.clientY;
    let dragging = false;

    function onMove(e) {
      if (!dragging) {
        // Start drag only after a small threshold
        if (Math.hypot(e.clientX - startX, e.clientY - startY) < 6) return;
        dragging = true;
        root.classList.add('ftd-dragging');
      }

      // Float the panel freely under the cursor
      root.style.right     = 'auto';
      root.style.bottom    = 'auto';
      root.style.left      = e.clientX + 'px';
      root.style.top       = e.clientY + 'px';
      root.style.transform = 'translate(-50%, -50%)';
      root.classList.remove(...EDGE_CLASSES);
    }

    function onUp(e) {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      root.classList.remove('ftd-dragging');

      if (!dragging) return; // was a click — do nothing

      const W = window.innerWidth;
      const H = window.innerHeight;
      const cx = e.clientX;
      const cy = e.clientY;

      // Snap to nearest edge
      const dists = { right: W - cx, left: cx, top: cy, bottom: H - cy };
      dockEdge = Object.keys(dists).reduce((a, b) => dists[a] <= dists[b] ? a : b);

      dockPos = (dockEdge === 'right' || dockEdge === 'left')
        ? (cy / H) * 100
        : (cx / W) * 100;

      applyDock();
      saveDock();
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });

  // ── Storage ────────────────────────────────────────────────────────────────

  function loadState(cb) {
    chrome.storage.local.get([STORE_KEY, THEME_KEY, DOCK_KEY], (res) => {
      if (res[STORE_KEY]) state = res[STORE_KEY];
      // Migrate old items (done: boolean → status string)
      state.items = state.items.map(item => {
        if (item.status === undefined) item.status = item.done ? 'done' : 'pending';
        if (item.completedAt === undefined) item.completedAt = item.done ? null : null;
        if (item.dueDate === undefined) item.dueDate = null;
        return item;
      });
      isDark = res[THEME_KEY] === 'dark';
      applyTheme();
      if (res[DOCK_KEY]) {
        dockEdge = res[DOCK_KEY].edge || 'right';
        dockPos  = res[DOCK_KEY].pos  ?? 50;
      }
      applyDock();
      renderTodos();
      cb && cb();
    });
  }

  function saveState() {
    chrome.storage.local.set({ [STORE_KEY]: state });
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  // ── Date badge ────────────────────────────────────────────────────────────

  const now  = new Date();
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  $('ftd-date').textContent =
    `${now.getMonth()+1}/${now.getDate()} ${days[now.getDay()]}`;

  // ── Pin ───────────────────────────────────────────────────────────────────

  let pinned = false;
  const pinBtn = $('ftd-pin');
  pinBtn.addEventListener('click', () => {
    pinned = !pinned;
    root.classList.toggle('ftd-pinned', pinned);
    pinBtn.classList.toggle('ftd-active', pinned);
    pinBtn.title = pinned ? 'Unpin panel' : 'Pin panel';
  });

  // ── Theme ─────────────────────────────────────────────────────────────────

  function applyTheme() {
    root.classList.toggle('ftd-dark', isDark);
    const btn = $('ftd-theme');
    btn.textContent = isDark ? '☀️' : '🌙';
    btn.title = isDark ? 'Switch to light' : 'Switch to dark';
  }

  $('ftd-theme').addEventListener('click', () => {
    isDark = !isDark;
    chrome.storage.local.set({ [THEME_KEY]: isDark ? 'dark' : 'light' });
    applyTheme();
  });

  // ── Markdown renderer ─────────────────────────────────────────────────────

  function renderMarkdown(src) {
    if (!src || !src.trim()) return '';
    const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // Extract fenced code blocks
    const fences = [];
    src = src.replace(/```[\w]*\n?([\s\S]*?)```/g, (_, code) => {
      fences.push(esc(code.trimEnd()));
      return `\x02F${fences.length - 1}\x03`;
    });

    function inline(raw) {
      let s = esc(raw);
      s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
      s = s.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
      s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      s = s.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
      s = s.replace(/~~(.+?)~~/g, '<del>$1</del>');
      s = s.replace(/\[([^\]]*)\]\(([^)]*)\)/g, (_, text, href) => {
        const safe = /^(https?:|mailto:|#)/.test(href) ? href : '#';
        return `<a href="${safe}" target="_blank" rel="noopener noreferrer">${text}</a>`;
      });
      return s;
    }

    const lines = src.split('\n');
    let html = '';
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];
      const trim = line.trim();

      const fenceMatch = trim.match(/^\x02F(\d+)\x03$/);
      if (fenceMatch) { html += `<pre><code>${fences[+fenceMatch[1]]}</code></pre>`; i++; continue; }

      const hm = line.match(/^(#{1,6}) +(.*)/);
      if (hm) { html += `<h${hm[1].length}>${inline(hm[2])}</h${hm[1].length}>`; i++; continue; }

      if (/^(\*{3,}|-{3,}|_{3,})$/.test(trim)) { html += '<hr>'; i++; continue; }

      if (/^> ?/.test(line)) {
        const bq = [];
        while (i < lines.length && /^> ?/.test(lines[i])) { bq.push(lines[i].replace(/^> ?/, '')); i++; }
        html += `<blockquote>${renderMarkdown(bq.join('\n'))}</blockquote>`;
        continue;
      }

      if (/^[-*+] /.test(line)) {
        html += '<ul>';
        while (i < lines.length && /^[-*+] /.test(lines[i])) { html += `<li>${inline(lines[i].replace(/^[-*+] /, ''))}</li>`; i++; }
        html += '</ul>'; continue;
      }

      if (/^\d+\. /.test(line)) {
        html += '<ol>';
        while (i < lines.length && /^\d+\. /.test(lines[i])) { html += `<li>${inline(lines[i].replace(/^\d+\. /, ''))}</li>`; i++; }
        html += '</ol>'; continue;
      }

      if (!trim) { i++; continue; }

      const para = [];
      while (i < lines.length) {
        const l = lines[i], t = l.trim();
        if (!t || /^#{1,6} /.test(l) || /^[-*+] /.test(l) || /^\d+\. /.test(l) || /^> ?/.test(l)) break;
        if (/^\x02F\d+\x03$/.test(t) || /^(\*{3,}|-{3,}|_{3,})$/.test(t)) break;
        para.push(inline(l)); i++;
      }
      if (para.length) html += `<p>${para.join('<br>')}</p>`;
    }
    return html;
  }

  // ── Render Todos ──────────────────────────────────────────────────────────

  function renderTodos() {
    const view       = $('ftd-todo-view');
    const pending    = state.items.filter(i => i.status === 'pending');
    const inProgress = state.items.filter(i => i.status === 'in-progress');
    const done       = state.items.filter(i => i.status === 'done');

    view.innerHTML = '';

    if (!state.items.length) {
      const emp = document.createElement('div');
      emp.className = 'ftd-empty';
      emp.textContent = 'All clear! Add a task ✨';
      view.appendChild(emp);
    }

    if (inProgress.length) {
      const lbl = document.createElement('div');
      lbl.className = 'ftd-section-label';
      lbl.textContent = 'In Progress';
      view.appendChild(lbl);
      inProgress.forEach(item => view.appendChild(makeTodoEl(item)));
    }

    if (pending.length) {
      const lbl = document.createElement('div');
      lbl.className = 'ftd-section-label';
      lbl.textContent = 'Pending';
      view.appendChild(lbl);
      pending.forEach(item => view.appendChild(makeTodoEl(item)));
    }

    if (done.length) {
      const lbl = document.createElement('div');
      lbl.className = 'ftd-section-label';
      lbl.textContent = 'Completed';
      view.appendChild(lbl);
      done.forEach(item => view.appendChild(makeTodoEl(item)));
    }

    updateProgress();
  }

  // ── Build a todo item ──────────────────────────────────────────────────────

  function fmtDate(isoStr) {
    const [, m, d] = isoStr.split('-').map(Number);
    return `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][m-1]} ${d}`;
  }

  function makeTodoEl(item) {
    if (!item.subtasks)  item.subtasks  = [];
    if (!item.note)      item.note      = '';
    if (!item.status)    item.status    = 'pending';
    if (!item.dueDate)   item.dueDate   = null;

    const isExpanded = expandedIds.has(item.id);
    const statusClass = item.status === 'done' ? ' ftd-done'
                      : item.status === 'in-progress' ? ' ftd-inprogress' : '';

    const div = document.createElement('div');
    div.className = 'ftd-item' + statusClass;
    div.dataset.itemId = item.id;

    // Main row
    const mainRow = document.createElement('div');
    mainRow.className = 'ftd-main-row';

    const expandBtn = document.createElement('button');
    expandBtn.className = 'ftd-expand-btn' + (isExpanded ? ' ftd-open' : '');
    expandBtn.textContent = '›';
    expandBtn.title = isExpanded ? 'Collapse' : 'Show notes & sub-tasks';

    const check = document.createElement('div');
    check.className = 'ftd-check';

    const text = document.createElement('div');
    text.className = 'ftd-text';
    text.textContent = item.text;

    mainRow.appendChild(expandBtn);
    mainRow.appendChild(check);
    mainRow.appendChild(text);

    // Collapsed sub-task count hint
    const subs = item.subtasks;
    if (subs.length && !isExpanded) {
      const hint = document.createElement('span');
      hint.className = 'ftd-sub-hint';
      hint.textContent = `${subs.filter(s => s.done).length}/${subs.length}`;
      mainRow.appendChild(hint);
    }

    if (item.tag) {
      const tag = document.createElement('span');
      tag.className = `ftd-tag ftd-tag-${item.tag}`;
      tag.textContent = item.tag;
      mainRow.appendChild(tag);
    }

    if (item.dueDate) {
      const today    = new Date().toISOString().slice(0, 10);
      const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
      const isOverdue = item.dueDate < today && item.status !== 'done';
      const due = document.createElement('span');
      due.className = 'ftd-due-badge'
        + (isOverdue            ? ' ftd-due-overdue' : '')
        + (item.dueDate === today ? ' ftd-due-today'   : '');
      due.textContent = item.dueDate === today    ? 'Today'
                      : item.dueDate === tomorrow ? 'Tomorrow'
                      : fmtDate(item.dueDate);
      mainRow.appendChild(due);
    }

    const del = document.createElement('button');
    del.className = 'ftd-del';
    del.textContent = '×';
    del.title = 'Delete';
    mainRow.appendChild(del);

    // Expanded panel
    const expandedPanel = document.createElement('div');
    expandedPanel.className = 'ftd-expanded' + (isExpanded ? ' ftd-show' : '');

    const noteWrap = document.createElement('div');
    noteWrap.className = 'ftd-note-wrap';

    const noteHeader = document.createElement('div');
    noteHeader.className = 'ftd-note-header';

    const noteToggle = document.createElement('button');
    noteToggle.className = 'ftd-note-toggle';

    const noteTA = document.createElement('textarea');
    noteTA.className = 'ftd-note-input';
    noteTA.placeholder = 'Add a note… (Markdown supported)';
    noteTA.value = item.note || '';
    noteTA.rows = Math.max(1, (item.note || '').split('\n').length);

    const notePreview = document.createElement('div');
    notePreview.className = 'ftd-note-preview';

    const inPreview = previewIds.has(item.id);
    if (inPreview) {
      noteTA.style.display = 'none';
      notePreview.innerHTML = renderMarkdown(item.note || '');
      noteToggle.textContent = 'Edit';
    } else {
      notePreview.style.display = 'none';
      noteToggle.textContent = 'Preview';
    }

    noteToggle.addEventListener('click', e => {
      e.stopPropagation();
      if (previewIds.has(item.id)) {
        previewIds.delete(item.id);
        notePreview.style.display = 'none';
        noteTA.style.display = '';
        noteToggle.textContent = 'Preview';
        noteTA.focus();
      } else {
        previewIds.add(item.id);
        notePreview.innerHTML = renderMarkdown(noteTA.value);
        noteTA.style.display = 'none';
        notePreview.style.display = '';
        noteToggle.textContent = 'Edit';
      }
    });

    noteHeader.appendChild(noteToggle);
    noteWrap.appendChild(noteHeader);
    noteWrap.appendChild(noteTA);
    noteWrap.appendChild(notePreview);

    const subtasksList = document.createElement('div');
    subtasksList.className = 'ftd-subtasks';
    subs.forEach(sub => subtasksList.appendChild(makeSubtaskEl(item, sub)));

    const subAddRow = document.createElement('div');
    subAddRow.className = 'ftd-subtask-add-row';
    const subInput = document.createElement('input');
    subInput.type = 'text';
    subInput.className = 'ftd-subtask-input';
    subInput.placeholder = '+ Add sub-task…';
    subAddRow.appendChild(subInput);

    const tagRow = document.createElement('div');
    tagRow.className = 'ftd-due-row';
    const tagLabel = document.createElement('span');
    tagLabel.className = 'ftd-due-label';
    tagLabel.textContent = 'Tag';
    const tagSel = document.createElement('select');
    tagSel.className = 'ftd-due-input';
    [['', 'none'], ['work', 'work'], ['life', 'life'], ['learn', 'learn']].forEach(([val, txt]) => {
      const opt = document.createElement('option');
      opt.value = val;
      opt.textContent = txt;
      if (val === (item.tag || '')) opt.selected = true;
      tagSel.appendChild(opt);
    });
    tagSel.addEventListener('change', e => {
      e.stopPropagation();
      const idx = state.items.findIndex(i => i.id === item.id);
      if (idx !== -1) { state.items[idx].tag = tagSel.value || ''; saveState(); renderTodos(); }
    });
    tagSel.addEventListener('keydown', e => e.stopPropagation());
    tagRow.appendChild(tagLabel);
    tagRow.appendChild(tagSel);

    const dueDateRow = document.createElement('div');
    dueDateRow.className = 'ftd-due-row';
    const dueDateLabel = document.createElement('span');
    dueDateLabel.className = 'ftd-due-label';
    dueDateLabel.textContent = 'Due';
    const dueDateInput = document.createElement('input');
    dueDateInput.type = 'date';
    dueDateInput.className = 'ftd-due-input';
    dueDateInput.value = item.dueDate || '';
    dueDateInput.addEventListener('change', e => {
      e.stopPropagation();
      const idx = state.items.findIndex(i => i.id === item.id);
      if (idx !== -1) {
        state.items[idx].dueDate = dueDateInput.value || null;
        saveState();
        renderTodos();
      }
    });
    dueDateInput.addEventListener('keydown', e => e.stopPropagation());
    dueDateRow.appendChild(dueDateLabel);
    dueDateRow.appendChild(dueDateInput);

    expandedPanel.appendChild(tagRow);
    expandedPanel.appendChild(dueDateRow);
    expandedPanel.appendChild(noteWrap);
    expandedPanel.appendChild(subtasksList);
    expandedPanel.appendChild(subAddRow);

    div.appendChild(mainRow);
    div.appendChild(expandedPanel);

    // Events
    expandBtn.addEventListener('click', e => {
      e.stopPropagation();
      if (expandedIds.has(item.id)) expandedIds.delete(item.id);
      else expandedIds.add(item.id);
      renderTodos();
    });

    function cycleStatus() {
      if (isEditing) return;
      const idx = state.items.findIndex(i => i.id === item.id);
      if (idx === -1) return;
      const cur = state.items[idx].status;
      if (cur === 'pending') {
        state.items[idx].status = 'in-progress';
        state.items[idx].completedAt = null;
      } else if (cur === 'in-progress') {
        state.items[idx].status = 'done';
        state.items[idx].completedAt = Date.now();
      } else {
        state.items[idx].status = 'pending';
        state.items[idx].completedAt = null;
      }
      saveState();
      renderTodos();
    }

    mainRow.addEventListener('click', e => {
      if (e.target === expandBtn || e.target === del) return;
      if (e.target === text || text.contains(e.target)) return;
      cycleStatus();
    });

    del.addEventListener('click', e => {
      e.stopPropagation();
      state.items = state.items.filter(i => i.id !== item.id);
      expandedIds.delete(item.id);
      saveState();
      renderTodos();
    });

    let isEditing = false;

    text.addEventListener('dblclick', e => {
      e.stopPropagation();
      isEditing = true;
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'ftd-text-edit';
      input.value = item.text;
      text.replaceWith(input);
      input.focus();
      input.select();

      function commit() {
        isEditing = false;
        const val = input.value.trim();
        const idx = state.items.findIndex(i => i.id === item.id);
        if (idx !== -1 && val) state.items[idx].text = val;
        saveState();
        renderTodos();
      }
      input.addEventListener('keydown', e => {
        e.stopPropagation();
        if (e.key === 'Enter')  commit();
        if (e.key === 'Escape') { isEditing = false; renderTodos(); }
      });
      input.addEventListener('blur', commit);
    });

    noteTA.addEventListener('input', () => {
      item.note = noteTA.value;
      noteTA.style.height = 'auto';
      noteTA.style.height = noteTA.scrollHeight + 'px';
      clearTimeout(noteTimers[item.id]);
      noteTimers[item.id] = setTimeout(saveState, 600);
    });
    noteTA.addEventListener('keydown', e => e.stopPropagation());

    subInput.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key !== 'Enter') return;
      const val = subInput.value.trim();
      if (!val) return;
      item.subtasks.push({ id: uid(), text: val, done: false });
      saveState();
      renderTodos();
      requestAnimationFrame(() => {
        const el = $('ftd-todo-view').querySelector(
          `[data-item-id="${item.id}"] .ftd-subtask-input`
        );
        if (el) el.focus();
      });
    });

    return div;
  }

  // ── Build a sub-task element ───────────────────────────────────────────────

  function makeSubtaskEl(parentItem, sub) {
    const div = document.createElement('div');
    div.className = 'ftd-subtask' + (sub.done ? ' ftd-done' : '');

    const check = document.createElement('div');
    check.className = 'ftd-subtask-check';

    const text = document.createElement('div');
    text.className = 'ftd-subtask-text';
    text.textContent = sub.text;

    const del = document.createElement('button');
    del.className = 'ftd-subtask-del';
    del.textContent = '×';

    div.appendChild(check);
    div.appendChild(text);
    div.appendChild(del);

    div.addEventListener('click', e => {
      if (e.target === del) return;
      const pidx = state.items.findIndex(i => i.id === parentItem.id);
      if (pidx === -1) return;
      const sidx = state.items[pidx].subtasks.findIndex(s => s.id === sub.id);
      if (sidx === -1) return;
      state.items[pidx].subtasks[sidx].done = !state.items[pidx].subtasks[sidx].done;
      saveState();
      renderTodos();
    });

    del.addEventListener('click', e => {
      e.stopPropagation();
      const pidx = state.items.findIndex(i => i.id === parentItem.id);
      if (pidx === -1) return;
      state.items[pidx].subtasks =
        state.items[pidx].subtasks.filter(s => s.id !== sub.id);
      saveState();
      renderTodos();
    });

    return div;
  }

  // ── Progress ──────────────────────────────────────────────────────────────

  function updateProgress() {
    const total = state.items.length;
    const done  = state.items.filter(i => i.status === 'done').length;
    const pct   = total === 0 ? 0 : Math.round(done / total * 100);
    $('ftd-prog-text').textContent = `${done} / ${total} done`;
    $('ftd-prog-pct').textContent  = `${pct}%`;
    $('ftd-prog-fill').style.width = `${pct}%`;
  }

  // ── Add Todo ──────────────────────────────────────────────────────────────

  function addTodo() {
    const input  = $('ftd-input');
    const tagSel = $('ftd-tag-sel');
    const text   = input.value.trim();
    if (!text) return;
    state.items.push({ id: uid(), text, tag: tagSel.value, status: 'pending', note: '', subtasks: [], createdAt: Date.now(), completedAt: null, dueDate: null });
    saveState();
    renderTodos();
    input.value  = '';
    tagSel.value = '';
    input.focus();
  }

  $('ftd-add-btn').addEventListener('click', addTodo);
  $('ftd-input').addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Enter') addTodo();
  });

  // ── Weekly export ─────────────────────────────────────────────────────────

  function generateWeeklyMarkdown() {
    const now = new Date();
    const DAYS  = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

    // Current Mon–Sun week bounds
    const dow = now.getDay();
    const mon = new Date(now); mon.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1)); mon.setHours(0,0,0,0);
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6); sun.setHours(23,59,59,999);

    const fmt   = d => `${MONTHS[d.getMonth()]} ${d.getDate()}`;
    const fmtTs = ts => { const d = new Date(ts); return `${MONTHS[d.getMonth()]} ${d.getDate()}`; };

    // Split items: this week vs older (items without createdAt count as this week)
    const thisWeek = state.items.filter(i => !i.createdAt || i.createdAt >= mon.getTime());
    const older    = state.items.filter(i =>  i.createdAt && i.createdAt <  mon.getTime());

    function itemBlock(item) {
      const tag     = item.tag ? ` \`${item.tag}\`` : '';
      const dueStr  = item.dueDate ? ` · due ${item.dueDate}` : '';
      const doneStr = item.completedAt ? ` · completed ${fmtTs(item.completedAt)}` : '';
      const checkMap = { done: '[x]', 'in-progress': '[-]', pending: '[ ]' };
      const check   = checkMap[item.status] || '[ ]';
      let md = `- ${check} **${item.text}**${tag}${dueStr}${doneStr}\n`;
      if (item.note && item.note.trim()) {
        item.note.trim().split('\n').forEach(line => { md += `  > ${line}\n`; });
      }
      (item.subtasks || []).forEach(sub => {
        md += `  - ${sub.done ? '[x]' : '[ ]'} ${sub.text}\n`;
      });
      return md;
    }

    const done       = thisWeek.filter(i => i.status === 'done');
    const inProgress = thisWeek.filter(i => i.status === 'in-progress');
    const pending    = thisWeek.filter(i => i.status === 'pending');

    let md = `# Weekly Wrap-up: ${fmt(mon)} – ${fmt(sun)}, ${now.getFullYear()}\n\n`;
    md += `> Exported on ${DAYS[now.getDay()]}, ${fmt(now)} ${now.getFullYear()}\n\n`;

    const total = thisWeek.length;
    md += `**Progress:** ${done.length}/${total} tasks completed`;
    md += total > 0 ? ` (${Math.round(done.length / total * 100)}%)\n\n` : '\n\n';

    if (done.length) {
      md += `## ✅ Completed (${done.length})\n\n`;
      done.forEach(i => { md += itemBlock(i); });
      md += '\n';
    }
    if (inProgress.length) {
      md += `## 🔄 In Progress (${inProgress.length})\n\n`;
      inProgress.forEach(i => { md += itemBlock(i); });
      md += '\n';
    }
    if (pending.length) {
      md += `## ⏳ Pending (${pending.length})\n\n`;
      pending.forEach(i => { md += itemBlock(i); });
      md += '\n';
    }
    if (!thisWeek.length) {
      md += '_No tasks recorded this week._\n\n';
    }
    if (older.length) {
      md += `## 🗂 Carried over from previous weeks (${older.length})\n\n`;
      older.forEach(i => { md += itemBlock(i); });
      md += '\n';
    }

    md += '---\n*Generated by Floating Daily To-Do*\n';
    return md;
  }

  function exportWeekly() {
    const md = generateWeeklyMarkdown();

    const overlay = document.createElement('div');
    overlay.className = 'ftd-modal-overlay';

    const modal = document.createElement('div');
    modal.className = 'ftd-modal';

    const header = document.createElement('div');
    header.className = 'ftd-modal-header';
    const title = document.createElement('span');
    title.textContent = 'Weekly Wrap-up';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'ftd-modal-close';
    closeBtn.textContent = '×';
    header.appendChild(title);
    header.appendChild(closeBtn);

    const pre = document.createElement('pre');
    pre.className = 'ftd-modal-body';
    pre.textContent = md;

    const footer = document.createElement('div');
    footer.className = 'ftd-modal-footer';
    const copyBtn = document.createElement('button');
    copyBtn.className = 'ftd-modal-copy';
    copyBtn.textContent = 'Copy';
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(md).then(() => {
        copyBtn.textContent = 'Copied!';
        setTimeout(() => { copyBtn.textContent = 'Copy'; }, 2000);
      });
    });
    footer.appendChild(copyBtn);

    modal.appendChild(header);
    modal.appendChild(pre);
    modal.appendChild(footer);
    overlay.appendChild(modal);
    shadow.appendChild(overlay);

    const close = () => shadow.removeChild(overlay);
    closeBtn.addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', function onKey(e) {
      if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); }
    });
  }

  $('ftd-export').addEventListener('click', exportWeekly);

  $('ftd-clear').addEventListener('click', () => {
    state.items = state.items.filter(i => i.status !== 'done');
    saveState();
    renderTodos();
  });

  // ── Init ──────────────────────────────────────────────────────────────────
  loadState();
})();
