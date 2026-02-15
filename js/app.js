/**
 * 営業ロープレツール - メインアプリケーション
 */

// ========================================
// 状態管理
// ========================================
const state = {
  currentScreen: 'top',
  currentScenario: null,
  currentStep: 0,
  scores: [],
  feedbacks: [],
  choicesDisabled: false,
  voiceMode: true,
  speechRecognition: null,
  isSpeaking: false,
  autoSpeechDebounce: null,
  micPermissionGranted: false,
  mediaStream: null,
  recognitionRunning: false,
  currentTranscriptCallback: null,
  selectedSetId: 'default',
  mediaRecorder: null,
  recordedChunks: [],
};

// ========================================
// DOM要素の取得
// ========================================
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const screens = {
  top: $('#screen-top'),
  roleplay: $('#screen-roleplay'),
  result: $('#screen-result'),
};

// ========================================
// 音声機能（Web Speech API）
// ========================================

// 音声合成（TTS）- NPCが話す
function speakText(text, onEnd) {
  if (!state.voiceMode || !window.speechSynthesis) {
    if (onEnd) onEnd();
    return;
  }
  state.isSpeaking = true;
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'ja-JP';
  utterance.rate = 2;    // 2倍速
  utterance.pitch = 1;

  // 日本語音声を優先
  const voices = speechSynthesis.getVoices();
  const jaVoice = voices.find(v => v.lang.startsWith('ja'));
  if (jaVoice) utterance.voice = jaVoice;

  utterance.onend = () => {
    state.isSpeaking = false;
    if (onEnd) onEnd();
  };
  utterance.onerror = () => {
    state.isSpeaking = false;
    if (onEnd) onEnd();
  };

  speechSynthesis.speak(utterance);
}

// マイク許可を取得しストリームを保持（許可ダイアログを1回のみに）
async function requestMicrophonePermissionOnce() {
  if (state.mediaStream) return true;
  if (!navigator.mediaDevices?.getUserMedia) return false;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    state.mediaStream = stream;
    state.micPermissionGranted = true;
    return true;
  } catch {
    return false;
  }
}

// マイクストリームを解放（シナリオ終了時）
function releaseMicrophoneStream() {
  if (state.mediaStream) {
    state.mediaStream.getTracks().forEach(t => t.stop());
    state.mediaStream = null;
  }
}

// 録音開始
function startRecording() {
  if (!state.mediaStream || !window.MediaRecorder) return;
  state.recordedChunks = [];
  try {
    let options = {};
    if (typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported('audio/webm')) {
      options.mimeType = 'audio/webm';
    }
    const recorder = new MediaRecorder(state.mediaStream, options);
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) state.recordedChunks.push(e.data);
    };
    recorder.start(1000); // 1秒ごとにデータ取得（短い録音でも確実に取得）
    state.mediaRecorder = recorder;
  } catch (e) {
    console.warn('録音開始エラー:', e);
  }
}

// 録音停止してBlobを返す
function stopRecording() {
  return new Promise((resolve) => {
    if (!state.mediaRecorder) {
      resolve(null);
      return;
    }
    state.mediaRecorder.onstop = () => {
      const blob = state.recordedChunks.length > 0
        ? new Blob(state.recordedChunks, { type: state.mediaRecorder?.mimeType || 'audio/webm' })
        : null;
      state.mediaRecorder = null;
      state.recordedChunks = [];
      resolve(blob);
    };
    state.mediaRecorder.requestData?.(); // ブラウザによっては最後のデータを確実に取得
    state.mediaRecorder.stop();
  });
}

