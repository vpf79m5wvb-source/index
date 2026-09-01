const API = 'https://api.scryfall.com/cards/search';
const STORAGE_KEY = 'cardswipe-mtg-v1';

const state = {
  queue: [],
  saved: [],
  seenIds: new Set(),
  history: [],
  filters: defaultFilters(),
  loading: false,
  fetchToken: 0,
};

const $ = (id) => document.getElementById(id);
const els = {
  cardStage: $('cardStage'), loadingState: $('loadingState'), savedCount: $('savedCount'), seenCount: $('seenCount'),
  undoBtn: $('undoBtn'), skipBtn: $('skipBtn'), saveBtn: $('saveBtn'), detailsBtn: $('detailsBtn'),
  filtersBtn: $('filtersBtn'), filterSheet: $('filterSheet'), closeFiltersBtn: $('closeFiltersBtn'),
  resetFiltersBtn: $('resetFiltersBtn'), applyFiltersBtn: $('applyFiltersBtn'),
  formatFilter: $('formatFilter'), typeFilter: $('typeFilter'), rarityFilter: $('rarityFilter'),
  manaMax: $('manaMax'), priceMax: $('priceMax'), colorMode: $('colorMode'), colorFilterStatus: $('colorFilterStatus'), excludeDigital: $('excludeDigital'),
  savedGrid: $('savedGrid'), savedEmpty: $('savedEmpty'), exportBtn: $('exportBtn'),
  detailsModal: $('detailsModal'), closeDetailsBtn: $('closeDetailsBtn'), detailsImage: $('detailsImage'),
  detailsName: $('detailsName'), detailsMeta: $('detailsMeta'), detailsText: $('detailsText'), detailsPrice: $('detailsPrice'),
  toast: $('toast'),
};

function defaultFilters() {
  return { format: 'commander', colors: [], colorMode: 'contains', type: '', rarity: '', manaMax: '', priceMax: '', paperOnly: true };
}

function loadState() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    state.saved = Array.isArray(raw.saved) ? raw.saved : [];
    state.seenIds = new Set(Array.isArray(raw.seenIds) ? raw.seenIds : []);
    state.filters = { ...defaultFilters(), ...(raw.filters || {}) };
    if (raw.filters && typeof raw.filters.exactColors === 'boolean' && !raw.filters.colorMode) {
      state.filters.colorMode = raw.filters.exactColors ? 'exact' : 'all';
    }
  } catch (e) {
    console.warn('Could not read saved state', e);
  }
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    saved: state.saved,
    seenIds: [...state.seenIds].slice(-5000),
    filters: state.filters,
  }));
}

function imageFor(card) {
  return card.image_uris?.normal || card.card_faces?.find(f => f.image_uris)?.image_uris?.normal || '';
}

function oracleFor(card) {
  if (card.oracle_text) return card.oracle_text;
  return (card.card_faces || []).map(f => `${f.name}\n${f.oracle_text || ''}`).join('\n\n');
}

function priceFor(card) {
  const raw = card.prices?.usd || card.prices?.usd_foil || null;
  return raw ? `$${Number(raw).toFixed(2)}` : 'No price';
}

function buildQuery() {
  const f = state.filters;
  const terms = ['-is:token'];
  if (f.paperOnly) terms.push('game:paper');
  if (f.format) terms.push(`legal:${f.format}`);
  if (f.type) terms.push(`t:${f.type}`);
  if (f.rarity) terms.push(`r:${f.rarity}`);
  if (f.manaMax !== '') terms.push(`mv<=${Number(f.manaMax)}`);
  if (f.priceMax !== '') terms.push(`usd<=${Number(f.priceMax)}`);
  if (f.colors.length) {
    const selected = f.colors;
    const nonC = selected.filter(c => c !== 'C').join('');
    const hasC = selected.includes('C');

    if (f.colorMode === 'exact') {
      if (hasC && !nonC) terms.push('c=c');
      else if (nonC && !hasC) terms.push(`c=${nonC}`);
      else if (hasC && nonC) terms.push(`(c=c OR c=${nonC})`);
    } else if (f.colorMode === 'all') {
      if (hasC && !nonC) terms.push('c=c');
      else if (nonC && !hasC) terms.push(`c>=${nonC}`);
      else if (hasC && nonC) terms.push(`(c=c OR c>=${nonC})`);
    } else {
      const parts = [];
      for (const color of selected) {
        parts.push(color === 'C' ? 'c=c' : `c>=${color}`);
      }
      if (parts.length === 1) terms.push(parts[0]);
      else terms.push(`(${parts.join(' OR ')})`);
    }
  }
  return terms.join(' ');
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
  if (!res.ok) {
    let message = `Card service error (${res.status})`;
    try { const body = await res.json(); if (body.details) message = body.details; } catch (_) {}
    throw new Error(message);
  }
  return res.json();
}

