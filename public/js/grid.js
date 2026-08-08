/**
 * DataGrid - 재사용 가능한 데이터 그리드 컴포넌트
 * 기능: 정렬, 필터, 페이지네이션, 더블클릭, 엑셀 다운로드
 */
class DataGrid {
  constructor(options) {
    this.container   = typeof options.container === 'string'
      ? document.querySelector(options.container)
      : options.container;
    this.defaultColumns = (options.columns || []).map(col => ({ ...col }));
    this.columnAdjustable = options.columnAdjustable === true;
    this.columnStorageKey = options.columnStorageKey || '';
    this.columnAdjustContainer = options.columnAdjustContainer || '';
    this.columns     = this._loadColumnSettings();
    this.fetchUrl    = options.fetchUrl    || '';
    this.excelUrl    = options.excelUrl    || '';
    this.onRowDblClick = options.onRowDblClick || null;
    this.pageSize    = options.pageSize    || 10;
    this.currentPage = 1;
    this.totalCount  = 0;
    this.data        = [];
    this.sortCol     = null;
    this.sortDir     = 'asc';
    this.filters     = {};
    this.searchParams = {};
    this._render();
  }

  // ── 렌더링 ──────────────────────────────────────────────────
  _render() {
    this.container.innerHTML = '';

    if (this.columnAdjustable) {
      const externalTools = this.columnAdjustContainer
        ? document.querySelector(this.columnAdjustContainer)
        : null;
      const tools = externalTools || document.createElement('div');
      if (!externalTools) tools.className = 'grid-tools';
      tools.innerHTML = '';
      const adjustBtn = document.createElement('button');
      adjustBtn.type = 'button';
      adjustBtn.className = 'btn btn-ghost btn-sm grid-column-adjust-btn';
      adjustBtn.textContent = '⚙ 컬럼조정';
      adjustBtn.addEventListener('click', () => this._openColumnAdjuster());
      tools.appendChild(adjustBtn);
      if (!externalTools) this.container.appendChild(tools);
    }

    // Table wrapper
    const wrap = document.createElement('div');
    wrap.className = 'table-wrap';

    const table = document.createElement('table');
    table.className = 'data-table';
    this.table = table;

    const colgroup = document.createElement('colgroup');
    this.colElements = [];
    for (const col of this.columns) {
      const colEl = document.createElement('col');
      if (col.width) colEl.style.width = col.width;
      colgroup.appendChild(colEl);
      this.colElements.push(colEl);
    }
    table.appendChild(colgroup);

    // Header
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    for (const col of this.columns) {
      const th = document.createElement('th');
      th.innerHTML = `${col.label}<span class="sort-icon"><span class="sort-icon-asc">▲</span><span class="sort-icon-desc">▼</span></span>`;
      if (col.width) th.style.width = col.width;
      if (col.align) th.style.textAlign = col.align;
      th.dataset.key = col.key;
      th.addEventListener('click', () => this._onSort(col.key, th));
      const resizer = document.createElement('span');
      resizer.className = 'grid-column-resizer';
      resizer.title = '드래그하여 컬럼 너비 조정';
      resizer.addEventListener('click', e => e.stopPropagation());
      resizer.addEventListener('mousedown', e => this._startColumnResize(e, col, th));
      th.appendChild(resizer);
      headerRow.appendChild(th);
    }
    thead.appendChild(headerRow);

    // Filter row
    const filterRow = document.createElement('tr');
    filterRow.className = 'filter-row';
    for (const col of this.columns) {
      const td = document.createElement('td');
      if (col.filterable !== false) {
        if (col.filterType === 'select' && col.filterOptions) {
          const sel = document.createElement('select');
          sel.innerHTML = `<option value="">전체</option>` +
            col.filterOptions.map(o => `<option value="${o.value}">${o.label}</option>`).join('');
          sel.addEventListener('change', () => {
            this.filters[col.key] = sel.value;
            this.currentPage = 1;
            this.load();
          });
          td.appendChild(sel);
        } else if (col.filterable !== false) {
          const inp = document.createElement('input');
          inp.placeholder = col.filterPlaceholder || '';
          inp.addEventListener('input', () => {
            this.filters[col.key] = inp.value;
            this.currentPage = 1;
            this.load();
          });
          td.appendChild(inp);
        }
      }
      filterRow.appendChild(td);
    }
    thead.appendChild(filterRow);
    table.appendChild(thead);

    // Body
    const tbody = document.createElement('tbody');
    this.tbody = tbody;
    table.appendChild(tbody);
    wrap.appendChild(table);
    this.container.appendChild(wrap);
    this._applyFrozenColumns();

    // Footer
    const footer = document.createElement('div');
    footer.className = 'grid-footer';

    const leftFoot = document.createElement('div');
    leftFoot.className = 'page-size-select';
    leftFoot.innerHTML = `
      <span>페이지당</span>
      <select id="gPageSize">
        <option value="10" ${this.pageSize===10?'selected':''}>10</option>
        <option value="25" ${this.pageSize===25?'selected':''}>25</option>
        <option value="50" ${this.pageSize===50?'selected':''}>50</option>
        <option value="100" ${this.pageSize===100?'selected':''}>100</option>
      </select>
      <span>건</span>
    `;
    leftFoot.querySelector('#gPageSize').addEventListener('change', e => {
      this.pageSize    = parseInt(e.target.value);
      this.currentPage = 1;
      this.load();
    });

    const rightFoot = document.createElement('div');
    rightFoot.className = 'pagination';
    this.paginationEl = rightFoot;

    const totalEl = document.createElement('div');
    totalEl.className = 'total-info';
    this.totalEl = totalEl;

    footer.appendChild(leftFoot);
    footer.appendChild(totalEl);
    footer.appendChild(rightFoot);
    this.container.appendChild(footer);
  }