// 音声認識を開始（シナリオ中は1回だけstartし、継続稼働させる）
async function startAutoSpeechRecognition(choices, onTranscriptReady) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return null;

  await requestMicrophonePermissionOnce();

  state.currentTranscriptCallback = onTranscriptReady;

  if (state.recognitionRunning) return state.speechRecognition;

  if (state.autoSpeechDebounce) {
    clearTimeout(state.autoSpeechDebounce);
    state.autoSpeechDebounce = null;
  }

  let lastTranscript = '';
  const DEBOUNCE_MS = 1500;

  const recognition = new SpeechRecognition();
  recognition.lang = 'ja-JP';
  recognition.continuous = true;
  recognition.interimResults = true;

  recognition.onresult = (event) => {
    if (state.choicesDisabled) return;
    let transcript = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      transcript += event.results[i][0].transcript;
    }
    const isFinal = event.results[event.results.length - 1].isFinal;

    if (transcript) {
      lastTranscript = transcript;
      const transcriptEl = $('#speech-transcript');
      if (transcriptEl) transcriptEl.textContent = transcript;

      if (isFinal) {
        if (state.autoSpeechDebounce) clearTimeout(state.autoSpeechDebounce);
        state.autoSpeechDebounce = setTimeout(() => {
          state.autoSpeechDebounce = null;
          if (lastTranscript.trim().length >= 2 && !state.choicesDisabled && state.currentTranscriptCallback) {
            const text = lastTranscript.trim();
            state.currentTranscriptCallback(text);
          }
        }, DEBOUNCE_MS);
      }
    }
  };

  recognition.onend = () => {
    if (state.recognitionRunning && state.currentScreen === 'roleplay') {
      try { recognition.start(); } catch (e) {}
    }
  };

  recognition.onerror = (e) => {
    if (e.error !== 'no-speech' && e.error !== 'aborted') {
      console.warn('音声認識エラー:', e.error);
    }
  };

  state.speechRecognition = recognition;
  state.recognitionRunning = true;
  try {
    recognition.start();
    return recognition;
  } catch (e) {
    console.warn('音声認識開始エラー:', e);
    state.recognitionRunning = false;
    return null;
  }
}

// 音声認識の停止（シナリオ終了・戻る時のみ呼ぶ）
function stopSpeechRecognition() {
  state.recognitionRunning = false;
  if (state.autoSpeechDebounce) {
    clearTimeout(state.autoSpeechDebounce);
    state.autoSpeechDebounce = null;
  }
  if (state.speechRecognition) {
    try {
      state.speechRecognition.abort();
    } catch (e) {}
    state.speechRecognition = null;
  }
  if (state.mediaRecorder && state.mediaRecorder.state !== 'inactive') {
    try {
      state.mediaRecorder.stop();
    } catch (e) {}
    state.mediaRecorder = null;
    state.recordedChunks = [];
  }
  releaseMicrophoneStream();
}

// 発話内容と選択肢の類似度を計算（日本語ビグラム + キーワード重み付け）
function findBestMatchingChoice(userText, choices) {
  if (!userText || userText.trim().length < 2) return { index: -1, score: 0 };

  const normalized = userText.replace(/\s/g, '').trim();
  const getBigrams = (str) => {
    const s = str.replace(/\s/g, '');
    const set = new Set();
    for (let i = 0; i < s.length - 1; i++) set.add(s.substring(i, i + 2));
    return set;
  };

  let bestIndex = 0;
  let bestScore = 0;

  choices.forEach((choice, idx) => {
    const choiceNorm = choice.text.replace(/\s/g, '');
    const userBigrams = getBigrams(normalized);
    const choiceBigrams = getBigrams(choiceNorm);

    let overlap = 0;
    choiceBigrams.forEach(b => {
      if (userBigrams.has(b)) overlap++;
    });
    const diceScore = (2 * overlap) / (userBigrams.size + choiceBigrams.size + 1);

    // キーワード一致ボーナス（選択肢の重要語がユーザー発話に含まれると加点）
    const keywords = extractKeywords(choice.text);
    let keywordBonus = 0;
    keywords.forEach(kw => {
      if (kw.length >= 2 && normalized.includes(kw)) keywordBonus += 0.08;
    });

    const totalScore = Math.min(1, diceScore * 1.2 + keywordBonus);
    if (totalScore > bestScore) {
      bestScore = totalScore;
      bestIndex = idx;
    }
  });

  return { index: bestIndex, score: bestScore };
}

function extractKeywords(text) {
  const stopWords = ['です', 'ます', 'いた', 'おり', 'ござい', 'の', 'に', 'を', 'は', 'が', 'と', 'で', 'し', 'て', 'で', 'お', 'ご'];
  const normalized = text.replace(/[。、！？]/g, '');
  const words = [];
  for (let len = 3; len <= 6; len++) {
    for (let i = 0; i <= normalized.length - len; i++) {
      const w = normalized.substring(i, i + len);
      if (!stopWords.some(s => w.includes(s))) words.push(w);
    }
  }
  return [...new Set(words)].slice(0, 15);
}

