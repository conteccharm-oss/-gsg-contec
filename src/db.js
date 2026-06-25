const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data.json');

const DEFAULT = {
  products: [],
  anniversaries: [],
  selections: [],
  settings: {},
  seq: { products: 0, anniversaries: 0, selections: 0 },
};

class JsonDB {
  constructor() {
    this._load();
  }

  _load() {
    try {
      if (fs.existsSync(DB_PATH)) {
        this.data = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
        // 마이그레이션: seq 없으면 추가
        if (!this.data.seq) this.data.seq = { products: 0, anniversaries: 0, selections: 0 };
        return;
      }
    } catch (e) { /* 파싱 실패 시 기본값 */ }
    this.data = JSON.parse(JSON.stringify(DEFAULT));
    this._save();
  }

  _save() {
    fs.writeFileSync(DB_PATH, JSON.stringify(this.data, null, 2), 'utf8');
  }

  _nextId(table) {
    this.data.seq[table] = (this.data.seq[table] || 0) + 1;
    return this.data.seq[table];
  }

  // ── 상품 ──────────────────────────────────────────────
  getProducts({ vendor, maxPrice, q } = {}) {
    let list = this.data.products;
    if (vendor && vendor !== 'all') list = list.filter(p => p.vendor === vendor);
    if (maxPrice) list = list.filter(p => p.price <= maxPrice);
    if (q) {
      const lower = q.toLowerCase();
      list = list.filter(p => p.name.toLowerCase().includes(lower) || p.category.includes(q));
    }
    // 꽃집청년들 전용 필터: 15만원대(130,000원 이상) 제외, 서울 한정 상품 제외
    const SEOUL_KEYWORDS = ['서울', '당일', '서울한정', '서울지역'];
    list = list.filter(p => {
      if (p.vendor !== 'fmans') return true;
      if (p.price >= 130000) return false;
      if (SEOUL_KEYWORDS.some(kw => p.name.includes(kw))) return false;
      return true;
    });
    return [...list].sort((a, b) => a.price - b.price);
  }

  replaceProducts(products) {
    const now = new Date().toISOString();
    let maxId = this.data.seq.products || 0;
    this.data.products = products.map(p => {
      maxId++;
      return { ...p, id: maxId, crawled_at: now };
    });
    this.data.seq.products = maxId;
    // selections도 정리 (삭제된 상품 참조 제거)
    const validIds = new Set(this.data.products.map(p => p.id));
    this.data.selections = this.data.selections.filter(s => validIds.has(s.product_id));
    this._save();
    return this.data.products.length;
  }

  getProductById(id) {
    return this.data.products.find(p => p.id === id) || null;
  }

  countProducts() {
    return this.data.products.length;
  }

  // ── 기념일 ────────────────────────────────────────────
  getAllAnniversaries() {
    return this.data.anniversaries.map(ann => {
      const products = this.data.selections
        .filter(s => s.anniversary_id === ann.id)
        .map(s => this.data.products.find(p => p.id === s.product_id))
        .filter(Boolean);
      return { ...ann, products };
    }).sort((a, b) => a.date.localeCompare(b.date));
  }

  createAnniversary({ person_name, relation, anniversary_type, date, notify_days }) {
    const id = this._nextId('anniversaries');
    const now = new Date().toISOString();
    const ann = { id, person_name, relation, anniversary_type, date, notify_days: notify_days || '7,3,1', created_at: now };
    this.data.anniversaries.push(ann);
    this._save();
    return ann;
  }

  updateAnniversary(id, fields) {
    const idx = this.data.anniversaries.findIndex(a => a.id === id);
    if (idx === -1) return null;
    this.data.anniversaries[idx] = { ...this.data.anniversaries[idx], ...fields };
    this._save();
    return this.data.anniversaries[idx];
  }