function shuffle(items) {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

async function loadBatch(force = false) {
  if (state.loading || (!force && state.queue.length >= 8)) return;
  state.loading = true;
  const token = ++state.fetchToken;
  if (!state.queue.length) renderLoading();

  try {
    const q = encodeURIComponent(buildQuery());
    const first = await fetchJson(`${API}?q=${q}&unique=cards&order=edhrec&page=1`);
    if (token !== state.fetchToken) return;
    const maxPage = Math.max(1, Math.ceil(first.total_cards / 175));
    const page = Math.floor(Math.random() * maxPage) + 1;
    const data = page === 1 ? first : await fetchJson(`${API}?q=${q}&unique=cards&order=edhrec&page=${page}`);
    if (token !== state.fetchToken) return;
    const fresh = shuffle(data.data)
      .filter(c => imageFor(c))
      .filter(c => !state.seenIds.has(c.id) && !state.saved.some(s => s.id === c.id));
    state.queue.push(...fresh.slice(0, 30));

    if (!state.queue.length) {
      showState('No unseen cards matched these filters.', 'Try changing the filters or reset reviewed cards in the README instructions.');
    } else {
      renderCurrentCard();
    }
  } catch (err) {
    showState('Could not load cards.', err.message, true);
  } finally {
    state.loading = false;
  }
}

function renderLoading() {
  els.cardStage.innerHTML = `<div class="state-panel"><div class="spinner"></div><p>Loading cards…</p></div>`;
}

function showState(title, message, retry = false) {
  els.cardStage.innerHTML = `<div class="state-panel error-panel"><div><h3>${escapeHtml(title)}</h3><p>${escapeHtml(message)}</p>${retry ? '<button class="secondary-button" id="retryBtn">Retry</button>' : ''}</div></div>`;
  if (retry) $('retryBtn')?.addEventListener('click', () => loadBatch(true));
}

function currentCard() { return state.queue[0] || null; }

function renderCurrentCard() {
  const card = currentCard();
  updateCounts();
  if (!card) { loadBatch(true); return; }
  const img = imageFor(card);
  els.cardStage.innerHTML = `
    <article class="swipe-card" id="swipeCard" aria-label="${escapeHtml(card.name)}">
      <div class="card-image-wrap">
        <img src="${img}" alt="${escapeHtml(card.name)}" draggable="false" />
        <div class="swipe-stamp save" id="saveStamp">SAVE</div>
        <div class="swipe-stamp skip" id="skipStamp">SKIP</div>
      </div>
      <div class="card-caption">
        <div><h3>${escapeHtml(card.name)}</h3><p>${escapeHtml(card.type_line || '')} · ${escapeHtml(card.set_name || '')}</p></div>
        <span class="card-price">${priceFor(card)}</span>
      </div>
    </article>`;
  attachSwipe($('swipeCard'));
  if (state.queue.length < 8) loadBatch();
}

function attachSwipe(cardEl) {
  let startX = 0, dx = 0, active = false;
  const threshold = Math.min(window.innerWidth * .24, 110);
  const saveStamp = $('saveStamp'), skipStamp = $('skipStamp');

  cardEl.addEventListener('pointerdown', (e) => {
    active = true; startX = e.clientX; dx = 0;
    cardEl.setPointerCapture(e.pointerId); cardEl.classList.add('dragging');
  });
  cardEl.addEventListener('pointermove', (e) => {
    if (!active) return;
    dx = e.clientX - startX;
    const rotate = dx / 20;
    cardEl.style.transform = `translateX(${dx}px) rotate(${rotate}deg)`;
    const opacity = Math.min(Math.abs(dx) / threshold, 1);
    if (dx > 0) { saveStamp.style.opacity = opacity; skipStamp.style.opacity = 0; }
    else { skipStamp.style.opacity = opacity; saveStamp.style.opacity = 0; }
  });
  const finish = () => {
    if (!active) return; active = false; cardEl.classList.remove('dragging');
    if (Math.abs(dx) >= threshold) performSwipe(dx > 0 ? 'save' : 'skip', cardEl);
    else {
      cardEl.style.transform = '';
      saveStamp.style.opacity = 0; skipStamp.style.opacity = 0;
    }
  };
  cardEl.addEventListener('pointerup', finish);
  cardEl.addEventListener('pointercancel', finish);
}

function performSwipe(action, cardEl = $('swipeCard')) {
  const card = currentCard(); if (!card) return;
  const direction = action === 'save' ? 1 : -1;
  if (cardEl) {
    cardEl.style.transform = `translateX(${direction * (window.innerWidth + 120)}px) rotate(${direction * 18}deg)`;
    cardEl.style.opacity = '0';
  }
  setTimeout(() => finalizeSwipe(card, action), 190);
}

function finalizeSwipe(card, action) {
  state.queue.shift();
  state.seenIds.add(card.id);
  if (action === 'save' && !state.saved.some(c => c.id === card.id)) state.saved.unshift(card);
  state.history.push({ card, action });
  if (state.history.length > 20) state.history.shift();
  persist();
  updateCounts();
  renderCurrentCard();
  els.undoBtn.disabled = false;
}

function undo() {
  const last = state.history.pop(); if (!last) return;
  state.seenIds.delete(last.card.id);
  if (last.action === 'save') state.saved = state.saved.filter(c => c.id !== last.card.id);
  state.queue.unshift(last.card);
  persist(); updateCounts(); renderCurrentCard(); renderSaved();
  els.undoBtn.disabled = state.history.length === 0;
  toast('Last swipe undone');
}

function updateCounts() {
  els.savedCount.textContent = state.saved.length;
  els.seenCount.textContent = state.seenIds.size;
}

function renderSaved() {
  els.savedGrid.innerHTML = '';
  els.savedEmpty.classList.toggle('hidden', state.saved.length > 0);
  for (const card of state.saved) {
    const wrap = document.createElement('div'); wrap.className = 'saved-card';
    wrap.innerHTML = `<button class="saved-card" data-id="${card.id}"><img src="${imageFor(card)}" alt="${escapeHtml(card.name)}"><div class="saved-card-info"><strong>${escapeHtml(card.name)}</strong><span>${escapeHtml(card.type_line || '')}</span></div></button><button class="remove-saved" data-remove="${card.id}" aria-label="Remove ${escapeHtml(card.name)}">✕</button>`;
    els.savedGrid.appendChild(wrap);
  }
  els.savedGrid.querySelectorAll('[data-id]').forEach(b => b.addEventListener('click', () => showDetails(state.saved.find(c => c.id === b.dataset.id))));
  els.savedGrid.querySelectorAll('[data-remove]').forEach(b => b.addEventListener('click', (e) => { e.stopPropagation(); removeSaved(b.dataset.remove); }));
}

function removeSaved(id) {
  const card = state.saved.find(c => c.id === id);
  state.saved = state.saved.filter(c => c.id !== id);
  persist(); updateCounts(); renderSaved();
  if (card) toast(`${card.name} removed`);
}

function showDetails(card = currentCard()) {
  if (!card) return;
  els.detailsImage.src = imageFor(card); els.detailsImage.alt = card.name;
  els.detailsName.textContent = card.name;
  els.detailsMeta.textContent = `${card.type_line || ''} · ${card.set_name || ''} (${(card.set || '').toUpperCase()})`;
  els.detailsText.textContent = oracleFor(card) || 'No oracle text.';
  els.detailsPrice.textContent = `Market: ${priceFor(card)}`;
  els.detailsModal.classList.remove('hidden');
}

function syncFilterInputs() {
  const f = state.filters;
  els.formatFilter.value = f.format; els.typeFilter.value = f.type; els.rarityFilter.value = f.rarity;
  els.manaMax.value = f.manaMax; els.priceMax.value = f.priceMax;
  els.colorMode.value = f.colorMode || 'contains'; els.excludeDigital.checked = f.paperOnly;
  document.querySelectorAll('.colorCheck').forEach(c => c.checked = f.colors.includes(c.value));
}

function readFilterInputs() {
  return {
    format: els.formatFilter.value,
    colors: [...document.querySelectorAll('.colorCheck:checked')].map(c => c.value),
    colorMode: els.colorMode.value,
    type: els.typeFilter.value,
    rarity: els.rarityFilter.value,
    manaMax: els.manaMax.value,
    priceMax: els.priceMax.value,
    paperOnly: els.excludeDigital.checked,
  };
}

function colorName(code) {
  return ({ W: 'White', U: 'Blue', B: 'Black', R: 'Red', G: 'Green', C: 'Colorless' })[code] || code;
}

function syncQuickColors() {
  const colors = state.filters.colors || [];
  document.querySelectorAll('.quick-color').forEach(btn => {
    const value = btn.dataset.quickColor;
    const active = value === '' ? colors.length === 0 : colors.includes(value);
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  });

  document.querySelectorAll('.match-mode').forEach(btn => {
    const active = btn.dataset.colorMode === (state.filters.colorMode || 'contains');
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  });

  if (els.colorFilterStatus) {
    if (!colors.length) els.colorFilterStatus.textContent = 'All colors';
    else {
      const names = colors.map(colorName).join(' + ');
      const mode = state.filters.colorMode === 'exact' ? 'exact' : state.filters.colorMode === 'all' ? 'all' : 'any';
      els.colorFilterStatus.textContent = `${names} · ${mode}`;
    }
  }
}

function reloadForColorChange(message) {
  state.queue = [];
  state.fetchToken++;
  persist();
  syncFilterInputs();
  syncQuickColors();
  loadBatch(true);
  toast(message);
}

function applyQuickColor(color) {
  if (!color) {
    state.filters.colors = [];
    reloadForColorChange('Showing all colors');
    return;
  }

  const colors = new Set(state.filters.colors || []);
  if (colors.has(color)) colors.delete(color);
  else colors.add(color);
  state.filters.colors = [...colors];
  reloadForColorChange(state.filters.colors.length ? `Color filter: ${state.filters.colors.map(colorName).join(', ')}` : 'Showing all colors');
}

function applyColorMode(mode) {
  state.filters.colorMode = mode;
  reloadForColorChange(mode === 'exact' ? 'Exact color match' : mode === 'all' ? 'Require all selected colors' : 'Match any selected color');
}

function applyFilters() {
  state.filters = readFilterInputs();
  state.queue = []; state.fetchToken++; persist();
  els.filterSheet.classList.add('hidden');
  syncQuickColors(); loadBatch(true); toast('Filters applied');
}

function exportSaved() {
  if (!state.saved.length) { toast('No saved cards to export'); return; }
  const text = state.saved.map(c => `1 ${c.name}`).join('\n');
  if (navigator.share) {
    navigator.share({ title: 'CardSwipe MTG list', text }).catch(() => {});
  } else if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => toast('Deck list copied'));
  } else {
    const blob = new Blob([text], {type:'text/plain'});
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'cardswipe-saved.txt'; a.click();
    URL.revokeObjectURL(a.href);
  }
}