// 音声モードのUI更新
function updateVoiceModeUI() {
  const label = $('#choices-label');
  const inputRow = $('#speech-input-row');
  if (label) label.textContent = state.voiceMode ? '話してください（自動で聞き取ります）：' : 'あなたの対応を入力してください：';
  if (inputRow) inputRow.style.display = state.voiceMode ? 'none' : 'flex';
}

// ========================================
// 画面切り替え
// ========================================
function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.remove('active'));
  screens[name].classList.add('active');
  state.currentScreen = name;
  window.scrollTo(0, 0);
}

// ========================================
// シナリオ取得（選択中のセットから）
// ========================================
function getScenarios() {
  const sets = getScenarioSets();
  const defaultSet = getDefaultScenarioSet();
  const allSets = [defaultSet, ...sets];
  const current = allSets.find(s => s.id === state.selectedSetId) || defaultSet;
  return current.scenarios || [];
}

// ========================================
// プロンプトからシナリオ生成（OpenAI API）
// ========================================
const SCENARIO_SCHEMA = `各シナリオは以下のJSON形式で、配列として返してください。必ず有効なJSONのみを返し、説明文は含めないでください。
[
  {
    "id": "一意のID（英数字）",
    "title": "シナリオタイトル",
    "icon": "絵文字1つ",
    "category": "カテゴリ名",
    "description": "概要説明",
    "difficulty": 1,
    "duration": "約5分",
    "npcName": "相手役の名前",
    "npcIcon": "👔",
    "playerRole": "プレイヤーの役割",
    "playerIcon": "🎧",
    "steps": [
      {
        "situation": "状況説明（任意）",
        "npcMessage": "相手のセリフ",
        "choices": [
          {"text": "想定応答1", "score": 100, "feedback": "フィードバック", "isGood": true},
          {"text": "想定応答2", "score": 50, "feedback": "フィードバック", "isGood": false},
          {"text": "想定応答3", "score": 20, "feedback": "フィードバック", "isGood": false}
        ]
      }
    ]
  }
]
各シナリオは5ステップ程度、各ステップに3つのchoicesを用意してください。`;

