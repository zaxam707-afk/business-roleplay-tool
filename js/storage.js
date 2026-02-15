/**
 * 営業ロープレツール - ストレージ管理
 * IndexedDB: 履歴・録音 | localStorage: シナリオセット・設定
 */

const DB_NAME = 'RoleplayToolDB';
const DB_VERSION = 1;
const STORE_HISTORY = 'history';

// IndexedDB 初期化
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_HISTORY)) {
        db.createObjectStore(STORE_HISTORY, { keyPath: 'id', autoIncrement: true });
      }
    };
  });
}

// 履歴を保存（日付・録音・スコア・フィードバック・会話文字起こし）
async function saveHistory(record) {
  const db = await openDB();
  const toSave = {
    date: new Date().toISOString(),
    scenarioTitle: record.scenarioTitle,
    score: record.score,
    percentage: record.percentage,
    rank: record.rank,
    feedbacks: record.feedbacks,
    recording: record.recording || null,
    transcript: record.transcript || [],
  };
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_HISTORY, 'readwrite');
    const store = tx.objectStore(STORE_HISTORY);
    const req = store.add(toSave);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// 履歴一覧を取得（新しい順）
async function getHistoryList() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_HISTORY, 'readonly');
    const store = tx.objectStore(STORE_HISTORY);
    const req = store.getAll();
    req.onsuccess = () => {
      const list = req.result || [];
      list.sort((a, b) => new Date(b.date) - new Date(a.date));
      resolve(list);
    };
    req.onerror = () => reject(req.error);
  });
}

// 履歴1件を取得
async function getHistoryById(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_HISTORY, 'readonly');
    const store = tx.objectStore(STORE_HISTORY);
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// 履歴を削除
async function deleteHistory(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_HISTORY, 'readwrite');
    const store = tx.objectStore(STORE_HISTORY);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// シナリオセット一覧を取得
function getScenarioSets() {
  try {
    const data = localStorage.getItem('roleplay_scenario_sets');
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

// シナリオセットを保存
function saveScenarioSets(sets) {
  localStorage.setItem('roleplay_scenario_sets', JSON.stringify(sets));
}

// デフォルトセットを追加
function getDefaultScenarioSet() {
  return {
    id: 'default',
    name: 'デフォルト',
    scenarios: typeof SCENARIOS !== 'undefined' ? SCENARIOS : [],
  };
}