function switchView(viewId) {
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === viewId));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.view === viewId));
  if (viewId === 'savedView') renderSaved();
}

let toastTimer;
function toast(message) {
  els.toast.textContent = message; els.toast.classList.remove('hidden');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => els.toast.classList.add('hidden'), 1600);
}

function escapeHtml(value='') {
  return String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
}

function bindEvents() {
  els.skipBtn.addEventListener('click', () => performSwipe('skip'));
  els.saveBtn.addEventListener('click', () => performSwipe('save'));
  els.undoBtn.addEventListener('click', undo);
  els.detailsBtn.addEventListener('click', () => showDetails());
  els.filtersBtn.addEventListener('click', () => { syncFilterInputs(); els.filterSheet.classList.remove('hidden'); });
  els.closeFiltersBtn.addEventListener('click', () => els.filterSheet.classList.add('hidden'));
  els.filterSheet.addEventListener('click', (e) => { if (e.target === els.filterSheet) els.filterSheet.classList.add('hidden'); });
  els.closeDetailsBtn.addEventListener('click', () => els.detailsModal.classList.add('hidden'));
  els.detailsModal.addEventListener('click', (e) => { if (e.target === els.detailsModal) els.detailsModal.classList.add('hidden'); });
  els.applyFiltersBtn.addEventListener('click', applyFilters);
  els.resetFiltersBtn.addEventListener('click', () => { state.filters = defaultFilters(); syncFilterInputs(); });
  els.exportBtn.addEventListener('click', exportSaved);
  document.querySelectorAll('.nav-item').forEach(n => n.addEventListener('click', () => switchView(n.dataset.view)));
  document.querySelectorAll('.quick-color').forEach(btn => btn.addEventListener('click', () => applyQuickColor(btn.dataset.quickColor)));
  document.querySelectorAll('.match-mode').forEach(btn => btn.addEventListener('click', () => applyColorMode(btn.dataset.colorMode)));
}

async function init() {
  loadState(); bindEvents(); syncFilterInputs(); syncQuickColors(); updateCounts(); renderSaved();
  await loadBatch(true);
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
}
init();