async function generateScenariosFromPrompt(prompt, apiKey) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `あなたはビジネスロープレのシナリオ作成の専門家です。ユーザーの要望に基づき、音声で会話練習できるシナリオを生成してください。${SCENARIO_SCHEMA}`,
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `API エラー: ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content?.trim() || '';
  const jsonMatch = content.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error('シナリオのJSONが見つかりません');

  const scenarios = JSON.parse(jsonMatch[0]);
  if (!Array.isArray(scenarios) || scenarios.length === 0) {
    throw new Error('有効なシナリオが生成されませんでした');
  }
  return scenarios;
}

// ========================================
// シナリオセットタブ描画
// ========================================
function renderScenarioSets() {
  const container = $('#sets-tabs');
  if (!container) return;
  const defaultSet = getDefaultScenarioSet();
  const sets = getScenarioSets();
  const allSets = [defaultSet, ...sets];

  container.innerHTML = allSets.map(s => `
    <button type="button" class="set-tab ${s.id === state.selectedSetId ? 'active' : ''}" data-set-id="${s.id}">
      ${s.name}
      ${s.id !== 'default' ? `<span class="set-delete" data-set-id="${s.id}" title="削除">×</span>` : ''}
    </button>
  `).join('');

  container.querySelectorAll('.set-tab').forEach(btn => {
    btn.addEventListener('click', (e) => {
      if (e.target.closest('.set-delete')) return;
      state.selectedSetId = btn.dataset.setId;
      renderScenarioSets();
      renderScenarioCards();
    });
  });
  container.querySelectorAll('.set-delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.setId;
      const sets = getScenarioSets().filter(s => s.id !== id);
      saveScenarioSets(sets);
      if (state.selectedSetId === id) state.selectedSetId = 'default';
      renderScenarioSets();
      renderScenarioCards();
    });
  });
}

// ========================================
// 履歴一覧描画
// ========================================
async function renderHistoryList() {
  const container = $('#history-list');
  if (!container) return;
  try {
    const list = await getHistoryList();
    container.innerHTML = list.length === 0
      ? '<p class="history-empty">履歴はまだありません</p>'
      : list.map(h => {
          const date = new Date(h.date);
          const dateStr = date.toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
          const hasRecording = h.recording && h.recording.size > 0;
          return `
            <div class="history-item" data-id="${h.id}">
              <div class="history-main">
                <span class="history-date">${dateStr}</span>
                <span class="history-title">${h.scenarioTitle || 'シナリオ'}</span>
                <span class="history-score">${h.percentage || 0}点 (${h.rank || '-'})</span>
              </div>
              <div class="history-actions">
                <button type="button" class="btn-play-recording ${hasRecording ? '' : 'disabled'}" data-id="${h.id}" ${hasRecording ? 'title="録音を再生"' : 'title="録音なし（音声モードONで実施すると録音されます）" disabled'} data-has-recording="${hasRecording}">▶</button>
                <button type="button" class="btn-delete-history" data-id="${h.id}" title="削除">削除</button>
              </div>
            </div>
          `;
        }).join('');

    container.querySelectorAll('.btn-play-recording').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        if (btn.disabled || btn.classList.contains('disabled')) return;
        const id = parseInt(btn.dataset.id, 10);
        const record = await getHistoryById(id);
        if (record?.recording && record.recording.size > 0) {
          const url = URL.createObjectURL(record.recording);
          const audio = new Audio(url);
          audio.play();
          audio.onended = () => URL.revokeObjectURL(url);
        }
      });
    });
    container.querySelectorAll('.btn-delete-history').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('この履歴を削除しますか？')) return;
        await deleteHistory(parseInt(btn.dataset.id, 10));
        renderHistoryList();
      });
    });
  } catch (e) {
    container.innerHTML = '<p class="history-empty">履歴の読み込みに失敗しました</p>';
  }
}

// ========================================
// トップ画面：シナリオカード生成
// ========================================
function renderScenarioCards() {
  const container = $('#scenario-list');
  container.innerHTML = '';

  const scenarios = getScenarios();
  scenarios.forEach((scenario, index) => {
    const card = document.createElement('div');
    card.className = 'scenario-card';
    card.style.animationDelay = `${index * 0.1}s`;
    card.style.animation = `slideUp 0.5s ease ${index * 0.1}s both`;

    // 難易度ドット
    let difficultyDots = '';
    for (let i = 1; i <= 3; i++) {
      difficultyDots += `<span class="difficulty-dot ${i <= scenario.difficulty ? 'active' : ''}"></span>`;
    }

    card.innerHTML = `
      <div class="card-header">
        <div class="card-icon">${scenario.icon}</div>
        <div class="card-title">${scenario.title}</div>
      </div>
      <div class="card-desc">${scenario.description}</div>
      <div class="card-meta">
        <span>📁 ${scenario.category}</span>
        <span>⏱ ${scenario.duration}</span>
        <span class="difficulty">
          難易度：${difficultyDots}
        </span>
      </div>
    `;

    card.addEventListener('click', () => startScenario(scenario));
    container.appendChild(card);
  });
}

// ========================================
// ロープレ開始
// ========================================
async function startScenario(scenario) {
  state.currentScenario = scenario;
  state.currentStep = 0;
  state.scores = [];
  state.feedbacks = [];
  state.choicesDisabled = false;

  if (state.voiceMode) {
    await requestMicrophonePermissionOnce();
    startRecording();
  }

  // ヘッダー情報
  $('#rp-title').textContent = scenario.title;
  $('#rp-badge').textContent = scenario.category;
  $('#rp-total').textContent = scenario.steps.length;

  // チャットエリアをクリア
  $('#chat-area').innerHTML = '';

  showScreen('roleplay');
  updateVoiceModeUI();
  renderStep();
}

// ========================================
// ステップ描画
// ========================================
function renderStep() {
  const scenario = state.currentScenario;
  const step = scenario.steps[state.currentStep];

  // 進捗表示
  $('#rp-step').textContent = state.currentStep + 1;

  // 状況説明
  if (step.situation) {
    $('#situation-bar').style.display = 'flex';
    $('#situation-text').textContent = step.situation;
  } else {
    $('#situation-bar').style.display = 'none';
  }

  // 相手のメッセージを表示（音声モード時はTTSで読み上げ）
  showTypingIndicator(scenario.npcName, scenario.npcIcon, step.npcMessage, () => {
    addChatMessage('npc', scenario.npcName, scenario.npcIcon, step.npcMessage);
    renderFreeSpeechUI(step.choices);
  });
}

// ========================================
// タイピングインジケーター（音声モード時はTTSで読み上げ）
// ========================================
function showTypingIndicator(name, icon, npcMessage, callback) {
  const chatArea = $('#chat-area');
  state.choicesDisabled = true;
  hideChoices();

  const typingMsg = document.createElement('div');
  typingMsg.className = 'chat-msg npc';
  typingMsg.id = 'typing-indicator';
  typingMsg.innerHTML = `
    <div class="chat-avatar">${icon}</div>
    <div class="chat-bubble">
      <div class="chat-name">${name}</div>
      <div class="typing-indicator">
        <span></span><span></span><span></span>
      </div>
    </div>
  `;

  chatArea.appendChild(typingMsg);
  scrollChatToBottom();

  const typingDuration = state.voiceMode ? 800 : 1000 + Math.random() * 500;

  setTimeout(() => {
    const indicator = document.getElementById('typing-indicator');
    if (indicator) indicator.remove();

    if (state.voiceMode && npcMessage) {
      speakText(npcMessage, () => {
        state.choicesDisabled = false;
        callback();
      });
    } else {
      state.choicesDisabled = false;
      callback();
    }
  }, typingDuration);
}

// ========================================
// チャットメッセージ追加
// ========================================
function addChatMessage(type, name, icon, message) {
  const chatArea = $('#chat-area');

  const msgEl = document.createElement('div');
  msgEl.className = `chat-msg ${type}`;
  msgEl.innerHTML = `
    <div class="chat-avatar">${icon}</div>
    <div class="chat-bubble">
      <div class="chat-name">${name}</div>
      <div>${message}</div>
    </div>
  `;

  chatArea.appendChild(msgEl);
  scrollChatToBottom();
}

// ========================================
// チャット自動スクロール
// ========================================
function scrollChatToBottom() {
  const chatArea = $('#chat-area');
  setTimeout(() => {
    chatArea.scrollTop = chatArea.scrollHeight;
  }, 50);
}

// ========================================
// 自由発話UIの描画（音声モード時は自動聞き取り開始）
// ========================================
function renderFreeSpeechUI(choices) {
  const area = $('#choices-area');
  const textInput = $('#speech-text-input');
  const transcriptEl = $('#speech-transcript');
  const sendBtn = $('#btn-send-speech');
  const inputRow = $('#speech-input-row');

  area.style.display = 'block';
  if (textInput) textInput.value = '';
  if (transcriptEl) {
    transcriptEl.textContent = '聞いています…';
    transcriptEl.style.display = state.voiceMode ? '' : 'none';
  }
  if (inputRow) inputRow.style.display = state.voiceMode ? 'none' : 'flex';
  if (sendBtn) sendBtn.style.display = state.voiceMode ? 'none' : '';

  const submitSpeech = (text) => {
    const content = text || textInput?.value?.trim() || '';
    if (!content) {
      if (!state.voiceMode) alert('発話内容を入力してください。');
      return;
    }
    if (state.choicesDisabled) return;
    handleFreeSpeech(content, choices);
  };

  // 音声モード：自動で聞き取り開始
  if (state.voiceMode && (window.SpeechRecognition || window.webkitSpeechRecognition)) {
    startAutoSpeechRecognition(choices, (transcript) => {
      submitSpeech(transcript);
    });
  }

  // 音声オフ時：テキスト入力 + 送信
  if (sendBtn) sendBtn.onclick = () => submitSpeech();
  if (textInput) {
    textInput.onkeydown = (e) => {
      if (e.key === 'Enter') submitSpeech();
    };
  }

  scrollChatToBottom();
}

// ========================================
// 選択肢の非表示
// ========================================
function hideChoices() {
  $('#choices-area').style.display = 'none';
}

// ========================================
// 自由発話のハンドリング（発話内容を類似度でマッチング）
// ========================================
function handleFreeSpeech(userSpeech, choices) {
  if (state.choicesDisabled) return;
  state.choicesDisabled = true;

  const scenario = state.currentScenario;
  const step = scenario.steps[state.currentStep];

  const { index: choiceIndex, score: matchScore } = findBestMatchingChoice(userSpeech, choices);
  const choice = choiceIndex >= 0 ? step.choices[choiceIndex] : step.choices[0];

  // マッチングが弱い場合は最低スコアを適用
  const effectiveScore = matchScore >= 0.15 ? choice.score : Math.min(choice.score, 40);
  const effectiveChoice = { ...choice, score: effectiveScore };

  state.scores.push(effectiveScore);
  state.feedbacks.push({
    step: state.currentStep + 1,
    text: choice.feedback,
    isGood: choice.isGood,
    choiceText: choice.text,
    userSpeech: userSpeech,
    score: effectiveScore,
    matchScore: matchScore,
  });

  hideChoices();

  // ユーザーの実際の発言をチャットに追加
  addChatMessage('user', scenario.playerRole, scenario.playerIcon, userSpeech);

  // フィードバック表示（マッチした選択肢の参考例も表示）
  showInlineFeedback(effectiveChoice, userSpeech, choice.text, matchScore);

  // 次のステップへ進む or 結果画面
  setTimeout(async () => {
    if (state.currentStep < scenario.steps.length - 1) {
      state.currentStep++;
      state.choicesDisabled = false;
      renderStep();
    } else {
      const recordingBlob = await stopRecording();
      stopSpeechRecognition();
      window.speechSynthesis?.cancel();
      setTimeout(() => showResult(recordingBlob), 800);
    }
  }, 2200);
}

// ========================================
// インラインフィードバック（自由発話時は参考例も表示）
// ========================================
function showInlineFeedback(choice, userSpeech, matchedExample, matchScore) {
  const chatArea = $('#chat-area');
  const feedbackEl = document.createElement('div');
  feedbackEl.className = 'chat-msg npc';
  feedbackEl.style.maxWidth = '85%';

  const icon = choice.isGood ? '✅' : '💡';
  const bgColor = choice.isGood ? '#ECFDF5' : '#FFF7ED';
  const borderColor = choice.isGood ? '#A7F3D0' : '#FDE68A';
  const textColor = choice.isGood ? '#065F46' : '#92400E';

  const matchInfo = matchScore !== undefined && matchScore < 0.3
    ? `<div style="margin-top: 6px; font-size: 0.78rem; opacity: 0.8;">参考例: ${matchedExample || choice.text}</div>`
    : '';

  feedbackEl.innerHTML = `
    <div class="chat-bubble" style="background: ${bgColor}; border: 1px solid ${borderColor}; color: ${textColor}; font-size: 0.85rem; border-bottom-left-radius: 4px;">
      <strong>${icon} ${choice.isGood ? 'Good!' : 'アドバイス'}</strong><br>
      ${choice.feedback}
      <div style="margin-top: 4px; font-size: 0.78rem; opacity: 0.7;">スコア: ${choice.score}点</div>
      ${matchInfo}
    </div>
  `;

  chatArea.appendChild(feedbackEl);
  scrollChatToBottom();
}

// ========================================
// 結果画面
// ========================================
async function showResult(recordingBlob = null) {
  const totalScore = state.scores.reduce((a, b) => a + b, 0);
  const maxScore = state.scores.length * 100;
  const percentage = Math.round((totalScore / maxScore) * 100);

  // ランク判定
  let rank, rankDesc, resultIcon;
  if (percentage >= 90) {
    rank = 'S ランク';
    rankDesc = '圧倒的なビジネスセンス！プロフェッショナルです！';
    resultIcon = '🏆';
  } else if (percentage >= 70) {
    rank = 'A ランク';
    rankDesc = '素晴らしい対応力です！自信を持ちましょう。';
    resultIcon = '🥇';
  } else if (percentage >= 50) {
    rank = 'B ランク';
    rankDesc = '基本はできています。さらなるスキルアップを目指しましょう。';
    resultIcon = '🥈';
  } else if (percentage >= 30) {
    rank = 'C ランク';
    rankDesc = '改善の余地があります。ポイントを確認して再挑戦しましょう。';
    resultIcon = '🥉';
  } else {
    rank = 'D ランク';
    rankDesc = 'まだまだ伸びしろがあります！フィードバックを確認して再挑戦しましょう。';
    resultIcon = '📝';
  }

  // 画面要素を更新
  $('#result-icon').textContent = resultIcon;
  $('#result-title').textContent = `${state.currentScenario.title} - 完了！`;
  $('#score-number').textContent = percentage;

  const rankContainer = $('#result-rank');
  rankContainer.innerHTML = `
    <span class="rank-badge">${rank}</span>
    <p class="rank-desc">${rankDesc}</p>
  `;

  // フィードバック一覧
  const feedbackContainer = $('#result-feedback');
  feedbackContainer.innerHTML = `
    <div class="feedback-title">📊 各ステップの振り返り</div>
    ${state.feedbacks.map(fb => `
      <div class="feedback-item">
        <span class="feedback-icon">${fb.isGood ? '✅' : '💡'}</span>
        <div>
          <strong>ステップ ${fb.step}</strong>（${fb.score}点）<br>
          ${fb.userSpeech ? `<em>あなたの発話: 「${fb.userSpeech}」</em><br>` : ''}
          ${fb.text}
        </div>
      </div>
    `).join('')}
  `;

  showScreen('result');
  animateScore(percentage);

  // 履歴を保存（日付・録音・スコア）
  try {
    await saveHistory({
      scenarioTitle: state.currentScenario.title,
      score: totalScore,
      percentage,
      rank,
      feedbacks: state.feedbacks,
      recording: recordingBlob || null,
    });
  } catch (e) {
    console.warn('履歴保存エラー:', e);
  }
}

// ========================================
// スコアアニメーション
// ========================================
function animateScore(target) {
  const el = $('#score-number');
  let current = 0;
  const duration = 1200;
  const startTime = performance.now();

  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    // イージング（ease-out）
    const eased = 1 - Math.pow(1 - progress, 3);
    current = Math.round(eased * target);
    el.textContent = current;

    if (progress < 1) {
      requestAnimationFrame(update);
    }
  }

  requestAnimationFrame(update);
}

// ========================================
// イベントリスナー
// ========================================

// 戻るボタン
$('#btn-back').addEventListener('click', () => {
  if (confirm('ロープレを中断してシナリオ選択に戻りますか？')) {
    stopSpeechRecognition();
    window.speechSynthesis?.cancel();
    showScreen('top');
  }
});

// もう一度挑戦ボタン
$('#btn-retry').addEventListener('click', () => {
  if (state.currentScenario) {
    startScenario(state.currentScenario);
  }
});

// シナリオ選択に戻るボタン
$('#btn-home').addEventListener('click', () => {
  showScreen('top');
});

// ========================================
// 初期化
// ========================================
function init() {
  renderScenarioSets();
  renderScenarioCards();
  renderHistoryList();
  showScreen('top');
  updateVoiceModeUI();

  // タブ切り替え
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      const target = document.getElementById(`tab-${tab.dataset.tab}`);
      if (target) target.classList.add('active');
      if (tab.dataset.tab === 'history') renderHistoryList();
    });
  });

  // 新規シナリオセット登録
  const btnAddSet = document.getElementById('btn-add-set');
  if (btnAddSet) {
    btnAddSet.addEventListener('click', () => {
      const name = prompt('シナリオセット名を入力してください', '新規セット');
      if (!name?.trim()) return;
      const sets = getScenarioSets();
      const newSet = {
        id: 'set_' + Date.now(),
        name: name.trim(),
        scenarios: [],
      };
      sets.push(newSet);
      saveScenarioSets(sets);
      state.selectedSetId = newSet.id;
      renderScenarioSets();
      renderScenarioCards();
      if (document.getElementById('prompt-status')) {
        document.getElementById('prompt-status').textContent = '空のセットを作成しました。プロンプトで生成するか、ファイルを読み込んでください。';
      }
    });
  }

  // 音声モードトグル
  const voiceToggle = $('#voice-mode-toggle');
  if (voiceToggle) {
    voiceToggle.checked = state.voiceMode;
    voiceToggle.addEventListener('change', () => {
      state.voiceMode = voiceToggle.checked;
      updateVoiceModeUI();
      if (!state.voiceMode) {
        stopSpeechRecognition();
        window.speechSynthesis?.cancel();
      }
    });
  }

  // Chrome用: 音声リストの事前読み込み
  if (window.speechSynthesis) {
    speechSynthesis.getVoices();
    if (speechSynthesis.onvoiceschanged !== undefined) {
      speechSynthesis.onvoiceschanged = () => speechSynthesis.getVoices();
    }
  }

  // プロンプトでシナリオ生成
  const promptInput = document.getElementById('prompt-input');
  const apiKeyInput = document.getElementById('api-key-input');
  const btnGenerate = document.getElementById('btn-generate');
  const promptStatus = document.getElementById('prompt-status');

  if (promptInput) {
    promptInput.value = localStorage.getItem('roleplay_prompt') || '';
    promptInput.addEventListener('input', () => {
      localStorage.setItem('roleplay_prompt', promptInput.value);
    });
  }

  if (apiKeyInput) {
    apiKeyInput.value = localStorage.getItem('roleplay_api_key') || '';
    apiKeyInput.addEventListener('input', () => {
      localStorage.setItem('roleplay_api_key', apiKeyInput.value);
    });
  }

  if (btnGenerate && promptInput) {
    btnGenerate.addEventListener('click', async () => {
      const prompt = promptInput.value.trim();
      const apiKey = apiKeyInput?.value?.trim();

      if (!prompt) {
        if (promptStatus) {
          promptStatus.textContent = 'プロンプトを入力してください';
          promptStatus.className = 'prompt-status error';
        }
        return;
      }
      if (!apiKey) {
        if (promptStatus) {
          promptStatus.textContent = 'OpenAI APIキーを入力してください';
          promptStatus.className = 'prompt-status error';
        }
        return;
      }

      btnGenerate.disabled = true;
      if (promptStatus) {
        promptStatus.textContent = '生成中…';
        promptStatus.className = 'prompt-status';
      }

      try {
        const scenarios = await generateScenariosFromPrompt(prompt, apiKey);
        localStorage.setItem('roleplay_prompt', prompt);
        const sets = getScenarioSets();
        const currentSet = sets.find(s => s.id === state.selectedSetId);
        if (currentSet && currentSet.scenarios?.length === 0) {
          currentSet.scenarios = scenarios;
          currentSet.name = prompt.slice(0, 25) + (prompt.length > 25 ? '...' : '') || '生成シナリオ';
        } else {
          const newSet = {
            id: 'set_' + Date.now(),
            name: prompt.slice(0, 25) + (prompt.length > 25 ? '...' : '') || '生成シナリオ',
            scenarios,
          };
          sets.push(newSet);
          state.selectedSetId = newSet.id;
        }
        saveScenarioSets(sets);
        renderScenarioSets();
        renderScenarioCards();
        if (promptStatus) {
          promptStatus.textContent = `✓ ${scenarios.length}件のシナリオを登録しました`;
          promptStatus.className = 'prompt-status success';
        }
      } catch (err) {
        if (promptStatus) {
          promptStatus.textContent = `✗ エラー: ${err.message}`;
          promptStatus.className = 'prompt-status error';
        }
      } finally {
        btnGenerate.disabled = false;
      }
    });
  }

  // スクリプトファイル読み込み
  const scriptInput = document.getElementById('script-file-input');
  const btnLoadScript = document.getElementById('btn-load-script');
  const statusEl = document.getElementById('prompt-status');
  if (scriptInput && btnLoadScript) {
    btnLoadScript.addEventListener('click', () => scriptInput.click());
    scriptInput.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        let scenarios = null;
        if (file.name.endsWith('.json')) {
          scenarios = JSON.parse(text);
        } else if (file.name.endsWith('.js')) {
          try {
            const fn = new Function(text + '; return typeof SCENARIOS !== "undefined" ? SCENARIOS : null;');
            scenarios = fn();
          } catch {
            scenarios = JSON.parse(text);
          }
        }
        if (Array.isArray(scenarios) && scenarios.length > 0) {
          const sets = getScenarioSets();
          const currentSet = sets.find(s => s.id === state.selectedSetId);
          if (currentSet && currentSet.scenarios?.length === 0) {
            currentSet.scenarios = scenarios;
            currentSet.name = file.name.replace(/\.(json|js)$/, '');
          } else {
            const newSet = {
              id: 'set_' + Date.now(),
              name: file.name.replace(/\.(json|js)$/, ''),
              scenarios,
            };
            sets.push(newSet);
            state.selectedSetId = newSet.id;
          }
          saveScenarioSets(sets);
          renderScenarioSets();
          renderScenarioCards();
          if (statusEl) statusEl.textContent = `✓ ${file.name} を登録しました（${scenarios.length}件）`;
        } else {
          throw new Error('有効なシナリオ配列が見つかりません');
        }
      } catch (err) {
        if (statusEl) statusEl.textContent = `✗ 読み込みエラー: ${err.message}`;
      }
      scriptInput.value = '';
    });
  }
}

// DOMContentLoaded
document.addEventListener('DOMContentLoaded', init);

// すでにDOMが読み込まれている場合
if (document.readyState !== 'loading') {
  init();
}