  // ── 정렬 ────────────────────────────────────────────────────
  _onSort(key, th) {
    if (this.sortCol === key) {
      this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortCol = key;
      this.sortDir = 'asc';
    }
    // Update header classes
    this.table.querySelectorAll('th').forEach(t => {
      t.classList.remove('sorted-asc', 'sorted-desc');
    });
    th.classList.add(this.sortDir === 'asc' ? 'sorted-asc' : 'sorted-desc');
    this._sortData();
    this._renderBody();
  }

  _sortData() {
    if (!this.sortCol) return;
    const col = this.columns.find(c => c.key === this.sortCol);
    this.data.sort((a, b) => {
      let va = a[this.sortCol], vb = b[this.sortCol];
      if (col && col.sortType === 'number') { va = parseFloat(va)||0; vb = parseFloat(vb)||0; }
      else { va = String(va||''); vb = String(vb||''); }
      if (va < vb) return this.sortDir === 'asc' ? -1 : 1;
      if (va > vb) return this.sortDir === 'asc' ? 1  : -1;
      return 0;
    });
  }

  // ── 데이터 로드 ─────────────────────────────────────────────
  async load(extraParams) {
    if (extraParams) this.searchParams = extraParams;
    const params = new URLSearchParams({
      ...this.searchParams,
      page: this.currentPage,
      size: this.pageSize,
    });
    // column filters → 별도로 추가 (서버가 지원하면)
    // (column filter는 client-side만 적용할 수도 있음)

    this.tbody.innerHTML = `<tr><td colspan="${this.columns.length}" style="text-align:center;padding:32px"><div class="spinner"></div></td></tr>`;

    try {
      const res  = await fetch(`${this.fetchUrl}?${params}`);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || '오류');
      this.data       = json.data || [];
      this.totalCount = json.total || 0;
      if (this.sortCol) this._sortData();
      this._renderBody();
      this._renderPagination();
      this.totalEl.textContent = `총 ${this.totalCount.toLocaleString()}건`;
      if (this.excelBtn) {
        this.excelBtn.disabled = this.totalCount === 0;
      }
    } catch(e) {
      this.tbody.innerHTML = `<tr><td colspan="${this.columns.length}" class="no-data"><span class="icon">📭</span>데이터를 불러올 수 없습니다.</td></tr>`;
    }
  }

  // ── 바디 렌더링 ─────────────────────────────────────────────
  _renderBody() {
    this.tbody.innerHTML = '';
    if (!this.data.length) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = this.columns.length;
      td.className = 'no-data';
      td.innerHTML = '<span class="icon">📭</span>조회된 데이터가 없습니다.';
      tr.appendChild(td);
      this.tbody.appendChild(tr);
      return;
    }

    for (const row of this.data) {
      const tr = document.createElement('tr');
      tr.dataset.id = row.id || '';
      for (const col of this.columns) {
        const td = document.createElement('td');
        td.style.textAlign = col.align || 'left';
        const raw = row[col.key];
        if (col.render) {
          const result = col.render(raw, row);
          if (typeof result === 'string') {
            td.innerHTML = result;
          } else {
            td.appendChild(result);
          }
        } else {
          td.textContent = raw !== null && raw !== undefined ? raw : '';
        }
        tr.appendChild(td);
      }
      tr.addEventListener('click', () => {
        this.tbody.querySelectorAll('tr').forEach(r => r.classList.remove('selected'));
        tr.classList.add('selected');
      });
      if (this.onRowDblClick) {
        tr.addEventListener('dblclick', () => this.onRowDblClick(row, tr));
      }
      this.tbody.appendChild(tr);
    }
    this._applyFrozenColumns();
  }

  // ── 페이지네이션 ────────────────────────────────────────────
  _renderPagination() {
    const pages = Math.ceil(this.totalCount / this.pageSize) || 1;
    this.paginationEl.innerHTML = '';

    const mkBtn = (label, page, disabled, active) => {
      const btn = document.createElement('button');
      btn.className = 'page-btn' + (active ? ' active' : '');
      btn.textContent = label;
      btn.disabled    = disabled;
      btn.addEventListener('click', () => {
        this.currentPage = page;
        this.load();
      });
      return btn;
    };

    this.paginationEl.appendChild(mkBtn('◀◀', 1, this.currentPage === 1, false));
    this.paginationEl.appendChild(mkBtn('◀', this.currentPage - 1, this.currentPage === 1, false));

    const start = Math.max(1, this.currentPage - 2);
    const end   = Math.min(pages, start + 4);
    for (let p = start; p <= end; p++) {
      this.paginationEl.appendChild(mkBtn(p, p, false, p === this.currentPage));
    }

    this.paginationEl.appendChild(mkBtn('▶', this.currentPage + 1, this.currentPage >= pages, false));
    this.paginationEl.appendChild(mkBtn('▶▶', pages, this.currentPage >= pages, false));
  }

  // ── 엑셀 버튼 연결 ──────────────────────────────────────────
  _applyFrozenColumns() {
    if (!this.table) return;
    this.table.querySelectorAll('.grid-frozen-cell').forEach(cell => {
      cell.classList.remove('grid-frozen-cell', 'grid-frozen-last');
      cell.style.left = '';
    });
    let left = 0;
    const firstFrozenIndex = this.columns.findIndex(col => col._frozen);
    const frozenIndexes = firstFrozenIndex >= 0 ? [firstFrozenIndex] : [];
    frozenIndexes.forEach((columnIndex, frozenPosition) => {
      this.table.querySelectorAll('tr').forEach(row => {
        const cell = row.children[columnIndex];
        if (!cell || cell.colSpan > 1) return;
        cell.classList.add('grid-frozen-cell');
        if (frozenPosition === frozenIndexes.length - 1) cell.classList.add('grid-frozen-last');
        cell.style.left = `${left}px`;
      });
      const headerCell = this.table.querySelector('thead tr:first-child')?.children[columnIndex];
      left += Math.round(headerCell?.getBoundingClientRect().width || parseInt(this.columns[columnIndex].width, 10) || 100);
    });
  }

  _startColumnResize(event, column, th) {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = th.getBoundingClientRect().width;
    const columnIndex = this.columns.findIndex(col => col.key === column.key);
    document.body.classList.add('grid-column-resizing');
    const onMove = moveEvent => {
      const width = Math.max(50, Math.round(startWidth + moveEvent.clientX - startX));
      column.width = `${width}px`;
      th.style.width = column.width;
      if (this.colElements?.[columnIndex]) this.colElements[columnIndex].style.width = column.width;
      this._applyFrozenColumns();
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.classList.remove('grid-column-resizing');
      this._saveColumnWidth(column.key, column.width);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  _saveColumnWidth(key, width) {
    if (!this.columnStorageKey) return;
    let settings;
    try { settings = JSON.parse(localStorage.getItem(this.columnStorageKey) || '[]'); } catch (_) { settings = []; }
    if (!Array.isArray(settings) || !settings.length) settings = this._currentColumnSettings();
    const target = settings.find(setting => setting.key === key);
    if (target) target.width = width;
    localStorage.setItem(this.columnStorageKey, JSON.stringify(settings));
  }

  _loadColumnSettings() {
    if (!this.columnAdjustable || !this.columnStorageKey) return this.defaultColumns.map(col => ({ ...col }));
    try {
      const saved = JSON.parse(localStorage.getItem(this.columnStorageKey) || '[]');
      const savedMap = new Map(saved.map(item => [item.key, item]));
      const order = new Map(saved.map((item, index) => [item.key, index]));
      return this.defaultColumns
        .map((col, index) => {
          const setting = savedMap.get(col.key) || {};
          return { ...col,
            width: Object.prototype.hasOwnProperty.call(setting, 'width') ? setting.width : col.width,
            align: setting.align || col.align,
            _frozen: setting.frozen === true,
            _visible: setting.visible !== false, _defaultOrder: index };
        })
        .sort((a, b) => (order.get(a.key) ?? 9999 + a._defaultOrder) - (order.get(b.key) ?? 9999 + b._defaultOrder))
        .filter(col => col._visible !== false);
    } catch (_) {
      return this.defaultColumns.map(col => ({ ...col }));
    }
  }

  _currentColumnSettings() {
    const activeMap = new Map(this.columns.map((col, index) => [col.key, { col, index }]));
    return this.defaultColumns.map((base, defaultIndex) => {
      const active = activeMap.get(base.key);
      return { key: base.key, label: base.label, visible: Boolean(active), frozen: active?.col._frozen === true,
        width: active?.col.width || base.width || '', align: active?.col.align || base.align || 'left',
        order: active ? active.index : this.columns.length + defaultIndex };
    }).sort((a, b) => a.order - b.order);
  }

  _openColumnAdjuster() {
    document.querySelector('.grid-column-overlay')?.remove();
    let settings = this._currentColumnSettings();
    let frozenSeen = false;
    settings.forEach(setting => {
      if (!setting.frozen) return;
      if (frozenSeen) setting.frozen = false;
      frozenSeen = true;
    });
    const overlay = document.createElement('div');
    overlay.className = 'grid-column-overlay';
    overlay.innerHTML = `
      <div class="grid-column-dialog" role="dialog" aria-modal="true" aria-label="컬럼조정">
        <div class="grid-column-header"><strong>컬럼조정</strong><button type="button" class="grid-column-close" aria-label="닫기">×</button></div>
        <div class="grid-column-headings"><span>표시 / 컬럼</span><span>정렬</span><span>틀 고정</span><span class="grid-drag-guide">☰ 드래그 순서 변경</span></div>
        <div class="grid-column-list"></div>
        <div class="grid-column-actions"><button type="button" class="btn btn-ghost btn-sm" data-action="reset">기본값</button><div><button type="button" class="btn btn-ghost btn-sm" data-action="cancel">취소</button><button type="button" class="btn btn-primary btn-sm" data-action="apply">적용</button></div></div>
      </div>`;
    document.body.appendChild(overlay);
    const list = overlay.querySelector('.grid-column-list');
    const renderList = () => {
      list.innerHTML = '';
      settings.forEach((setting, index) => {
        const row = document.createElement('div');
        row.className = 'grid-column-row';
        row.draggable = true;
        row.dataset.index = index;
        row.innerHTML = `<label><span class="grid-drag-handle" title="드래그하여 순서 변경">☰</span><input type="checkbox" ${setting.visible ? 'checked' : ''}> <span class="grid-column-label"></span></label>
          <div class="grid-column-align-boxes" role="group" aria-label="정렬">
            <button type="button" data-align="left" title="왼쪽 정렬" aria-label="왼쪽 정렬"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 4h14M3 8h10M3 12h14M3 16h8"/></svg></button>
            <button type="button" data-align="center" title="가운데 정렬" aria-label="가운데 정렬"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 4h14M5 8h10M3 12h14M6 16h8"/></svg></button>
            <button type="button" data-align="right" title="오른쪽 정렬" aria-label="오른쪽 정렬"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 4h14M7 8h10M3 12h14M9 16h8"/></svg></button>
          </div>
          <label class="grid-column-freeze"><input type="checkbox" ${setting.frozen ? 'checked' : ''}><span>고정</span></label>`;
        row.querySelector('.grid-column-label').textContent = setting.label;
        row.querySelector('input[type=checkbox]').addEventListener('change', e => { setting.visible = e.target.checked; });
        row.querySelector('.grid-column-freeze input').addEventListener('change', e => {
          settings.forEach(item => { item.frozen = item === setting ? e.target.checked : false; });
          renderList();
        });
        row.querySelectorAll('.grid-column-align-boxes button').forEach(button => {
          button.classList.toggle('active', button.dataset.align === (setting.align || 'left'));
          button.addEventListener('click', () => { setting.align = button.dataset.align; renderList(); });
        });
        row.addEventListener('dragstart', e => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(index)); row.classList.add('dragging'); });
        row.addEventListener('dragend', () => row.classList.remove('dragging'));
        row.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; row.classList.add('drag-over'); });
        row.addEventListener('dragleave', () => row.classList.remove('drag-over'));
        row.addEventListener('drop', e => {
          e.preventDefault(); row.classList.remove('drag-over');
          const from = Number(e.dataTransfer.getData('text/plain'));
          if (Number.isInteger(from) && from !== index) { const [moved] = settings.splice(from, 1); settings.splice(index, 0, moved); renderList(); }
        });
        list.appendChild(row);
      });
    };
    renderList();
    const close = () => overlay.remove();
    overlay.querySelector('.grid-column-close').addEventListener('click', close);
    overlay.querySelector('[data-action=cancel]').addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    overlay.querySelector('[data-action=reset]').addEventListener('click', () => {
      settings = this.defaultColumns.map((col, order) => ({ key: col.key, label: col.label, visible: true, frozen: false,
        width: col.width || '', align: col.align || 'left', order })); renderList();
    });
    overlay.querySelector('[data-action=apply]').addEventListener('click', () => {
      if (!settings.some(setting => setting.visible)) { alert('하나 이상의 컬럼을 표시해야 합니다.'); return; }
      if (this.columnStorageKey) localStorage.setItem(this.columnStorageKey, JSON.stringify(settings));
      this.columns = this._loadColumnSettings(); close(); this._render();
      if (this.sortCol && !this.columns.some(col => col.key === this.sortCol)) this.sortCol = null;
      if (this.sortCol) this._sortData();
      this._renderBody(); this._renderPagination();
      this.totalEl.textContent = `총 ${this.totalCount.toLocaleString()}건`;
    });
  }

  bindExcelButton(btnEl) {
    this.excelBtn = typeof btnEl === 'string' ? document.querySelector(btnEl) : btnEl;
    if (!this.excelBtn) return;
    this.excelBtn.disabled = true;
    this.excelBtn.addEventListener('click', () => {
      const params = new URLSearchParams(this.searchParams);
      window.location.href = `${this.excelUrl}?${params}`;
    });
  }

  // ── 검색 ───────────────────────────────────────────────────
  search(params) {
    this.searchParams = params;
    this.currentPage  = 1;
    this.load();
  }
}

window.DataGrid = DataGrid;