  deleteAnniversary(id) {
    this.data.anniversaries = this.data.anniversaries.filter(a => a.id !== id);
    this.data.selections = this.data.selections.filter(s => s.anniversary_id !== id);
    this._save();
  }

  // ── 선택 ──────────────────────────────────────────────
  getSelections(anniversary_id) {
    return this.data.selections
      .filter(s => s.anniversary_id === anniversary_id)
      .map(s => this.data.products.find(p => p.id === s.product_id))
      .filter(Boolean);
  }

  countSelections(anniversary_id) {
    return this.data.selections.filter(s => s.anniversary_id === anniversary_id).length;
  }

  getSelectionsTotal(anniversary_id) {
    return this.data.selections
      .filter(s => s.anniversary_id === anniversary_id)
      .reduce((sum, s) => {
        const p = this.data.products.find(x => x.id === s.product_id);
        return sum + (p ? p.price : 0);
      }, 0);
  }

  addSelection(anniversary_id, product_id) {
    // 중복 체크
    if (this.data.selections.some(s => s.anniversary_id === anniversary_id && s.product_id === product_id)) {
      throw new Error('이미 선택된 상품입니다');
    }
    const id = this._nextId('selections');
    this.data.selections.push({ id, anniversary_id, product_id });
    this._save();
  }

  removeSelection(anniversary_id, product_id) {
    this.data.selections = this.data.selections.filter(
      s => !(s.anniversary_id === anniversary_id && s.product_id === product_id)
    );
    this._save();
  }

  // ── 설정 ──────────────────────────────────────────────
  getSetting(key) {
    return this.data.settings[key] || null;
  }

  getAllSettings() {
    return { ...this.data.settings };
  }

  setSetting(key, value) {
    this.data.settings[key] = value;
    this._save();
  }

  // ── 신청 ──────────────────────────────────────────────
  createApplication(fields) {
    if (!this.data.applications) this.data.applications = [];
    if (!this.data.seq.applications) this.data.seq.applications = 0;
    const id = ++this.data.seq.applications;
    const now = new Date().toISOString();
    const app = { id, ...fields, status: 'pending', submitted_at: now };
    this.data.applications.push(app);
    this._save();
    return app;
  }

  getAllApplications() {
    return [...(this.data.applications || [])].sort((a, b) =>
      new Date(b.submitted_at) - new Date(a.submitted_at)
    );
  }

  getApplicationById(id) {
    return (this.data.applications || []).find(a => a.id === id) || null;
  }

  updateApplicationStatus(id, status) {
    if (!this.data.applications) return null;
    const idx = this.data.applications.findIndex(a => a.id === id);
    if (idx === -1) return null;
    this.data.applications[idx].status = status;
    this._save();
    return this.data.applications[idx];
  }

  deleteApplication(id) {
    if (!this.data.applications) return;
    this.data.applications = this.data.applications.filter(a => a.id !== id);
    this._save();
  }

  // ── 찜하기 (IP 기반) ──────────────────────────────────────
  getWishlist(ip) {
    if (!this.data.wishlists) this.data.wishlists = {};
    const ids = this.data.wishlists[ip] || [];
    return this.data.products.filter(p => ids.includes(p.id));
  }

  setWishlist(ip, ids) {
    if (!this.data.wishlists) this.data.wishlists = {};
    this.data.wishlists[ip] = ids;
    this._save();
  }

  // 해당 연도 임직원별 사용 횟수/금액 조회
  getUsageSummary(year, employeeName) {
    const apps = (this.data.applications || []).filter(a => {
      const y = new Date(a.submitted_at).getFullYear();
      return y === year && (!employeeName || a.employee_name === employeeName) && a.status !== 'cancelled';
    });
    const count = apps.length;
    const total = apps.reduce((s, a) => s + (a.total_price || 0), 0);
    return { count, total, remaining_count: Math.max(0, 2 - count), remaining_budget: Math.max(0, 150000 - total) };
  }
}

module.exports = new JsonDB();
