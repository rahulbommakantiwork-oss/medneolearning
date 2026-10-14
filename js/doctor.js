/* ============================================================
   Alembic MedLearn — Doctor Dashboard Logic
   ============================================================ */

let currentUser = null;
let activeModuleId = 'm1';
let currentSlide = 0;
let quizState = { currentQ: 0, answers: [], score: 0, answered: false };
let quizStartedAt = 0;
let quizAttemptSubmitted = false;
let articleScrollMarks = new Set();
let articleSectionsSeen = new Set();
let readerNightMode = false;
let readerSoundEnabled = false;
let readerSpeech = null;
let presentationHeartbeat = null;
let presentationReadSession = null;
let readerAudioContext = null;
let readerAudioMasterGain = null;
let readerAudioCompressor = null;
let nativePptxRenderer = null;
let nativePptxImportPromise = null;
let nativePptxSlideIndex = 0;
let nativePptxSlideCount = 0;
let nativePptxRenderSerial = 0;
const nativePptxBufferCache = new Map();
let nativePptxBufferCacheBytes = 0;
const NATIVE_PPTX_CACHE_ITEM_LIMIT = 24 * 1024 * 1024;
const NATIVE_PPTX_CACHE_TOTAL_LIMIT = 32 * 1024 * 1024;
let pdfJsImportPromise = null;
let pdfReaderDocument = null;
let pdfReaderLoadingTask = null;
let pdfReaderRenderTask = null;
let pdfReaderPage = 1;
let pdfReaderPageCount = 0;
let pdfReaderZoom = 1;
let pdfReaderRenderSerial = 0;
let pdfReaderPageText = new Map();
let pdfReaderPagesViewed = new Set();
const PDFJS_MODULE_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs';
const PDFJS_WORKER_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';
const quizEncouragement = ['Nice work — keep the momentum.', 'Good focus. One question at a time.', 'You are moving forward. Keep going.', 'Every answer is a chance to learn.'];
function ensureLearningInteractionStyles() {
  if (document.getElementById('medneo-learning-microinteractions')) return;
  const style = document.createElement('style');
  style.id = 'medneo-learning-microinteractions';
  style.textContent = `
    @keyframes medneoQuizEnter { 0% { opacity:0; transform:translateY(14px) scale(.992); filter:blur(2px); } 70% { opacity:1; filter:blur(0); } 100% { opacity:1; transform:translateY(0) scale(1); filter:blur(0); } }
    @keyframes medneoOptionEnter { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
    @keyframes medneoAnswerPop { 0% { transform:scale(.985); } 55% { transform:scale(1.018); } 100% { transform:scale(1); } }
    @keyframes medneoSoftNudge { 0%,100% { transform:translateX(0); } 28% { transform:translateX(-3px); } 56% { transform:translateX(2px); } 78% { transform:translateX(-1px); } }
    @keyframes medneoFeedbackRise { from { opacity:0; transform:translateY(8px) scale(.99); } to { opacity:1; transform:translateY(0) scale(1); } }
    @keyframes medneoRewardPulse { 0% { box-shadow:0 0 0 0 rgba(33,150,105,0); } 35% { box-shadow:0 0 0 5px rgba(33,150,105,.14); } 100% { box-shadow:0 0 0 9px rgba(33,150,105,0); } }
    @keyframes medneoProgressGrow { from { transform:scaleX(0); } to { transform:scaleX(1); } }
    @keyframes medneoScoreReveal { from { opacity:0; transform:translateY(8px) scale(.94); } 70% { opacity:1; transform:translateY(-2px) scale(1.02); } to { opacity:1; transform:translateY(0) scale(1); } }
    @keyframes medneoSoundPulse { 0%,100% { box-shadow:0 0 0 0 rgba(33,150,105,0); } 50% { box-shadow:0 0 0 4px rgba(33,150,105,.12); } }
    #mcqModalBody .mcq-container { animation:medneoQuizEnter .38s cubic-bezier(.2,.75,.25,1) both; transform-origin:top center; }
    #mcqModalBody .mcq-question-card { transition:border-color .22s ease, box-shadow .22s ease, background-color .22s ease, transform .22s ease; }
    #mcqModalBody .mcq-option { position:relative; overflow:hidden; cursor:pointer; transform:translateZ(0); transition:transform .18s cubic-bezier(.2,.7,.25,1), box-shadow .18s ease, border-color .18s ease, background-color .18s ease, color .18s ease; animation:medneoOptionEnter .34s ease both; }
    #mcqModalBody .mcq-option:nth-child(1) { animation-delay:.025s; }
    #mcqModalBody .mcq-option:nth-child(2) { animation-delay:.065s; }
    #mcqModalBody .mcq-option:nth-child(3) { animation-delay:.105s; }
    #mcqModalBody .mcq-option:nth-child(4) { animation-delay:.145s; }
    #mcqModalBody .mcq-option::after { content:''; position:absolute; inset:0; pointer-events:none; background:linear-gradient(110deg, transparent 20%, rgba(255,255,255,.22) 48%, transparent 72%); transform:translateX(-130%); transition:transform .45s ease; }
    #mcqModalBody .mcq-option:not(.disabled):hover { transform:translateY(-2px); box-shadow:0 7px 18px rgba(25,42,65,.09); border-color:rgba(0,119,181,.38); }
    #mcqModalBody .mcq-option:not(.disabled):hover::after { transform:translateX(130%); }
    #mcqModalBody .mcq-option:not(.disabled):active { transform:translateY(0) scale(.992); }
    #mcqModalBody .mcq-option:focus-visible { outline:3px solid rgba(0,119,181,.55); outline-offset:3px; }
    #mcqModalBody .mcq-option.correct { animation:medneoAnswerPop .38s ease-out, medneoRewardPulse .9s ease-out; border-color:rgba(28,151,101,.62) !important; background-color:rgba(33,150,105,.075); }
    #mcqModalBody .mcq-option.incorrect { animation:medneoSoftNudge .29s ease-out; border-color:rgba(214,43,43,.48) !important; background-color:rgba(214,43,43,.045); }
    #mcqModalBody .mcq-option.disabled { cursor:default; }
    #mcqModalBody .mcq-option.correct .mcq-option-marker { background:#218f66; color:#fff; transform:scale(1.04); transition:transform .2s ease, background .2s ease; }
    #mcqModalBody .mcq-explanation { transition:opacity .22s ease, transform .22s ease; }
    #mcqModalBody .mcq-explanation.show { animation:medneoFeedbackRise .3s cubic-bezier(.2,.7,.25,1) both; }
    #mcqModalBody .mcq-question-card.quiz-answer-correct { border-color:rgba(33,150,105,.56); box-shadow:0 8px 26px rgba(33,150,105,.075); }
    #mcqModalBody .mcq-question-card.quiz-answer-wrong { border-color:rgba(214,43,43,.36); }
    #mcqModalBody .quiz-feedback-line { display:flex; align-items:center; gap:9px; margin-top:12px; padding:10px 12px; border:1px solid rgba(33,150,105,.14); border-radius:12px; background:rgba(33,150,105,.055); font-size:.9rem; line-height:1.45; color:var(--color-text-secondary, #667085); animation:medneoFeedbackRise .28s ease-out both; }
    #mcqModalBody .quiz-feedback-line[hidden] { display:none !important; }
    #mcqModalBody .quiz-feedback-line .quiz-feedback-mark { display:inline-flex; align-items:center; justify-content:center; width:27px; height:27px; flex:0 0 27px; border-radius:50%; background:rgba(33,150,105,.13); color:#187c58; font-weight:800; }
    #mcqModalBody .quiz-feedback-line.is-wrong { background:rgba(0,119,181,.045); border-color:rgba(0,119,181,.16); }
    #mcqModalBody .quiz-feedback-line.is-wrong .quiz-feedback-mark { background:rgba(0,119,181,.11); color:#126b98; }
    .quiz-tools { display:flex; justify-content:flex-end; align-items:center; gap:8px; margin:0 0 10px; }
    .quiz-sound-btn { appearance:none; display:inline-flex; align-items:center; justify-content:center; gap:6px; border:1px solid var(--color-border, #dfe3e8); border-radius:999px; padding:8px 12px; min-height:36px; font:inherit; font-size:.79rem; font-weight:650; color:var(--color-text, #334155); background:var(--color-surface, #fff); cursor:pointer; transition:background .18s ease, border-color .18s ease, transform .18s ease, box-shadow .18s ease; }
    .quiz-sound-btn:hover { transform:translateY(-1px); border-color:var(--Alembic-red, #d62b2b); }
    .quiz-sound-btn:focus-visible { outline:3px solid rgba(0,119,181,.45); outline-offset:2px; }
    .quiz-sound-btn[aria-pressed="true"] { background:rgba(33,150,105,.075); border-color:rgba(33,150,105,.42); animation:medneoSoundPulse .65s ease-out 1; }
    #mcqModalBody .quiz-next-ready { animation:medneoFeedbackRise .23s ease-out both; box-shadow:0 5px 16px rgba(0,0,0,.06); }
    #mcqModalBody .progress-fill { transform-origin:left center; animation:medneoProgressGrow .55s cubic-bezier(.2,.75,.25,1) both; }
    #mcqModalBody .mcq-result .result-circle { animation:medneoScoreReveal .55s cubic-bezier(.2,.75,.25,1) both; }
    #mcqModalBody .result-stat { animation:medneoFeedbackRise .35s ease both; }
    #mcqModalBody .result-stat:nth-child(2) { animation-delay:.06s; }
    #mcqModalBody .result-stat:nth-child(3) { animation-delay:.12s; }
    .quiz-result-actions { margin-top:18px; }
    .slide-viewer .quiz-sound-btn, .slide-viewer .slide-btn { min-height:36px; }
    @media (prefers-reduced-motion: reduce) {
      #mcqModalBody .mcq-container, #mcqModalBody .mcq-option, #mcqModalBody .mcq-option.correct, #mcqModalBody .mcq-option.incorrect, #mcqModalBody .mcq-explanation.show, #mcqModalBody .quiz-feedback-line, #mcqModalBody .quiz-next-ready, #mcqModalBody .progress-fill, #mcqModalBody .mcq-result .result-circle, #mcqModalBody .result-stat { animation:none !important; }
      #mcqModalBody .mcq-option, #mcqModalBody .mcq-question-card, .quiz-sound-btn, #mcqModalBody .mcq-explanation { transition:none !important; }
      #mcqModalBody .mcq-option::after { display:none !important; }
    }
  `;
  document.head.appendChild(style);
}
function escapeModuleHTML(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}
function formatFileSize(bytes) {
  const size = Number(bytes) || 0;
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

document.addEventListener('DOMContentLoaded', async () => {
  ensureLearningInteractionStyles();
  currentUser = await authGuard('doctor');
  if (!currentUser) return;

  initUI();
  initNav(onSectionSwitch);
  initSidebarToggle();
  initLogout();

  // Module tabs
  document.querySelectorAll('.module-tab').forEach(tab => {
    const open = () => switchModule(tab.dataset.module);
    tab.addEventListener('click', open);
    tab.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); } });
  });

  // Render first section
  renderDashboard();
  renderModulesSection();
  schedulePdfJsWarmup();

  populateStates('pState');
  document.getElementById('pState')?.addEventListener('change', () => populateCities('pState', 'pCity'));
});

// ============================================================
// UI INIT
// ============================================================
function initUI() {
  const dateEl = document.getElementById('currentDate');
  if (dateEl) dateEl.textContent = formatDate();

  const welcomeEl = document.getElementById('welcomeName');
  if (welcomeEl) welcomeEl.textContent = `${getGreeting()}, ${currentUser.name.split(' ').slice(0,2).join(' ')}`;

  const initials = getInitials(currentUser.name);
  document.querySelectorAll('.user-avatar, #headerAvatar').forEach(el => el.textContent = initials);

  const nameEl = document.getElementById('sidebarUserName');
  if (nameEl) nameEl.textContent = currentUser.name;

  const specEl = document.getElementById('sidebarUserSpec');
  if (specEl) specEl.textContent = currentUser.specialization;

  // Fill profile
  const profileFields = {
    pName: currentUser.name,
    pEmail: currentUser.email,
    pPhone: currentUser.phone,
    pDegree: currentUser.degree,
    pSpec: currentUser.specialization,
    pHospital: currentUser.hospital,
    pRegistrationNumber: currentUser.registration_number,
    pExperience: currentUser.experience
  };
  Object.entries(profileFields).forEach(([id, value]) => {
    const field = document.getElementById(id);
    if (field) field.value = value || '';
  });
  const pState = document.getElementById('pState');
  const pCity = document.getElementById('pCity');
  if (pState && currentUser.state) { pState.value = currentUser.state; populateCities('pState', 'pCity'); }
  if (pCity && currentUser.city) pCity.value = currentUser.city;
}

// ============================================================
// SECTION SWITCH
// ============================================================
function onSectionSwitch(section) {
  if (section === 'dashboard') renderDashboard();
  if (section === 'modules')   renderModulesSection();
  if (section === 'progress')  renderProgress();
  trackEvent('section_view', { payload: { section } });
}

// ============================================================
// DASHBOARD
// ============================================================
function renderDashboard() {
  // Stat counters
  const publishedModules = (DB.modules || []).filter((module) => module.status === 'active');
  animateCounter(document.getElementById('statModules'), publishedModules.length);
  animateCounter(document.getElementById('statCompleted'), currentUser.completedModules.length);
  animateCounter(document.getElementById('statScore'), currentUser.score);
  animateCounter(document.getElementById('statStreak'), currentUser.streak);

  // Recent activity
  const recentEl = document.getElementById('recentActivity');
  if (!recentEl) return;
  const recentModules = (DB.modules || []).filter((module) => module.status === 'active');
  const recentItems = recentModules.flatMap((module) => (module.contents || []).map((item) => ({ ...item, moduleId: module.id, moduleTitle: module.title }))).slice(0, 6);
  const presentationItems = recentModules.flatMap((module) => (module.presentations || []).map((file) => ({ id: file.id, type: 'presentation_file', title: file.filename, moduleId: module.id, moduleTitle: module.title, file }))).slice(0, 6);
  const items = [...recentItems, ...presentationItems].slice(0, 6);
  if (!items.length) {
    recentEl.innerHTML = '<div class="analytics-empty">No learning resources have been uploaded yet. Your programme administrator can upload the module presentations from the admin dashboard.</div>';
    return;
  }

  recentEl.innerHTML = items.map(item => {
    const done = item.type === 'slide_deck' && currentUser.completedModules.includes('m1');
    const icons = { slide_deck: '🖥️', article: '📄', mcq: '📝' };
    const labels = { slide_deck: 'Slide Deck', article: 'Article', mcq: 'Assessment' };
    return `
      <div class="recent-item" onclick="${item.type === 'presentation_file' ? `openPresentationFile('${String(item.id).replace(/[^a-zA-Z0-9_-]/g, '')}','${String(item.moduleId).replace(/[^a-zA-Z0-9_-]/g, '')}')` : `openContent('${item.id}', '${item.type}')`}">
        <div class="recent-item-icon">${icons[item.type] || (item.type === 'presentation_file' ? '📊' : '📚')}</div>
        <div class="recent-item-body">
          <div class="recent-item-title">${escapeModuleHTML(item.title)}</div>
          <div class="recent-item-meta">${escapeModuleHTML(item.moduleTitle)} · ${item.type === 'presentation_file' ? 'Presentation' : (labels[item.type] || 'Resource')}</div>
        </div>
        <span class="badge ${done ? 'badge-active' : 'badge-muted'}">${done ? 'Done' : 'Open'}</span>
      </div>
    `;
  }).join('');
}

// ============================================================
// MODULES SECTION
// ============================================================
function renderModulesSection() {
  renderModuleContent(activeModuleId);
}

function switchModule(moduleId) {
  const mod = DB.modules.find(m => m.id === moduleId);
  if (!mod || mod.status !== 'active') return;

  activeModuleId = moduleId;
  trackEvent('module_open', { contentType: 'module', contentId: moduleId, moduleId, payload: { title: mod.title } });

  document.querySelectorAll('.module-tab').forEach(t => t.classList.remove('active'));
  document.querySelector(`.module-tab[data-module="${moduleId}"]`)?.classList.add('active');

  renderModuleContent(moduleId);
}

function renderModuleContent(moduleId) {
  const mod = DB.modules.find(m => m.id === moduleId);
  if (!mod) return;

  const container = document.getElementById('moduleContentArea');
  if (!container) return;

  // Hero
  const moduleContents = Array.isArray(mod.contents) ? mod.contents : [];
  const presentations = Array.isArray(mod.presentations) ? mod.presentations : [];
  const progress = calcModuleProgress(mod);
  const firstResource = moduleContents[0];
  const firstPresentation = presentations[0];
  const continueButton = firstResource
    ? `<button class="btn btn-primary" onclick="openContent('${firstResource.id}', '${firstResource.type}')">▶ Continue Learning</button>`
    : firstPresentation
      ? `<button class="btn btn-primary" onclick="openPresentationFile('${String(firstPresentation.id).replace(/[^a-zA-Z0-9_-]/g, '')}','${String(mod.id).replace(/[^a-zA-Z0-9_-]/g, '')}')">▶ Open presentation</button>`
      : `<button class="btn btn-primary" disabled title="Presentation pending upload">Presentation pending upload</button>`;

  container.innerHTML = `
    <div class="module-hero animate-fade">
      <div class="module-hero-inner">
        <div>
          <div class="module-hero-tag">
            <span>●</span> ${mod.tag}
          </div>
          <h1 class="module-hero-title">${mod.title}</h1>
          <p class="module-hero-subtitle">${mod.subtitle}</p>
          <div class="module-hero-meta">
            <div class="hero-meta-item">
              <span class="hero-meta-value">${mod.duration}</span>
              <span class="hero-meta-label">Minutes</span>
            </div>
            <div class="hero-meta-item">
              <span class="hero-meta-value">${moduleContents.length + presentations.length}</span>
              <span class="hero-meta-label">Resources</span>
            </div>
            <div class="hero-meta-item">
              <span class="hero-meta-value">${Number.isFinite(Number(mod.cmeCredits)) ? escapeModuleHTML(mod.cmeCredits) : '—'}</span>
              <span class="hero-meta-label">CME Credits</span>
            </div>
          </div>
          <div class="module-hero-progress">
            <div class="hero-progress-label">
              <span>Module Progress</span>
              <span>${progress}%</span>
            </div>
            <div class="progress-bar">
              <div class="progress-fill" style="width:${progress}%"></div>
            </div>
          </div>
          <div style="display:flex;gap:var(--space-sm)">
            ${continueButton}
          </div>
        </div>
        <div class="module-hero-illustration">
          <div class="hero-illustration-circle">${mod.icon}</div>
        </div>
      </div>
    </div>

    <h2 style="font-family:var(--font-display);font-size:1.25rem;font-weight:700;color:var(--text-primary);margin-bottom:var(--space-lg)">
      Module Resources
    </h2>

    <div class="content-grid stagger-children" id="contentGrid">
      ${moduleContents.map(item => renderContentCard(item)).join('')}
      ${presentations.map(file => `<div class="content-card presentation-content-card" role="group"><div class="content-card-top type-slide"><div class="content-card-type-label">📊 Module presentation</div><div class="content-card-main-icon">📁</div><div class="content-card-top-icon">↗</div></div><div class="content-card-body"><h3 class="content-card-title">${escapeModuleHTML(file.filename)}</h3><div class="content-card-meta"><span>${escapeModuleHTML(file.mimeType || 'Presentation')} · ${formatFileSize(file.size)}</span></div><div class="content-card-footer"><button type="button" class="content-card-action presentation-open-button" onclick="openPresentationFile('${String(file.id).replace(/[^a-zA-Z0-9_-]/g, '')}','${String(mod.id).replace(/[^a-zA-Z0-9_-]/g, '')}')">Open in full-screen viewer →</button></div></div></div>`).join('')}
      ${!moduleContents.length && !presentations.length ? '<div class="analytics-empty">This module is published, but its source presentation has not been uploaded yet. The administrator can add the PPT/PPTX/PDF from Admin → Content Modules. No learning content has been fabricated.</div>' : ''}
    </div>
  `;
}

function calcModuleProgress(mod) {
  if (!mod.contents.length) return 0;
  // Simple: if slide deck is "completed" for m1
  const done = mod.id === 'm1' && currentUser.completedModules.includes('m1') ? 1 : 0;
  return Math.round((done / mod.contents.length) * 100);
}

function renderContentCard(item) {
  const typeConfig = {
    slide_deck: { label: '🖥 Slide Deck', color: 'type-slide', icon: '🎞️', meta: `${item.slides} slides · ${item.duration} min` },
    article:    { label: '📄 Article',    color: 'type-article', icon: '📖', meta: item.readTime },
    mcq:        { label: '📝 Assessment', color: 'type-mcq',    icon: '✏️',  meta: `${item.questions} questions` }
  };
  const cfg = typeConfig[item.type] || { label: 'Resource', color: '', icon: '📚', meta: '' };

  return `
    <div class="content-card" onclick="openContent('${item.id}', '${item.type}')">
      <div class="content-card-top ${cfg.color}">
        <div class="content-card-type-label">${cfg.label}</div>
        <div class="content-card-main-icon">${item.type === 'slide_deck' ? '🖥️' : item.type === 'article' ? '📰' : '📝'}</div>
        <div class="content-card-top-icon">${cfg.icon}</div>
      </div>
      <div class="content-card-body">
        <h3 class="content-card-title">${item.title}</h3>
        <div class="content-card-meta">
          <span>⏱ ${cfg.meta}</span>
        </div>
        <div class="content-card-footer">
          <span class="content-card-action">Open →</span>
          <div class="content-card-arrow">→</div>
        </div>
      </div>
    </div>
  `;
}

// ============================================================
// OPEN CONTENT
// ============================================================
function openContent(id, type) {
  if (!id || !type) return;
  const parentModule = (DB.modules || []).find((module) => (module.contents || []).some((item) => item.id === id));
  trackEvent('content_click', { contentType: type, contentId: id, moduleId: parentModule?.id || activeModuleId, payload: { title: (DB.articles?.[id] || DB.slideDecks?.[id] || DB.quizzes?.[id] || {}).title || id } });
  if (type === 'slide_deck') openSlideDeck(id);
  else if (type === 'article') openArticle(id);
  else if (type === 'mcq')    openMCQ(id);
}

// ============================================================
// SLIDE DECK VIEWER
// ============================================================
function openSlideDeck(id) {
  const deck = DB.slideDecks[id];
  if (!deck) return;
  currentSlide = 0;
  window._currentDeckId = id;

  const overlay = document.getElementById('slideModal');
  const body    = document.getElementById('slideModalBody');
  if (!overlay || !body) return;

  document.getElementById('slideModalTitle').textContent = deck.title;
  renderSlide(body, deck, currentSlide);
  openModal('slideModal');
}

function renderSlide(body, deck, index) {
  const slide = deck.slides[index];
  if (!slide) return;

  let visualHTML = '';
  if (slide.stats) {
    visualHTML = `<div class="slide-visual"><div class="slide-stats">${
      slide.stats.map(s => `<div class="slide-stat"><div class="slide-stat-value">${s.value}</div><div class="slide-stat-label">${s.label}</div></div>`).join('')
    }</div></div>`;
  } else if (slide.highlights) {
    visualHTML = `<div class="slide-visual"><div class="slide-highlights">${
      slide.highlights.map(h => `<div class="slide-highlight-chip">${h}</div>`).join('')
    }</div></div>`;
  } else if (slide.points) {
    visualHTML = `<div class="slide-visual"><div class="abcde-grid">${
      slide.points.map(p => `
        <div class="abcde-item">
          <div class="abcde-letter">${p.letter}</div>
          <div class="abcde-term">${p.term}</div>
          <div class="abcde-desc">${p.desc}</div>
        </div>
      `).join('')
    }</div></div>`;
  } else if (slide.primary) {
    visualHTML = `<div class="slide-visual"><div class="class-grid">
      <div>
        <div class="class-section-title">Primary Lesions</div>
        <div class="class-tags">${slide.primary.map(t => `<div class="class-tag">${t}</div>`).join('')}</div>
      </div>
      <div>
        <div class="class-section-title">Secondary Lesions</div>
        <div class="class-tags">${slide.secondary.map(t => `<div class="class-tag">${t}</div>`).join('')}</div>
      </div>
    </div></div>`;
  } else if (slide.conditions) {
    visualHTML = `<div class="slide-visual"><div class="conditions-list">${
      slide.conditions.map(c => `
        <div class="condition-item">
          <div class="condition-dot"></div>
          <div>
            <div class="condition-name">${c.name}</div>
            <div class="condition-pct">${c.prevalence} · ${c.type}</div>
          </div>
        </div>
      `).join('')
    }</div></div>`;
  } else if (slide.vehicles) {
    visualHTML = `<div class="slide-visual"><div class="therapy-grid">${
      slide.vehicles.map(v => `
        <div class="therapy-item">
          <div class="therapy-type">${v.type}</div>
          <div class="therapy-use">${v.use}</div>
          <div class="therapy-potency">${v.potency}</div>
        </div>
      `).join('')
    }</div></div>`;
  } else if (slide.categories) {
    visualHTML = `<div class="slide-visual"><div class="portfolio-tags">${
      slide.categories.map(c => `<div class="portfolio-tag">${c}</div>`).join('')
    }</div></div>`;
  } else if (slide.takeaways) {
    visualHTML = `<div class="slide-visual"><div class="takeaway-list">${
      slide.takeaways.map(t => `<div class="takeaway-item"><span class="takeaway-check">✓</span><span>${t}</span></div>`).join('')
    }</div></div>`;
  }

  body.innerHTML = `
    <div class="slide-viewer">
      <div class="slide-viewer-header">
        <div class="slide-viewer-title">${deck.title}</div>
        <div class="slide-viewer-actions">
          <button class="slide-btn" title="Read this slide aloud" onclick="readCurrentSlideAloud()">🔊 Listen</button>
          <button class="quiz-sound-btn" data-sound-toggle aria-pressed="false" onclick="toggleSoundEffects()">♪ Sound: Off</button>
          <button class="slide-btn" data-night-toggle title="Toggle reading mode" onclick="toggleReaderNightMode()">☾ Night mode</button>
          <button class="slide-btn" title="Expand" onclick="expandSlideView()">⛶</button>
        </div>
      </div>
      <div class="slide-area" id="slideArea">
        <div class="slide-progress-meta"><div class="slide-number">Slide ${index + 1} of ${deck.slides.length}</div><span>${Math.round(((index + 1) / deck.slides.length) * 100)}% explored</span></div>
        <div class="slide-reading-progress"><span style="width:${Math.round(((index + 1) / deck.slides.length) * 100)}%"></span></div>
        <h2 class="slide-title" style="animation:slideUp 0.3s ease">${slide.title}</h2>
        <p class="slide-content" style="animation:slideUp 0.3s ease 0.05s both">${slide.content}</p>
        ${visualHTML}
      </div>
      <div class="slide-footer">
        <div class="slide-dots">
          ${deck.slides.map((_, i) => `
            <div class="slide-dot ${i === index ? 'active' : ''}" onclick="goToSlide(${i})"></div>
          `).join('')}
        </div>
        <div class="slide-nav-btns">
          <button class="slide-btn" onclick="prevSlide()" ${index === 0 ? 'disabled' : ''}>← Prev</button>
          ${index === deck.slides.length - 1 ? '<button class="slide-btn slide-finish-btn" onclick="completeCurrentSlideDeck()">✓ Mark as read</button>' : '<button class="slide-btn slide-next-btn" onclick="nextSlide()">Next →</button>'}
        </div>
      </div>
    </div>
  `;

  // Store deck ref globally for navigation.
  window._currentDeck = deck;
  window._currentDeckBodyEl = body;
  body.querySelectorAll('[data-night-toggle]').forEach((button) => { button.textContent = readerNightMode ? '☀ Light mode' : '☾ Night mode'; button.setAttribute('aria-pressed', String(readerNightMode)); });
  syncSoundToggleButtons();
  trackEvent('slide_view', { contentType: 'slide_deck', contentId: window._currentDeckId || deck.id || deck.title, moduleId: activeModuleId, payload: { title: deck.title, slideNumber: index + 1, totalSlides: deck.slides.length, progressPercent: Math.round(((index + 1) / deck.slides.length) * 100) } });
}

function prevSlide() {
  if (currentSlide > 0) {
    currentSlide--;
    renderSlide(window._currentDeckBodyEl, window._currentDeck, currentSlide);
  }
}

function nextSlide() {
  if (window._currentDeck && currentSlide < window._currentDeck.slides.length - 1) {
    currentSlide++;
    renderSlide(window._currentDeckBodyEl, window._currentDeck, currentSlide);
  }
}

function goToSlide(i) {
  currentSlide = i;
  renderSlide(window._currentDeckBodyEl, window._currentDeck, currentSlide);
}

function expandSlideView() {
  const modal = document.getElementById('slideModal');
  const inner = modal?.querySelector('.modal');
  if (!inner) return;
  if (inner.requestFullscreen) inner.requestFullscreen().catch(() => inner.classList.toggle('modal-fullscreen'));
  else inner.classList.toggle('modal-fullscreen');
}
function completeCurrentSlideDeck() {
  const deck = window._currentDeck;
  if (!deck) return;
  trackEvent('slide_complete', { contentType: 'slide_deck', contentId: window._currentDeckId || deck.id || deck.title, moduleId: activeModuleId, payload: { title: deck.title, totalSlides: deck.slides.length, progressPercent: 100 } });
  playLearningTone('success');
  showToast('Deck completed — great progress!', 'success', 3500);
}

function toggleReaderNightMode() {
  readerNightMode = !readerNightMode;
  document.querySelectorAll('#slideModal .modal, #articleModal .modal, #mcqModal .modal, #presentationModal .modal').forEach((modal) => modal.classList.toggle('reader-night-mode', readerNightMode));
  document.querySelectorAll('[data-night-toggle]').forEach((button) => { button.textContent = readerNightMode ? '☀ Light mode' : '☾ Night mode'; button.setAttribute('aria-pressed', String(readerNightMode)); });
  showToast(readerNightMode ? 'Comfort reading mode on' : 'Standard reading mode on', 'info', 1600);
}

function syncSoundToggleButtons() {
  document.querySelectorAll('[data-sound-toggle]').forEach((button) => {
    button.textContent = readerSoundEnabled ? '♪ Sound: On' : '♪ Sound: Off';
    button.setAttribute('aria-pressed', String(readerSoundEnabled));
    button.setAttribute('aria-label', readerSoundEnabled ? 'Mute learning sounds' : 'Enable learning sounds and play a test sound');
  });
}

function ensureReaderAudioContext() {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) throw new Error('Audio playback is not supported by this browser.');
  if (!readerAudioContext || readerAudioContext.state === 'closed') {
    readerAudioContext = new AudioCtx({ latencyHint: 'interactive' });
    readerAudioMasterGain = readerAudioContext.createGain();
    readerAudioMasterGain.gain.value = 0.78;
    readerAudioCompressor = readerAudioContext.createDynamicsCompressor();
    readerAudioCompressor.threshold.value = -14;
    readerAudioCompressor.knee.value = 18;
    readerAudioCompressor.ratio.value = 3;
    readerAudioCompressor.attack.value = 0.004;
    readerAudioCompressor.release.value = 0.13;
    readerAudioMasterGain.connect(readerAudioCompressor);
    readerAudioCompressor.connect(readerAudioContext.destination);
  }
  return readerAudioContext;
}

async function toggleSoundEffects() {
  if (readerSoundEnabled) {
    readerSoundEnabled = false;
    syncSoundToggleButtons();
    showToast('Learning sounds muted', 'info', 1500);
    return;
  }

  // Create/resume audio directly from the user's button click to satisfy browser autoplay rules.
  try {
    const context = ensureReaderAudioContext();
    const resumeTask = context.state === 'running' ? Promise.resolve() : context.resume();
    await resumeTask;
    if (context.state !== 'running') throw new Error('The browser has blocked audio. Check tab mute and device volume.');
    readerSoundEnabled = true;
    syncSoundToggleButtons();
    const played = await playLearningTone('test', true);
    if (!played) throw new Error('The audio test could not play. Check the browser tab and device volume.');
    showToast('Sound is on · test chime played', 'success', 2400);
  } catch (error) {
    readerSoundEnabled = false;
    syncSoundToggleButtons();
    showToast(error.message || 'Sound could not start. Check browser permissions and device volume.', 'error', 3500);
  }
}

async function playLearningTone(kind = 'success', force = false) {
  if (!readerSoundEnabled && !force) return false;
  try {
    const context = ensureReaderAudioContext();
    if (context.state !== 'running') await context.resume();
    if (context.state !== 'running') return false;

    const presets = {
      tap:       { notes: [740], interval: 0, duration: 0.065, level: 0.055, wave: 'sine', overtone: false },
      success:   { notes: [523.25, 659.25, 783.99], interval: 0.085, duration: 0.205, level: 0.155, wave: 'sine', overtone: true },
      wrong:     { notes: [392, 329.63], interval: 0.085, duration: 0.165, level: 0.105, wave: 'triangle', overtone: false },
      next:      { notes: [587.33, 783.99], interval: 0.075, duration: 0.14, level: 0.105, wave: 'sine', overtone: false },
      test:      { notes: [659.25, 783.99, 987.77], interval: 0.095, duration: 0.22, level: 0.17, wave: 'sine', overtone: true },
      milestone: { notes: [659.25, 783.99, 987.77], interval: 0.09, duration: 0.21, level: 0.14, wave: 'sine', overtone: true },
      complete:  { notes: [523.25, 659.25, 783.99, 1046.5], interval: 0.085, duration: 0.235, level: 0.145, wave: 'sine', overtone: true }
    };
    const preset = presets[kind] || presets.success;
    const baseTime = context.currentTime + 0.012;

    preset.notes.forEach((frequency, index) => {
      const startAt = baseTime + index * preset.interval;
      const endAt = startAt + preset.duration;
      const oscillator = context.createOscillator();
      const envelope = context.createGain();
      const toneFilter = context.createBiquadFilter();
      toneFilter.type = 'lowpass';
      toneFilter.frequency.setValueAtTime(kind === 'wrong' ? 1900 : 2800, startAt);
      toneFilter.Q.value = 0.55;
      oscillator.type = preset.wave;
      oscillator.frequency.setValueAtTime(frequency, startAt);
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(40, frequency * 0.997), endAt);
      envelope.gain.setValueAtTime(0.0001, startAt);
      envelope.gain.exponentialRampToValueAtTime(preset.level, startAt + 0.014);
      envelope.gain.exponentialRampToValueAtTime(Math.max(0.0001, preset.level * 0.34), startAt + preset.duration * 0.42);
      envelope.gain.exponentialRampToValueAtTime(0.0001, endAt);
      oscillator.connect(toneFilter);
      toneFilter.connect(envelope);
      envelope.connect(readerAudioMasterGain || context.destination);
      oscillator.onended = () => {
        try { oscillator.disconnect(); toneFilter.disconnect(); envelope.disconnect(); } catch {}
      };
      oscillator.start(startAt);
      oscillator.stop(endAt + 0.008);

      // A quiet octave harmonic gives success sounds a soft bell quality without becoming loud.
      if (preset.overtone) {
        const harmonic = context.createOscillator();
        const harmonicGain = context.createGain();
        harmonic.type = 'sine';
        harmonic.frequency.setValueAtTime(frequency * 2, startAt);
        harmonicGain.gain.setValueAtTime(0.0001, startAt);
        harmonicGain.gain.exponentialRampToValueAtTime(preset.level * 0.13, startAt + 0.018);
        harmonicGain.gain.exponentialRampToValueAtTime(0.0001, endAt * 1); // short, tapered harmonic tail
        harmonic.connect(harmonicGain);
        harmonicGain.connect(readerAudioMasterGain || context.destination);
        harmonic.onended = () => { try { harmonic.disconnect(); harmonicGain.disconnect(); } catch {} };
        harmonic.start(startAt);
        harmonic.stop(endAt + 0.008);
      }
    });
    return true;
  } catch (error) {
    console.warn('[MedNeo audio]', error?.message || error);
    return false;
  }
}
function speakText(text) {
  if (!('speechSynthesis' in window) || !String(text || '').trim()) {
    showToast('Read-aloud is not available in this browser.', 'info'); return;
  }
  window.speechSynthesis.cancel();
  readerSpeech = new SpeechSynthesisUtterance(String(text).slice(0, 12000));
  readerSpeech.rate = 0.96; readerSpeech.pitch = 1; readerSpeech.lang = 'en-IN';
  window.speechSynthesis.speak(readerSpeech);
}
function readCurrentSlideAloud() {
  const slide = window._currentDeck?.slides?.[currentSlide];
  if (slide) speakText([slide.title, slide.content, ...(slide.takeaways || [])].filter(Boolean).join('. '));
}
function readArticleAloud() {
  const articleBody = document.getElementById('articleBody');
  if (articleBody) speakText(articleBody.innerText || articleBody.textContent);
}
function stopReaderNarration() {
  try { if ('speechSynthesis' in window) window.speechSynthesis.cancel(); } catch {}
  readerSpeech = null;
}
window.stopReaderNarration = stopReaderNarration;

// PDFs use the browser's built-in PDF viewer. Modern PPTX files render inside MedNeo
// on a canvas; no Microsoft Office embed or external PowerPoint page is opened.
const NATIVE_PPTX_RENDERER_URL = 'https://esm.sh/pptx-browser@4.1.5?bundle';
function loadNativePptxRenderer() {
  if (!nativePptxImportPromise) {
    nativePptxImportPromise = import(NATIVE_PPTX_RENDERER_URL).then((module) => {
      if (typeof module.PptxRenderer !== 'function') throw new Error('The in-app PowerPoint renderer did not load correctly.');
      return module.PptxRenderer;
    }).catch((error) => {
      nativePptxImportPromise = null;
      throw new Error('Could not load the in-app slide renderer. Check your internet connection, then try again.');
    });
  }
  return nativePptxImportPromise;
}
function scheduleNativePptxWarmup() {
  // Load the renderer after the dashboard becomes interactive, not when the
  // doctor clicks a presentation. This removes the cold CDN import from the
  // critical path of opening the first PPTX.
  const warm = () => { loadNativePptxRenderer().catch(() => {}); };
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(warm, { timeout: 1800 });
  } else {
    window.setTimeout(warm, 1100);
  }
}

function schedulePdfJsWarmup() {
  // Warm the PDF renderer only when this account has a PDF upload, after the
  // dashboard is interactive so it does not delay sign-in or first paint.
  const hasPdf = (DB.modules || []).some((module) => (module.presentations || []).some((file) =>
    String(file.filename || '').toLowerCase().endsWith('.pdf') || String(file.mimeType || '').toLowerCase().includes('pdf')
  ));
  if (!hasPdf) return;
  const warm = () => { loadPdfJs().catch(() => {}); };
  if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(warm, { timeout: 2600 });
  else window.setTimeout(warm, 1700);
}
function cacheNativePptxBuffer(key, buffer) {
  if (!(buffer instanceof ArrayBuffer) || !key || buffer.byteLength < 1 || buffer.byteLength > NATIVE_PPTX_CACHE_ITEM_LIMIT) return;
  const copy = buffer.slice(0);
  if (nativePptxBufferCache.has(key)) {
    nativePptxBufferCacheBytes -= nativePptxBufferCache.get(key).byteLength;
    nativePptxBufferCache.delete(key);
  }
  while (nativePptxBufferCache.size && nativePptxBufferCacheBytes + copy.byteLength > NATIVE_PPTX_CACHE_TOTAL_LIMIT) {
    const oldestKey = nativePptxBufferCache.keys().next().value;
    nativePptxBufferCacheBytes -= nativePptxBufferCache.get(oldestKey).byteLength;
    nativePptxBufferCache.delete(oldestKey);
  }
  nativePptxBufferCache.set(key, copy);
  nativePptxBufferCacheBytes += copy.byteLength;
}
async function readPptxBuffer(response, meta, cacheKey) {
  if (!response.body?.getReader) {
    const buffer = await response.arrayBuffer();
    cacheNativePptxBuffer(cacheKey, buffer);
    return buffer;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let received = 0;
  const expected = Number(response.headers.get('content-length')) || Number(meta.size) || 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.byteLength;
    setNativePptxStatus(
      expected
        ? `Downloading presentation… ${Math.min(99, Math.round(received / expected * 100))}%`
        : `Downloading presentation… ${formatFileSize(received)}`,
      expected ? Math.min(.55, .06 + received / expected * .49) : .25
    );
  }
  // Blob aggregation avoids an additional manual chunk-by-chunk copy into a
  // second Uint8Array, which was expensive for large decks on slower devices.
  const buffer = await new Blob(chunks, { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' }).arrayBuffer();
  cacheNativePptxBuffer(cacheKey, buffer);
  return buffer;
}

function destroyNativePptxViewer() {
  nativePptxRenderSerial++;
  if (nativePptxRenderer) {
    try { nativePptxRenderer.destroy(); } catch {}
  }
  nativePptxRenderer = null;
  nativePptxSlideIndex = 0;
  nativePptxSlideCount = 0;
  const shell = document.getElementById('pptxNativeViewer');
  if (shell) shell.remove();
  const frame = document.getElementById('presentationFrame');
  if (frame) frame.style.display = '';
}
function ensureNativePptxStyles() {
  if (document.getElementById('medneoNativePptxStyles')) return;
  const style = document.createElement('style');
  style.id = 'medneoNativePptxStyles';
  style.textContent = `
    #pptxNativeViewer{position:absolute;inset:0;display:flex;flex-direction:column;background:#10151d;color:#f3f5f8;min-height:0;overflow:hidden;font-family:Inter,Arial,sans-serif}
    #pptxNativeViewer .npv-top{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 14px;background:#19212c;border-bottom:1px solid #313a46;flex-wrap:wrap}
    #pptxNativeViewer .npv-status{font-size:12px;color:#c5cfdb}
    #pptxNativeViewer .npv-controls{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
    #pptxNativeViewer button{border:1px solid #566170;border-radius:8px;padding:7px 11px;background:#263242;color:#fff;font:600 12px/1.2 Inter,Arial,sans-serif;cursor:pointer}
    #pptxNativeViewer button:hover:not(:disabled){background:#35465b}
    #pptxNativeViewer button:disabled{opacity:.4;cursor:not-allowed}
    #pptxNativeViewer .npv-page{font-size:12px;min-width:84px;text-align:center;color:#e4eaf1;font-variant-numeric:tabular-nums}
    #pptxNativeViewer .npv-viewport{flex:1;min-height:0;overflow:auto;display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box}
    #pptxNativeViewer .npv-canvas{display:block;max-width:100%;height:auto;max-height:100%;object-fit:contain;background:#fff;box-shadow:0 10px 32px rgba(0,0,0,.35)}
    #pptxNativeViewer .npv-message{max-width:560px;text-align:center;line-height:1.6;color:#e6ebf2;padding:28px}
    #pptxNativeViewer .npv-message h3{margin:0 0 8px;font-size:18px;color:#fff}
    #pptxNativeViewer .npv-message p{margin:0 0 14px;color:#c1cad6;font-size:13px}
    #pptxNativeViewer .npv-progress{height:3px;background:#273241;flex:0 0 auto}
    #pptxNativePptxProgressBar{height:100%;width:0;background:#d72d37;transition:width .16s ease}
    #presentationFrameWrap{position:relative}
    @media(max-width:640px){#pptxNativeViewer .npv-top{align-items:flex-start}#pptxNativeViewer .npv-viewport{padding:6px}#pptxNativeViewer .npv-canvas{max-height:none}#pptxNativeViewer .npv-controls{gap:5px}}
  `;
  document.head.appendChild(style);
}
function makeNativePptxShell(frameWrap) {
  destroyNativePptxViewer();
  ensureNativePptxStyles();
  const frame = document.getElementById('presentationFrame');
  if (frame) frame.style.display = 'none';
  const shell = document.createElement('section');
  shell.id = 'pptxNativeViewer';
  shell.setAttribute('aria-label', 'In-app PowerPoint reader');
  shell.innerHTML = `
    <div class="npv-progress" aria-hidden="true"><div id="pptxNativePptxProgressBar"></div></div>
    <div class="npv-top">
      <span class="npv-status" id="pptxNativePptxStatus" role="status" aria-live="polite">Preparing slides…</span>
      <div class="npv-controls">
        <button type="button" id="pptxNativePrev" disabled>← Previous</button>
        <span class="npv-page" id="pptxNativePage">Loading…</span>
        <button type="button" id="pptxNativeNext" disabled>Next →</button>
      </div>
    </div>
    <div class="npv-viewport" id="pptxNativeViewport" tabindex="0" aria-label="Presentation slides. Use left and right arrow keys to navigate.">
      <canvas class="npv-canvas" id="pptxNativeCanvas" aria-label="Current presentation slide"></canvas>
    </div>`;
  frameWrap.appendChild(shell);
  const prev = shell.querySelector('#pptxNativePrev');
  const next = shell.querySelector('#pptxNativeNext');
  prev.addEventListener('click', () => renderNativePptxSlide(nativePptxSlideIndex - 1));
  next.addEventListener('click', () => renderNativePptxSlide(nativePptxSlideIndex + 1));
  shell.querySelector('#pptxNativeViewport').addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft') { event.preventDefault(); renderNativePptxSlide(nativePptxSlideIndex - 1); }
    if (event.key === 'ArrowRight') { event.preventDefault(); renderNativePptxSlide(nativePptxSlideIndex + 1); }
  });
  return shell;
}
function setNativePptxStatus(message, progress) {
  const status = document.getElementById('pptxNativePptxStatus');
  if (status) status.textContent = message;
  const bar = document.getElementById('pptxNativePptxProgressBar');
  if (bar && Number.isFinite(progress)) bar.style.width = `${Math.max(0, Math.min(100, progress * 100))}%`;
}
async function renderNativePptxSlide(index) {
  if (!nativePptxRenderer || !nativePptxSlideCount) return;
  const target = Math.max(0, Math.min(nativePptxSlideCount - 1, Number(index) || 0));
  if (target === nativePptxSlideIndex && document.getElementById('pptxNativePage')?.textContent !== 'Loading…') return;
  nativePptxSlideIndex = target;
  const serial = ++nativePptxRenderSerial;
  const canvas = document.getElementById('pptxNativeCanvas');
  const page = document.getElementById('pptxNativePage');
  const prev = document.getElementById('pptxNativePrev');
  const next = document.getElementById('pptxNativeNext');
  const viewport = document.getElementById('pptxNativeViewport');
  if (!canvas || !viewport) return;
  if (page) page.textContent = `Slide ${target + 1} / ${nativePptxSlideCount}`;
  if (prev) prev.disabled = target === 0;
  if (next) next.disabled = target >= nativePptxSlideCount - 1;
  setNativePptxStatus(`Rendering slide ${target + 1}…`, target / nativePptxSlideCount);
  try {
    const width = Math.max(640, Math.min(1366, (viewport.clientWidth || window.innerWidth) - 32));
    await nativePptxRenderer.renderSlide(target, canvas, width);
    if (serial !== nativePptxRenderSerial) return;
    canvas.style.width = `${Math.min(width, (viewport.clientWidth || width) - 12)}px`;
    setNativePptxStatus('In-app reader · Your presentation stays in this page.', (target + 1) / nativePptxSlideCount);
    viewport.scrollTop = 0;
    if (presentationReadSession) {
      presentationReadSession.currentSlide = target + 1;
      presentationReadSession.slideCount = nativePptxSlideCount;
      presentationReadSession.viewerType = 'native-pptx';
      if (!presentationReadSession.slidesViewed) presentationReadSession.slidesViewed = new Set();
      const isNewView = !presentationReadSession.slidesViewed.has(target + 1);
      presentationReadSession.slidesViewed.add(target + 1);
      if (isNewView) trackEvent('presentation_slide_view', { contentType: 'presentation', contentId: presentationReadSession.fileId, moduleId: presentationReadSession.moduleId, payload: { filename: presentationReadSession.filename, slideNumber: target + 1, slideCount: nativePptxSlideCount, viewer: 'native-pptx' } });
      const progress = document.getElementById('presentationReadProgress');
      if (progress) progress.textContent = `Slide ${target + 1} of ${nativePptxSlideCount} · ${presentationReadSession.slidesViewed.size} slides viewed · reading time saves automatically.`;
    }
    playLearningTone('tap');
  } catch (error) {
    setNativePptxStatus('This slide could not be rendered. Try downloading the original presentation.', 0);
    showToast(error?.message || 'Could not render this slide.', 'error', 4000);
  }
}
async function openNativePptx(url, meta, frameWrap) {
  const shell = makeNativePptxShell(frameWrap);
  const filename = String(meta.filename || 'presentation.pptx');
  const safeUrl = String(url || '');
  const cacheKey = `${presentationReadSession?.fileId || filename}:${Number(meta.size) || 0}`;
  try {
    setNativePptxStatus('Preparing the in-app reader…', 0.02);
    // The library is warmed in the background after dashboard render. On a
    // repeat open, reuse a small in-memory byte cache (never localStorage).
    const cachedBuffer = nativePptxBufferCache.get(cacheKey);
    const rendererPromise = loadNativePptxRenderer();
    const responsePromise = cachedBuffer
      ? Promise.resolve(null)
      : fetch(safeUrl, { method: 'GET', mode: 'cors', credentials: 'omit', cache: 'default' });
    const [Renderer, response] = await Promise.all([rendererPromise, responsePromise]);
    let buffer = cachedBuffer || null;
    if (buffer) {
      setNativePptxStatus('Using the cached presentation…', 0.18);
    } else {
      setNativePptxStatus('Connecting to secure storage…', 0.04);
      if (!response?.ok) throw new Error(`Could not download presentation (HTTP ${response?.status || 'unknown'}). Check Supabase Storage access.`);
      setNativePptxStatus('Downloading presentation…', 0.06);
      buffer = await readPptxBuffer(response, meta, cacheKey);
    }
    if (!document.getElementById('pptxNativeViewer')) return;
    nativePptxRenderer = new Renderer();
    await nativePptxRenderer.load(buffer, (progress, message) => {
      setNativePptxStatus(message || 'Preparing slides…', .55 + Math.max(0, Math.min(1, progress)) * .4);
    });
    if (!document.getElementById('pptxNativeViewer')) { destroyNativePptxViewer(); return; }
    nativePptxSlideCount = Number(nativePptxRenderer.slideCount) || 0;
    if (!nativePptxSlideCount) throw new Error('No slides were found in this PPTX file.');
    nativePptxSlideIndex = -1;
    const page = shell.querySelector('#pptxNativePage');
    if (page) page.textContent = `Slide 1 / ${nativePptxSlideCount}`;
    const markRead = document.getElementById('presentationMarkRead');
    if (markRead) markRead.disabled = false;
    await renderNativePptxSlide(0);
    trackEvent('presentation_open', { contentType: 'presentation', contentId: presentationReadSession?.fileId, moduleId: presentationReadSession?.moduleId, payload: { filename, mimeType: meta.mimeType, size: meta.size, viewer: 'native-pptx', slideCount: nativePptxSlideCount, usedMemoryCache: Boolean(cachedBuffer) } });
  } catch (error) {
    if (!document.getElementById('pptxNativeViewer')) return;
    const viewport = shell.querySelector('#pptxNativeViewport');
    if (viewport) {
      viewport.innerHTML = `<div class="npv-message"><h3>In-app preview unavailable</h3><p>${escapeModuleHTML(error?.message || 'This PPTX could not be rendered in the browser.')}</p><p>You can download the original file using the Download button above, or ask the administrator to upload a PDF copy for faster preview.</p></div>`;
    }
    setNativePptxStatus('Preview unavailable', 0);
    const markRead = document.getElementById('presentationMarkRead');
    if (markRead) markRead.disabled = true;
    if (presentationReadSession) {
      trackEvent('presentation_preview_unavailable', { contentType: 'presentation', contentId: presentationReadSession.fileId, moduleId: presentationReadSession.moduleId, payload: { filename, reason: String(error?.message || 'native-render-failed').slice(0, 180), viewer: 'native-pptx' } });
    }
    // Do not count time spent looking at an error as learning time.
    presentationReadSession = null;
    showToast('Unable to render PPTX in the in-app viewer.', 'error', 4500);
  }
}
// ============================================================
// NATIVE PDF STUDY READER
// Render PDFs inside MedNeo (rather than a blank browser iframe), with page
// controls, selectable text view, read-aloud, night reading canvas and progress.
// ============================================================
function loadPdfJs() {
  if (!pdfJsImportPromise) {
    pdfJsImportPromise = import(PDFJS_MODULE_URL).then((pdfjs) => {
      if (!pdfjs || typeof pdfjs.getDocument !== 'function') throw new Error('The PDF reader library did not load.');
      pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
      return pdfjs;
    }).catch((error) => {
      pdfJsImportPromise = null;
      throw new Error('Could not load the in-app PDF reader. Check your internet connection, then try again.');
    });
  }
  return pdfJsImportPromise;
}

function ensurePdfReaderStyles() {
  if (document.getElementById('medneoPdfReaderStyles')) return;
  const style = document.createElement('style');
  style.id = 'medneoPdfReaderStyles';
  style.textContent = `
    #medneoPdfReader{position:absolute;inset:0;display:flex;flex-direction:column;min-height:0;overflow:hidden;background:#eef2f6;color:#17212f;font-family:Inter,Arial,sans-serif}
    #medneoPdfReader .mpr-topline{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 16px;background:#fff;border-bottom:1px solid #dce3ec;flex-wrap:wrap}
    #medneoPdfReader .mpr-status{font-size:12px;color:#5d6b7d;line-height:1.4}
    #medneoPdfReader .mpr-actions{display:flex;align-items:center;justify-content:flex-end;gap:7px;flex-wrap:wrap}
    #medneoPdfReader button{appearance:none;border:1px solid #d6dee8;border-radius:9px;background:#fff;color:#273649;padding:8px 11px;min-height:35px;font:600 12px/1.2 Inter,Arial,sans-serif;cursor:pointer;transition:background .16s ease,border-color .16s ease,transform .16s ease,box-shadow .16s ease}
    #medneoPdfReader button:hover:not(:disabled){background:#f7f9fc;border-color:#aebdcc;transform:translateY(-1px);box-shadow:0 3px 10px rgba(20,35,55,.07)}
    #medneoPdfReader button:active:not(:disabled){transform:translateY(0) scale(.99)}
    #medneoPdfReader button:disabled{opacity:.42;cursor:not-allowed}
    #medneoPdfReader button:focus-visible{outline:3px solid rgba(0,119,181,.4);outline-offset:2px}
    #medneoPdfReader .mpr-progress{height:3px;background:#dce4ee;flex:0 0 auto}
    #medneoPdfReader .mpr-progress span{display:block;height:100%;width:0;background:#c92b35;transition:width .2s ease}
    #medneoPdfReader .mpr-viewport{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;padding:22px 18px 30px;display:flex;flex-direction:column;align-items:center;gap:14px;background:#eef2f6;transition:background .2s ease}
    #medneoPdfReader .mpr-paper{position:relative;display:flex;flex-direction:column;align-items:center;max-width:100%;min-height:180px;padding:clamp(5px,1.2vw,18px);background:#fff;border:1px solid rgba(20,35,55,.09);border-radius:5px;box-shadow:0 14px 45px rgba(26,43,66,.14);transition:box-shadow .18s ease}
    #medneoPdfReader .mpr-canvas{display:block;max-width:100%;height:auto;background:#fff}
    #medneoPdfReader .mpr-text{width:min(900px,100%);padding:22px 24px;background:#fff;border:1px solid #e1e7ef;border-radius:12px;color:#263447;font-size:15px;line-height:1.85;white-space:pre-wrap;overflow-wrap:anywhere;box-shadow:0 5px 18px rgba(26,43,66,.05)}
    #medneoPdfReader .mpr-text[hidden]{display:none}
    #medneoPdfReader .mpr-page-meta{font-size:12px;color:#5d6b7d;font-variant-numeric:tabular-nums}
    #medneoPdfReader .mpr-note{font-size:12px;color:#657387;text-align:center;max-width:720px;line-height:1.5}
    #medneoPdfReader .mpr-empty{width:min(560px,calc(100% - 32px));margin:auto;padding:30px;background:#fff;border:1px solid #e1e7ef;border-radius:16px;text-align:center;box-shadow:0 10px 30px rgba(26,43,66,.08);line-height:1.65}
    #medneoPdfReader .mpr-empty h3{margin:0 0 9px;color:#1d2c40;font-size:18px}
    #medneoPdfReader .mpr-empty p{margin:0 0 12px;color:#647287;font-size:13px}
    #presentationModal .presentation-modal.reader-night-mode #medneoPdfReader{background:#101721;color:#e9eef5}
    #presentationModal .presentation-modal.reader-night-mode #medneoPdfReader .mpr-topline{background:#151e2a;border-color:#2a3544}
    #presentationModal .presentation-modal.reader-night-mode #medneoPdfReader .mpr-status,#presentationModal .presentation-modal.reader-night-mode #medneoPdfReader .mpr-note,#presentationModal .presentation-modal.reader-night-mode #medneoPdfReader .mpr-page-meta{color:#b3bfd0}
    #presentationModal .presentation-modal.reader-night-mode #medneoPdfReader .mpr-topline button{background:#202c3b;border-color:#3d4a5c;color:#eef3f9}
    #presentationModal .presentation-modal.reader-night-mode #medneoPdfReader .mpr-viewport{background:#101721}
    #presentationModal .presentation-modal.reader-night-mode #medneoPdfReader .mpr-paper{box-shadow:0 18px 48px rgba(0,0,0,.42)}
    @media(max-width:640px){#medneoPdfReader .mpr-topline{align-items:flex-start;padding:8px 9px}#medneoPdfReader .mpr-viewport{padding:10px 7px 18px}#medneoPdfReader .mpr-actions{width:100%;justify-content:flex-start}#medneoPdfReader button{padding:7px 9px;min-height:34px}#medneoPdfReader .mpr-paper{padding:4px}#medneoPdfReader .mpr-text{padding:15px 14px;font-size:14px}}
    @media(prefers-reduced-motion:reduce){#medneoPdfReader button,#medneoPdfReader .mpr-progress span,#medneoPdfReader .mpr-viewport,#medneoPdfReader .mpr-paper{transition:none!important}}
  `;
  document.head.appendChild(style);
}

function destroyPdfReader() {
  pdfReaderRenderSerial++;
  try { pdfReaderRenderTask?.cancel(); } catch {}
  pdfReaderRenderTask = null;
  try { pdfReaderLoadingTask?.destroy?.(); } catch {}
  try { pdfReaderDocument?.destroy?.(); } catch {}
  pdfReaderLoadingTask = null;
  pdfReaderDocument = null;
  pdfReaderPage = 1;
  pdfReaderPageCount = 0;
  pdfReaderZoom = 1;
  pdfReaderPageText = new Map();
  pdfReaderPagesViewed = new Set();
  document.getElementById('medneoPdfReader')?.remove();
}

function makePdfReaderShell(frameWrap) {
  destroyPdfReader();
  ensurePdfReaderStyles();
  const frame = document.getElementById('presentationFrame');
  if (frame) { frame.src = 'about:blank'; frame.style.display = 'none'; }
  const shell = document.createElement('section');
  shell.id = 'medneoPdfReader';
  shell.setAttribute('aria-label', 'PDF study reader');
  shell.innerHTML = `
    <div class="mpr-progress" aria-hidden="true"><span id="mprProgressFill"></span></div>
    <div class="mpr-topline">
      <div class="mpr-status" id="mprStatus" role="status" aria-live="polite">Preparing the PDF…</div>
      <div class="mpr-actions">
        <button type="button" id="mprPrev" disabled>← Previous</button>
        <span class="mpr-page-meta" id="mprPageCounter">Loading pages…</span>
        <button type="button" id="mprNext" disabled>Next →</button>
        <button type="button" id="mprZoomOut" title="Zoom out">−</button>
        <button type="button" id="mprZoomIn" title="Zoom in">+</button>
        <button type="button" id="mprTextToggle" aria-expanded="false">Text view</button>
        <button type="button" id="mprListen">🔊 Listen to page</button>
        <button type="button" id="mprStop" disabled>■ Stop</button>
      </div>
    </div>
    <div class="mpr-viewport" id="mprViewport" tabindex="0" aria-label="PDF page viewer. Use left and right arrow keys to change pages.">
      <div class="mpr-paper"><canvas class="mpr-canvas" id="mprCanvas" aria-label="Rendered PDF page"></canvas></div>
      <div class="mpr-text" id="mprTextView" hidden></div>
      <div class="mpr-note" id="mprNote">Use the page controls to read, zoom or listen. Original page colors are preserved.</div>
    </div>`;
  frameWrap.appendChild(shell);
  shell.querySelector('#mprPrev').addEventListener('click', () => goPdfPage(pdfReaderPage - 1, true));
  shell.querySelector('#mprNext').addEventListener('click', () => goPdfPage(pdfReaderPage + 1, true));
  shell.querySelector('#mprZoomOut').addEventListener('click', () => { pdfReaderZoom = Math.max(.65, +(pdfReaderZoom - .15).toFixed(2)); renderPdfReaderPage(pdfReaderPage); });
  shell.querySelector('#mprZoomIn').addEventListener('click', () => { pdfReaderZoom = Math.min(2.2, +(pdfReaderZoom + .15).toFixed(2)); renderPdfReaderPage(pdfReaderPage); });
  shell.querySelector('#mprListen').addEventListener('click', listenToPdfPage);
  shell.querySelector('#mprStop').addEventListener('click', () => { stopReaderNarration(); syncPdfListenButtons(false); });
  shell.querySelector('#mprTextToggle').addEventListener('click', () => {
    const text = shell.querySelector('#mprTextView');
    const button = shell.querySelector('#mprTextToggle');
    if (!text || !button) return;
    text.hidden = !text.hidden;
    button.setAttribute('aria-expanded', String(!text.hidden));
    button.textContent = text.hidden ? 'Text view' : 'Hide text';
    if (!text.hidden) text.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest' });
  });
  shell.querySelector('#mprViewport').addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft') { event.preventDefault(); goPdfPage(pdfReaderPage - 1, true); }
    if (event.key === 'ArrowRight') { event.preventDefault(); goPdfPage(pdfReaderPage + 1, true); }
  });
  return shell;
}

async function openNativePdf(url, meta, frameWrap) {
  const shell = makePdfReaderShell(frameWrap);
  const status = shell.querySelector('#mprStatus');
  const markRead = document.getElementById('presentationMarkRead');
  try {
    status.textContent = 'Loading secure PDF…';
    // Prefer the expiring signed storage URL for faster byte-range loading. If the
    // Storage CORS policy blocks PDF.js, fall back to the authenticated same-origin
    // range proxy. PDF.js still renders into our canvas, not the blank browser iframe.
    const pdfjs = await loadPdfJs();
    if (!document.getElementById('medneoPdfReader')) return;
    try {
      pdfReaderLoadingTask = pdfjs.getDocument({ url, withCredentials: false, disableRange: false, rangeChunkSize: 65536, stopAtErrors: false });
      pdfReaderDocument = await pdfReaderLoadingTask.promise;
    } catch (directError) {
      try { await pdfReaderLoadingTask?.destroy?.(); } catch {}
      pdfReaderLoadingTask = null;
      const proxyUrl = `/api/module/${encodeURIComponent(presentationReadSession.fileId)}?stream=1`;
      pdfReaderLoadingTask = pdfjs.getDocument({ url: proxyUrl, withCredentials: true, disableRange: false, rangeChunkSize: 65536, stopAtErrors: false });
      pdfReaderDocument = await pdfReaderLoadingTask.promise;
      if (presentationReadSession) presentationReadSession.pdfProxyFallback = true;
    }
    if (!document.getElementById('medneoPdfReader')) { destroyPdfReader(); return; }
    pdfReaderPageCount = Number(pdfReaderDocument.numPages) || 0;
    if (!pdfReaderPageCount) throw new Error('No readable pages were found in this PDF.');
    if (presentationReadSession) {
      presentationReadSession.viewerType = 'native-pdf';
      presentationReadSession.pageCount = pdfReaderPageCount;
      presentationReadSession.pagesViewed = pdfReaderPagesViewed;
      presentationReadSession.currentPage = 1;
    }
    if (markRead) markRead.disabled = false;
    await renderPdfReaderPage(1);
    status.textContent = `Ready to read · ${pdfReaderPageCount} page${pdfReaderPageCount === 1 ? '' : 's'}`;
    const frame = document.getElementById('presentationFrame');
    if (frame) frame.style.display = 'none';
    trackEvent('presentation_open', { contentType: 'presentation', contentId: presentationReadSession?.fileId, moduleId: presentationReadSession?.moduleId, payload: { filename: presentationReadSession?.filename || meta.filename, mimeType: meta.mimeType, size: meta.size, viewer: 'native-pdf', pageCount: pdfReaderPageCount } });
  } catch (error) {
    if (!document.getElementById('medneoPdfReader')) return;
    const viewport = shell.querySelector('#mprViewport');
    if (viewport) viewport.innerHTML = `<div class="mpr-empty"><h3>We couldn't render this PDF</h3><p>${escapeModuleHTML(error?.message || 'The PDF could not be loaded.')}</p><p>Use Download to open the original file, or check that the authenticated PDF streaming API and Supabase Storage permissions are configured.</p></div>`;
    if (status) status.textContent = 'PDF preview unavailable';
    if (markRead) markRead.disabled = true;
    throw error;
  }
}

async function renderPdfReaderPage(pageNumber) {
  if (!pdfReaderDocument) return;
  const target = Math.max(1, Math.min(pdfReaderPageCount, Number(pageNumber) || 1));
  pdfReaderPage = target;
  const renderSerial = ++pdfReaderRenderSerial;
  try { pdfReaderRenderTask?.cancel(); } catch {}
  const canvas = document.getElementById('mprCanvas');
  const viewportEl = document.getElementById('mprViewport');
  const pageCounter = document.getElementById('mprPageCounter');
  const prev = document.getElementById('mprPrev');
  const next = document.getElementById('mprNext');
  const status = document.getElementById('mprStatus');
  const progressFill = document.getElementById('mprProgressFill');
  const textView = document.getElementById('mprTextView');
  if (!canvas || !viewportEl) return;
  if (pageCounter) pageCounter.textContent = `Page ${target} of ${pdfReaderPageCount}`;
  if (prev) prev.disabled = target <= 1;
  if (next) next.disabled = target >= pdfReaderPageCount;
  if (progressFill) progressFill.style.width = `${Math.round(target / pdfReaderPageCount * 100)}%`;
  if (status) status.textContent = `Rendering page ${target}…`;
  const page = await pdfReaderDocument.getPage(target);
  if (renderSerial !== pdfReaderRenderSerial || !document.getElementById('medneoPdfReader')) return;
  const baseViewport = page.getViewport({ scale: 1 });
  // Fit the whole page into the visible reader by default, using both width and
  // height. Zoom controls can then intentionally enlarge the page when desired.
  const maxWidth = Math.max(180, Math.min(1400, viewportEl.clientWidth - 24));
  const maxHeight = Math.max(180, viewportEl.clientHeight - 18);
  const fitScale = Math.min(1.45, maxWidth / baseViewport.width, maxHeight / baseViewport.height);
  const scale = Math.max(.2, fitScale * pdfReaderZoom);
  const viewport = page.getViewport({ scale });
  const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
  canvas.width = Math.ceil(viewport.width * dpr);
  canvas.height = Math.ceil(viewport.height * dpr);
  canvas.style.width = `${Math.ceil(viewport.width)}px`;
  canvas.style.height = `${Math.ceil(viewport.height)}px`;
  const context = canvas.getContext('2d', { alpha: false });
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  pdfReaderRenderTask = page.render({ canvasContext: context, viewport, background: '#ffffff' });
  try { await pdfReaderRenderTask.promise; } catch (error) { if (error?.name !== 'RenderingCancelledException') throw error; else return; }
  if (renderSerial !== pdfReaderRenderSerial) return;
  const pageText = await getPdfPageText(target, page);
  if (textView) textView.textContent = pageText || 'No selectable text was found on this page. If this PDF was created from scanned images, export it with OCR/searchable text to enable read-aloud.';
  pdfReaderPagesViewed.add(target);
  if (presentationReadSession) {
    presentationReadSession.currentPage = target;
    presentationReadSession.pagesViewed = pdfReaderPagesViewed;
  }
  if (status) status.textContent = `${pdfReaderPagesViewed.size} of ${pdfReaderPageCount} pages explored`;
  const overallPct = Math.round(pdfReaderPagesViewed.size / pdfReaderPageCount * 100);
  const footer = document.getElementById('presentationReadProgress');
  if (footer) footer.textContent = `Page ${target} of ${pdfReaderPageCount} · ${overallPct}% of pages explored · reading time saves automatically.`;
  if (presentationReadSession) trackEvent('presentation_page_view', { contentType: 'presentation', contentId: presentationReadSession.fileId, moduleId: presentationReadSession.moduleId, payload: { filename: presentationReadSession.filename, pageNumber: target, totalPages: pdfReaderPageCount, pagesViewed: pdfReaderPagesViewed.size, viewer: 'native-pdf' } });
}

async function getPdfPageText(pageNumber, suppliedPage = null) {
  if (pdfReaderPageText.has(pageNumber)) return pdfReaderPageText.get(pageNumber);
  const page = suppliedPage || await pdfReaderDocument.getPage(pageNumber);
  const content = await page.getTextContent();
  const text = (content.items || []).map((item) => `${item.str || ''}${item.hasEOL ? '\n' : ' '}`).join('').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  pdfReaderPageText.set(pageNumber, text);
  return text;
}

async function goPdfPage(pageNumber, withCue = false) {
  if (!pdfReaderDocument) return;
  const target = Math.max(1, Math.min(pdfReaderPageCount, Number(pageNumber) || 1));
  if (target === pdfReaderPage) return;
  stopReaderNarration();
  if (withCue) playLearningTone('next');
  const viewport = document.getElementById('mprViewport');
  if (viewport) viewport.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  await renderPdfReaderPage(target);
}

function syncPdfListenButtons(isSpeaking) {
  const listen = document.getElementById('mprListen');
  const stop = document.getElementById('mprStop');
  if (listen) listen.textContent = isSpeaking ? '🔊 Reading…' : '🔊 Listen to page';
  if (stop) stop.disabled = !isSpeaking;
}
async function listenToPdfPage() {
  if (!('speechSynthesis' in window)) { showToast('Read-aloud is not supported in this browser.', 'info'); return; }
  stopReaderNarration();
  const button = document.getElementById('mprListen');
  if (button) button.disabled = true;
  try {
    const text = await getPdfPageText(pdfReaderPage);
    if (!text) { showToast('This page has no selectable text. An OCR/searchable PDF is needed for read-aloud.', 'info', 4500); return; }
    const utterance = new SpeechSynthesisUtterance(text.slice(0, 12000));
    utterance.rate = 0.94;
    utterance.pitch = 1;
    utterance.lang = 'en-IN';
    utterance.onstart = () => syncPdfListenButtons(true);
    utterance.onend = () => { if (readerSpeech === utterance) readerSpeech = null; syncPdfListenButtons(false); };
    utterance.onerror = () => { if (readerSpeech === utterance) readerSpeech = null; syncPdfListenButtons(false); };
    readerSpeech = utterance;
    window.speechSynthesis.speak(utterance);
  } catch (error) {
    showToast(error?.message || 'Could not read this PDF page aloud.', 'error', 3500);
  } finally {
    if (button) button.disabled = false;
  }
}

function ensurePresentationModalShell() {
  let modal = document.getElementById('presentationModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'presentationModal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'presentationModalTitle');
    modal.innerHTML = `
      <div class="modal presentation-modal">
        <div class="modal-header"><div style="min-width:0;flex:1"><div class="modal-title" id="presentationModalTitle">Module PDF</div><div id="presentationStatus" role="status" aria-live="polite" style="font-size:.75rem;color:var(--text-muted);margin-top:3px">Preparing secure PDF…</div></div><button type="button" class="modal-close" onclick="closePresentationViewer()" aria-label="Close reader">✕</button></div>
        <div class="presentation-toolbar"><a id="presentationDownload" class="btn btn-outline" href="#" download hidden>↓ Download PDF</a><button type="button" id="presentationMarkRead" class="btn btn-primary" onclick="markPresentationAsRead()" disabled>✓ Mark as read</button><button type="button" class="btn btn-ghost" onclick="expandPresentationView()">⛶ Full screen</button></div>
        <div id="presentationReadProgress" class="presentation-read-progress">Reading time and page progress will be recorded automatically.</div>
        <div id="presentationFrameWrap"><iframe id="presentationFrame" title="PDF fallback viewer" src="about:blank" allow="fullscreen" referrerpolicy="same-origin"></iframe></div>
      </div>`;
    document.body.appendChild(modal);
  }
  // Avoid duplicate fullscreen permission declarations in older copies of the dashboard.
  modal.querySelectorAll('iframe[allowfullscreen]').forEach((frame) => frame.removeAttribute('allowfullscreen'));
  const frame = modal.querySelector('#presentationFrame');
  if (frame && !frame.getAttribute('allow')) frame.setAttribute('allow', 'fullscreen');
  if (!document.getElementById('medneoPresentationLayoutStyles')) {
    const style = document.createElement('style');
    style.id = 'medneoPresentationLayoutStyles';
    style.textContent = `
      #presentationModal{padding:clamp(8px,1.5vw,20px);overflow:hidden}
      #presentationModal .presentation-modal{width:min(1500px,calc(100vw - 28px));height:min(94dvh,1000px);max-width:calc(100vw - 28px);max-height:94dvh;display:flex;flex-direction:column;overflow:hidden;border-radius:16px}
      #presentationModal .modal-header{gap:12px;align-items:center;padding:12px 16px;min-width:0;flex:0 0 auto}
      #presentationModal .modal-title{min-width:0;overflow-wrap:anywhere}
      #presentationModal .presentation-toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:10px 14px;border-bottom:1px solid var(--color-border);flex:0 0 auto}
      #presentationModal .presentation-read-progress{font-size:.76rem;color:var(--text-muted);padding:7px 14px;line-height:1.45;flex:0 0 auto}
      #presentationFrameWrap{position:relative;flex:1 1 auto;min-width:0;min-height:0;height:auto;overflow:hidden;background:#eef2f6;isolation:isolate}
      #presentationFrame{position:absolute;inset:0;width:100%;height:100%;border:0;background:white}
      #presentationModal .modal-fullscreen{width:calc(100vw - 24px);max-width:calc(100vw - 24px);height:calc(100dvh - 24px);max-height:calc(100dvh - 24px);border-radius:12px}
      #presentationMarkRead,#presentationDownload{min-height:40px;display:inline-flex;align-items:center;justify-content:center;gap:7px;border-radius:10px;font-weight:650}
      #presentationMarkRead{padding:9px 14px} #presentationDownload{padding:9px 14px;text-decoration:none}
      @media(max-width:640px){#presentationModal .presentation-modal{width:calc(100vw - 12px);max-width:calc(100vw - 12px);height:calc(100dvh - 12px);max-height:calc(100dvh - 12px);border-radius:10px}#presentationModal .modal-header{padding:10px 12px}#presentationModal .presentation-toolbar{padding:8px;gap:6px}#presentationModal .presentation-toolbar .btn{flex:1 1 auto;min-width:110px}#presentationModal .presentation-read-progress{padding:6px 9px;font-size:.7rem}}
      @media(prefers-reduced-motion:reduce){#presentationModal *,#presentationModal *::before,#presentationModal *::after{scroll-behavior:auto!important;transition:none!important;animation:none!important}}
    `;
    document.head.appendChild(style);
  }
  return modal;
}

async function openPresentationFile(fileId, moduleId = activeModuleId) {
  ensurePresentationModalShell();
  const modal = document.getElementById('presentationModal');
  const frame = document.getElementById('presentationFrame');
  const frameWrap = document.getElementById('presentationFrameWrap');
  const title = document.getElementById('presentationModalTitle');
  const status = document.getElementById('presentationStatus');
  const progress = document.getElementById('presentationReadProgress');
  const download = document.getElementById('presentationDownload');
  const markRead = document.getElementById('presentationMarkRead');
  if (!modal || !frame || !frameWrap || !title || !status) return;
  if (presentationHeartbeat) clearInterval(presentationHeartbeat);
  presentationHeartbeat = null;
  presentationReadSession = null;
  stopReaderNarration();
  destroyNativePptxViewer();
  destroyPdfReader();
  frame.src = 'about:blank';
  download.hidden = true;
  if (markRead) { markRead.disabled = true; markRead.textContent = '✓ Mark as read'; }
  title.textContent = 'Module presentation';
  status.textContent = 'Preparing secure viewer…';
  progress.textContent = 'Reading time starts when the presentation opens.';
  modal.querySelector('.modal')?.classList.add('modal-fullscreen');
  modal.querySelector('.modal')?.classList.toggle('reader-night-mode', readerNightMode);
  openModal('presentationModal');
  try {
    const meta = await api(`/api/module/${encodeURIComponent(fileId)}?view=1`);
    if (!meta?.url) throw new Error(meta?.error || 'No presentation URL was returned.');
    const filename = String(meta.filename || 'Module presentation');
    const extension = filename.split('.').pop().toLowerCase();
    const isPdf = extension === 'pdf' || String(meta.mimeType).toLowerCase().includes('pdf');
    if (!isPdf) throw new Error('MedNeo now uses PDF files for module reading. Ask the administrator to replace this legacy PowerPoint with a PDF.');
    title.textContent = filename;
    download.href = meta.url;
    download.download = filename;
    download.hidden = false;
    presentationReadSession = { fileId, moduleId, filename, startTime: Date.now(), lastSent: Date.now(), isPdf, totalSeconds: 0, completed: false, viewerType: isPdf ? 'browser-pdf' : extension === 'pptx' ? 'native-pptx' : 'unsupported-ppt' };
    if (isPdf) {
      frame.style.display = 'none';
      status.textContent = 'Opening the in-app PDF study reader…';
      if (progress) progress.textContent = 'Loading page 1 and preparing read-aloud controls.';
      await openNativePdf(meta.url, meta, frameWrap);
    } else if (extension === 'pptx') {
      status.textContent = 'Opening in MedNeo…';
      if (progress) progress.textContent = 'Loading the presentation into the in-page reader. It will not open Microsoft PowerPoint.';
      await openNativePptx(meta.url, meta, frameWrap);
    } else if (extension === 'ppt') {
      frame.style.display = 'none';
      const shell = makeNativePptxShell(frameWrap);
      shell.querySelector('.npv-controls')?.remove();
      shell.querySelector('.npv-progress')?.remove();
      shell.querySelector('.npv-viewport')?.remove();
      const message = document.createElement('div');
      message.className = 'npv-message';
      message.innerHTML = '<h3>Convert this presentation for in-page reading</h3><p>The older .ppt format cannot be reliably rendered by the browser reader. Ask the administrator to upload a .pptx or PDF version. MedNeo will not launch Microsoft PowerPoint automatically.</p>';
      shell.appendChild(message);
      status.textContent = 'Older PowerPoint format';
      if (markRead) markRead.disabled = true;
      trackEvent('presentation_preview_unavailable', { contentType: 'presentation', contentId: fileId, moduleId, payload: { filename, reason: 'legacy-ppt-format', viewer: 'none' } });
      presentationReadSession = null; // No reader was opened, so do not record reading time.
    } else {
      frame.style.display = '';
      frame.src = meta.url;
      status.textContent = 'Secure file viewer opened.';
      if (markRead) markRead.disabled = false;
    }
    presentationHeartbeat = setInterval(() => {
      if (!presentationReadSession) return;
      const now = Date.now();
      const intervalSeconds = Math.max(1, Math.min(60, Math.floor((now - presentationReadSession.lastSent) / 1000)));
      presentationReadSession.totalSeconds = Math.floor((now - presentationReadSession.startTime) / 1000);
      presentationReadSession.lastSent = now;
      if (progress && presentationReadSession.viewerType !== 'native-pptx') progress.textContent = `Reading time recorded: ${presentationReadSession.totalSeconds}s · Progress is saved automatically.`;
      trackEvent('presentation_progress', { contentType: 'presentation', contentId: fileId, moduleId, durationSeconds: intervalSeconds, payload: { filename, elapsedSeconds: presentationReadSession.totalSeconds, viewer: presentationReadSession.viewerType, currentSlide: presentationReadSession.currentSlide || null, slideCount: presentationReadSession.slideCount || null, currentPage: presentationReadSession.currentPage || null, pageCount: presentationReadSession.pageCount || null, pagesViewed: presentationReadSession.pagesViewed?.size || null } });
    }, 15000);
  } catch (error) {
    status.textContent = error?.message || 'Unable to open this presentation.';
    if (progress) progress.textContent = 'The presentation could not be opened. Check your connection, Storage access and module publishing status.';
    const pdfStatus = document.getElementById('mprStatus');
    if (pdfStatus) pdfStatus.textContent = 'PDF preview unavailable';
    if (markRead) markRead.disabled = true;
    showToast(error?.message || 'Unable to open presentation. Check the server log.', 'error', 5000);
  }
}
window.openPresentationFile = openPresentationFile;
function markPresentationAsRead() {
  const session = presentationReadSession;
  const button = document.getElementById('presentationMarkRead');
  const progress = document.getElementById('presentationReadProgress');
  if (!session || session.completed) return;
  session.completed = true;
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - session.startTime) / 1000));
  if (button) { button.disabled = true; button.textContent = '✓ Marked as read'; }
  if (progress) progress.textContent = `Marked as read · ${elapsedSeconds}s spent. Your progress has been saved.`;
  trackEvent('presentation_complete', { contentType: 'presentation', contentId: session.fileId, moduleId: session.moduleId, payload: { filename: session.filename, elapsedSeconds, completedByDoctor: true, viewer: session.viewerType || (session.isPdf ? 'native-pdf' : 'native-pptx'), pageCount: session.pageCount || null, pagesViewed: session.pagesViewed?.size || null } });
  playLearningTone('success');
  showToast('Presentation completed — nicely done!', 'success', 2600);
}
window.markPresentationAsRead = markPresentationAsRead;

function closePresentationViewer() {
  if (presentationHeartbeat) clearInterval(presentationHeartbeat);
  presentationHeartbeat = null;
  if (presentationReadSession) {
    const session = presentationReadSession;
    const seconds = Math.max(0, Math.floor((Date.now() - session.startTime) / 1000));
    const secondsAlreadySent = Math.max(0, Math.floor((session.lastSent - session.startTime) / 1000));
    const unsentTailSeconds = Math.max(0, Math.min(60, seconds - secondsAlreadySent));
    trackEvent('presentation_close', { contentType: 'presentation', contentId: session.fileId, moduleId: session.moduleId, durationSeconds: unsentTailSeconds, payload: { filename: session.filename, elapsedSeconds: seconds, markedAsRead: session.completed, viewerClosed: true } });
  }
  presentationReadSession = null;
  stopReaderNarration();
  destroyNativePptxViewer();
  destroyPdfReader();
  const frame = document.getElementById('presentationFrame');
  if (frame) frame.src = 'about:blank';
  closeModal('presentationModal');
}
window.closePresentationViewer = closePresentationViewer;

let pdfReaderResizeTimer = null;
window.addEventListener('resize', () => {
  if (nativePptxRenderer && document.getElementById('pptxNativeViewer')) {
    const current = nativePptxSlideIndex;
    nativePptxSlideIndex = -1;
    renderNativePptxSlide(current);
  }
  if (pdfReaderDocument && document.getElementById('medneoPdfReader')) {
    clearTimeout(pdfReaderResizeTimer);
    pdfReaderResizeTimer = setTimeout(() => renderPdfReaderPage(pdfReaderPage).catch(() => {}), 140);
  }
});
async function expandPresentationView() {
  const modal = document.querySelector('#presentationModal .presentation-modal');
  if (!modal) return;
  try {
    if (modal.requestFullscreen) await modal.requestFullscreen();
    else modal.classList.toggle('modal-fullscreen');
  } catch { modal.classList.add('modal-fullscreen'); }
}
window.expandPresentationView = expandPresentationView;

// ============================================================
// ARTICLE READER
// ============================================================
function openArticle(id) {
  const article = DB.articles[id];
  if (!article) return;
  trackEvent('article_open', { contentType: 'article', contentId: id, moduleId: activeModuleId, payload: { title: article.title } });
  articleScrollMarks = new Set();
  articleSectionsSeen = new Set();

  const body = document.getElementById('articleModalBody');
  const titleEl = document.getElementById('articleModalTitle');
  if (!body || !titleEl) return;
  titleEl.textContent = article.title;

  const tocItems = article.content.map(s => s.heading).filter(Boolean);

  body.innerHTML = `
    <div class="article-scroll-progress" aria-label="Article reading progress">
      <div class="article-scroll-fill" id="articleScrollFill" style="width:0%"></div>
    </div>
    <div class="article-read-progress-label" id="articleReadProgressLabel">0 of ${article.content.length} sections viewed</div>

    <div class="article-layout">
      <div>
        <div class="article-header">
          <div class="article-category">${article.category}</div>
          <h1 class="article-title">${article.title}</h1>
          <p class="article-subtitle">${article.subtitle}</p>
          <div class="article-meta">
            <div class="article-meta-item">
              <span class="icon">⏱</span> ${article.readTime}
            </div>
            <div class="article-meta-item">
              <span class="icon">📅</span> ${article.publishedDate}
            </div>
            <div class="article-publisher">
              <div class="bad-logo-mini">BAD</div>
              British Association of Dermatologists
            </div>
          </div>
        </div>

        <div class="article-body" id="articleBody">
          ${article.content.map((section, i) => `
            <div class="article-section" id="section-${i}">
              <h2 class="article-section-heading">${section.heading}</h2>
              <p class="article-text">${section.text}</p>
              ${section.highlight ? `<div class="article-highlight">${section.highlight}</div>` : ''}
              ${section.table ? `
                <table class="article-table">
                  <thead><tr>${section.table.headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
                  <tbody>${section.table.rows.map(row => `<tr>${row.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody>
                </table>
              ` : ''}
              ${section.bullets ? `
                <ul class="article-bullets">
                  ${section.bullets.map(b => `<li>${b}</li>`).join('')}
                </ul>
              ` : ''}
            </div>
          `).join('')}
        </div>

        <div style="padding-top:var(--space-xl);border-top:1px solid var(--color-border);display:flex;justify-content:flex-end;">
          <button class="btn btn-primary" onclick="trackEvent('article_complete',{contentType:'article',contentId:'${id}',moduleId:'${activeModuleId}',payload:{title:'${String(article.title || '').replace(/'/g, '')}'}});closeModal('articleModal');showToast('Article marked as read!','success')">
            ✓ Mark as Read
          </button>
        </div>
      </div>

      <div class="article-sidebar">
        <div class="article-sidebar-card">
          <div class="article-sidebar-title">Contents</div>
          ${tocItems.map((t, i) => `
            <div class="toc-item" onclick="scrollToSection(${i})">${t}</div>
          `).join('')}
        </div>
        <div class="article-sidebar-card">
          <div class="article-sidebar-title">Published by</div>
          <div style="display:flex;align-items:center;gap:8px;margin-top:8px">
            <div class="bad-logo-mini" style="width:32px;height:32px;font-size:0.65rem">BAD</div>
            <div>
              <div style="font-size:0.8rem;font-weight:700;color:#1B2A5E">British Association<br>of Dermatologists</div>
            </div>
          </div>
        </div>
        <div class="article-sidebar-card">
          <div class="article-sidebar-title">Service by</div>
          <div style="display:flex;align-items:center;gap:8px;margin-top:8px">
            <div style="width:20px;height:14px;background:#D62B2B;border-radius:2px;display:flex;align-items:center;justify-content:center">
              <span style="font-size:8px;color:white;font-weight:700">M</span>
            </div>
            <span style="font-size:0.8rem;font-weight:700;color:#333">MEDNEO</span>
          </div>
        </div>
      </div>
    </div>
  `;

  // Scroll progress tracking
  const modalBody = document.getElementById('articleModal')?.querySelector('.modal-body');
  if (modalBody) {
    modalBody.onscroll = () => {
      const maxScroll = modalBody.scrollHeight - modalBody.clientHeight;
      const pct = maxScroll > 0 ? (modalBody.scrollTop / maxScroll) * 100 : 100;
      const fill = document.getElementById('articleScrollFill');
      if (fill) fill.style.width = Math.min(pct, 100) + '%';
      [25, 50, 75, 100].forEach((mark) => {
        if (pct >= mark && !articleScrollMarks.has(mark)) {
          articleScrollMarks.add(mark);
          trackEvent('article_scroll', { contentType: 'article', contentId: id, moduleId: activeModuleId, payload: { progressPercent: mark, totalSections: article.content.length } });
        }
      });
      const rootRect = modalBody.getBoundingClientRect();
      const visibleSection = [...modalBody.querySelectorAll('.article-section')].find((section) => {
        const rect = section.getBoundingClientRect();
        return rect.bottom > rootRect.top + 90 && rect.top < rootRect.bottom;
      });
      if (visibleSection) {
        const sectionIndex = Number((visibleSection.id || '').replace('section-', ''));
        if (Number.isInteger(sectionIndex) && !articleSectionsSeen.has(sectionIndex)) {
          articleSectionsSeen.add(sectionIndex);
          const heading = visibleSection.querySelector('.article-section-heading')?.textContent || `Section ${sectionIndex + 1}`;
          trackEvent('article_page_view', { contentType: 'article', contentId: id, moduleId: activeModuleId, payload: { pageNumber: sectionIndex + 1, totalPages: article.content.length, heading, progressPercent: pct } });
          const readLabel = document.getElementById('articleReadProgressLabel');
          if (readLabel) readLabel.textContent = `${articleSectionsSeen.size} of ${article.content.length} sections viewed`;
        }
      }
    };
  }

  openModal('articleModal');
}

function scrollToSection(i) {
  const el = document.getElementById('section-' + i);
  el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Expand article to full size
function expandArticle() {
  const modal = document.getElementById('articleModal');
  const inner = modal?.querySelector('.modal');
  if (!inner) return;
  inner.classList.toggle('modal-fullscreen');
}

// ============================================================
// MCQ ENGINE
// ============================================================
function openMCQ(id) {
  ensureLearningInteractionStyles();
  const quiz = DB.quizzes[id];
  if (!quiz) return;

  quizState = { currentQ: 0, answers: [], score: 0, answered: false };
  quizStartedAt = Date.now();
  quizAttemptSubmitted = false;
  window._currentQuizId = id;
  trackEvent('quiz_start', { contentType: 'quiz', contentId: id, moduleId: activeModuleId, payload: { title: quiz.title, questionCount: quiz.questions?.length || 0 } });

  const body   = document.getElementById('mcqModalBody');
  const titleEl= document.getElementById('mcqModalTitle');
  if (!body || !titleEl) return;
  titleEl.textContent = quiz.title;
  const subtitle = document.getElementById('mcqModalSubTitle');
  const parentModule = (DB.modules || []).find((module) => (module.contents || []).some((item) => item.id === id));
  if (subtitle) subtitle.textContent = parentModule ? `${parentModule.title} · ${parentModule.id.toUpperCase()}` : 'MedNeo learning assessment';

  window._currentQuiz = quiz;
  renderMCQQuestion(body, quiz);
  openModal('mcqModal');
}

function renderMCQQuestion(body, quiz) {
  const q = quiz.questions[quizState.currentQ];
  if (!q) return;

  const letters = ['A', 'B', 'C', 'D'];
  const totalQ  = quiz.questions.length;
  const pct     = Math.round((quizState.currentQ / totalQ) * 100);

  body.innerHTML = `
    <div class="mcq-container">
      <div class="mcq-progress-header">
        <div><div class="mcq-q-counter">Question ${quizState.currentQ + 1} of ${totalQ}</div><div class="quiz-micro-copy">${quizState.currentQ === 0 ? 'Let’s work through this together.' : quizEncouragement[(quizState.currentQ - 1) % quizEncouragement.length]}</div></div>
        <div class="mcq-score-display">🎯 ${quizState.score} / ${quizState.currentQ}</div>
      </div>
      <div class="quiz-tools"><button type="button" class="quiz-sound-btn" data-sound-toggle aria-pressed="${readerSoundEnabled}" onclick="toggleSoundEffects()">${readerSoundEnabled ? '♪ Sound: On' : '♪ Sound: Off'}</button></div>
      <div class="progress-bar" style="margin-bottom:var(--space-xl)">
        <div class="progress-fill" style="width:${pct}%;transition:width 0.5s ease"></div>
      </div>

      <div class="mcq-question-card">
        <div class="mcq-q-number">Question ${quizState.currentQ + 1}</div>
        <p class="mcq-question-text">${escapeModuleHTML(q.question)}</p>
        <div class="mcq-options" id="mcqOptions">
          ${q.options.map((opt, i) => `
            <div class="mcq-option" id="opt-${i}" role="button" tabindex="0" aria-pressed="false" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();selectOption(${i})}" onclick="selectOption(${i})">
              <div class="mcq-option-marker">${letters[i]}</div>
              <div class="mcq-option-text">${escapeModuleHTML(opt)}</div>
            </div>
          `).join('')}
        </div>

        <div class="mcq-explanation" id="mcqExplanation">
          <div class="mcq-explanation-label" id="mcqExplanationLabel">Explanation</div>
          <div class="mcq-explanation-text">${escapeModuleHTML(q.explanation || "") }</div>
        </div>
        <div class="quiz-feedback-line" id="quizFeedbackLine" role="status" aria-live="polite" hidden><span class="quiz-feedback-mark" id="quizFeedbackMark" aria-hidden="true">✓</span><span id="quizFeedbackText"></span></div>

        <div class="mcq-action-row">
          <button class="btn btn-primary" id="mcqNextBtn" onclick="nextQuestion()" style="display:none">
            ${quizState.currentQ < totalQ - 1 ? 'Next Question →' : 'View Results'}
          </button>
        </div>
      </div>
    </div>
  `;

  quizState.answered = false;
  syncSoundToggleButtons();
}

async function selectOption(index) {
  if (quizState.answered) return;
  const quiz = window._currentQuiz;
  const q = quiz?.questions?.[quizState.currentQ];
  if (!q || !Number.isInteger(index) || index < 0 || index >= (q.options || []).length) return;
  playLearningTone('tap');
  quizState.answered = true;
  const options = [...document.querySelectorAll('.mcq-option')];
  options.forEach((option) => { option.classList.add('disabled'); option.setAttribute('aria-disabled', 'true'); });
  const selectedEl = document.getElementById('opt-' + index);
  if (selectedEl) { selectedEl.classList.add('selected', 'disabled'); selectedEl.setAttribute('aria-pressed', 'true'); }
  const expEl = document.getElementById('mcqExplanation');
  const expLabel = document.getElementById('mcqExplanationLabel');
  const expText = document.querySelector('#mcqExplanation .mcq-explanation-text');
  const nextBtn = document.getElementById('mcqNextBtn');
  if (nextBtn) { nextBtn.disabled = true; nextBtn.style.display = 'flex'; nextBtn.textContent = 'Checking answer…'; }
  try {
    const result = await api('/api/quiz-answer', { method: 'POST', body: JSON.stringify({ quizId: window._currentQuizId, questionIndex: quizState.currentQ, selectedIndex: index }) });
    const correctIndex = Number(result.correctIndex);
    const isCorrect = result.isCorrect === true;
    selectedEl?.classList.remove('selected');
    selectedEl?.classList.add(isCorrect ? 'correct' : 'incorrect');
    document.getElementById('opt-' + correctIndex)?.classList.add('correct');
    if (isCorrect) quizState.score++;
    playLearningTone(isCorrect ? (quizState.score > 0 && quizState.score % 3 === 0 ? 'milestone' : 'success') : 'wrong');
    const questionCard = document.querySelector('.mcq-question-card');
    if (questionCard) { questionCard.classList.remove('quiz-answer-correct', 'quiz-answer-wrong'); questionCard.classList.add(isCorrect ? 'quiz-answer-correct' : 'quiz-answer-wrong'); }
    quizState.answers.push({ q: quizState.currentQ, selected: index, correct: correctIndex });
    if (expEl) { expEl.classList.add('show'); if (!isCorrect) expEl.classList.add('wrong'); }
    if (expLabel) expLabel.textContent = isCorrect ? '✓ Correct — nicely done!' : '✦ Not quite — this is how we learn';
    if (expText && result.explanation) expText.textContent = result.explanation;
    const feedbackLine = document.getElementById('quizFeedbackLine');
    const feedbackMark = document.getElementById('quizFeedbackMark');
    const feedbackText = document.getElementById('quizFeedbackText');
    if (feedbackLine && feedbackText) {
      feedbackLine.hidden = false;
      feedbackLine.classList.toggle('is-wrong', !isCorrect);
      feedbackLine.classList.toggle('is-correct', isCorrect);
      if (feedbackMark) feedbackMark.textContent = isCorrect ? '✓' : '↗';
      const positiveMessages = ['That was a strong choice.', 'Great focus — keep going.', 'You’re building momentum.', 'One step further. You’ve got this.', 'Lovely progress. Keep it going.'];
      feedbackText.textContent = isCorrect ? (quizState.score > 0 && quizState.score % 3 === 0 ? 'Three strong steps in a row — take that momentum forward.' : positiveMessages[quizState.currentQ % positiveMessages.length]) : 'Good attempt. Take a breath, review the explanation, and keep moving forward.';
    }
    if (nextBtn) { nextBtn.disabled = false; nextBtn.textContent = quizState.currentQ < quiz.questions.length - 1 ? (isCorrect ? 'Nice work — Next question →' : 'Got it — Continue →') : 'View Results'; nextBtn.classList.add('quiz-next-ready'); }
    // Shift focus to the explanation for keyboard/screen-reader users without jumping the page.
    if (expEl) { expEl.setAttribute('tabindex', '-1'); try { expEl.focus({ preventScroll: true }); } catch {} }
    syncSoundToggleButtons();
  } catch (error) {
    quizState.answered = false;
    options.forEach((option) => { option.classList.remove('disabled'); option.removeAttribute('aria-disabled'); });
    selectedEl?.classList.remove('selected', 'disabled');
    selectedEl?.setAttribute('aria-pressed', 'false');
    if (nextBtn) { nextBtn.disabled = true; nextBtn.style.display = 'none'; }
    showToast(error.message || 'We could not verify and save that answer. Please select again.', 'error', 5000);
  }
}

function nextQuestion() {
  const quiz = window._currentQuiz;
  const body = document.getElementById('mcqModalBody');
  if (!body || !quiz || !quizState.answered) return;

  quizState.currentQ++;
  playLearningTone('next');

  if (quizState.currentQ >= quiz.questions.length) {
    renderMCQResult(body, quiz);
    return;
  }

  renderMCQQuestion(body, quiz);
}

function renderMCQResult(body, quiz) {
  const pct  = Math.round((quizState.score / quiz.questions.length) * 100);
  const pass = pct >= quiz.passingScore;
  const circumference = 2 * Math.PI * 50;
  const dash = (pct / 100) * circumference;

  body.innerHTML = `
    <div class="mcq-result">
      <div class="result-circle">
        <svg width="120" height="120" viewBox="0 0 120 120">
          <circle cx="60" cy="60" r="50" fill="none" stroke="var(--color-border)" stroke-width="8"/>
          <circle cx="60" cy="60" r="50" fill="none"
            stroke="${pass ? 'var(--color-success)' : 'var(--Alembic-red)'}"
            stroke-width="8"
            stroke-dasharray="${dash} ${circumference}"
            stroke-linecap="round"
            style="transition:stroke-dasharray 1s ease"
          />
        </svg>
        <div class="result-circle-text">
          <div class="result-pct">${pct}%</div>
          <div class="result-label">Score</div>
        </div>
      </div>

      <h2 class="result-title">${pass ? '🎉 Congratulations!' : 'Keep Practicing'}</h2>
      <p class="result-subtitle">${pass
        ? `Excellent work! You have passed the ${quiz.title} with a score of ${pct}%.`
        : `You scored ${pct}%. A score of ${quiz.passingScore}% is required to pass. Review the module and try again.`
      }</p>

      <div class="result-stats">
        <div class="result-stat">
          <div class="result-stat-value">${quizState.score}</div>
          <div class="result-stat-label">Correct</div>
        </div>
        <div class="result-stat">
          <div class="result-stat-value">${quiz.questions.length - quizState.score}</div>
          <div class="result-stat-label">Incorrect</div>
        </div>
        <div class="result-stat">
          <div class="result-stat-value">${pct}%</div>
          <div class="result-stat-label">Score</div>
        </div>
      </div>

      <div class="quiz-tools" style="justify-content:center;margin-top:14px"><button type="button" class="quiz-sound-btn" data-sound-toggle aria-pressed="${readerSoundEnabled}" onclick="toggleSoundEffects()">${readerSoundEnabled ? '♪ Sound: On' : '♪ Sound: Off'}</button></div>
      <div class="quiz-result-actions" style="display:flex;gap:var(--space-md);justify-content:center;flex-wrap:wrap">
        <button class="btn btn-outline" onclick="restartQuiz()">↺ Retry Quiz</button>
        <button class="btn btn-primary" onclick="closeModal('mcqModal');showToast('Assessment completed!','success')">
          ${pass ? '✓ Claim Certificate' : '← Back to Module'}
        </button>
      </div>
    </div>
  `;

  if (pass) {
    playLearningTone('complete');
    showToast(pct === 100 ? 'Perfect score — outstanding work!' : 'Assessment passed! Keep building on this progress.', 'success', 4000);
  } else {
    showToast('Progress counts. Review the explanations and give it another try.', 'info', 4000);
  }
  persistQuizAttempt(quiz);
}

function restartQuiz() {
  const quiz = window._currentQuiz;
  const body = document.getElementById('mcqModalBody');
  if (!body || !quiz) return;
  quizState = { currentQ: 0, answers: [], score: 0, answered: false };
  quizStartedAt = Date.now();
  quizAttemptSubmitted = false;
  renderMCQQuestion(body, quiz);
}

async function persistQuizAttempt(quiz) {
  if (quizAttemptSubmitted || !window._currentQuizId) return;
  quizAttemptSubmitted = true;
  try {
    const answerPayload = quizState.answers.map((answer) => ({ questionIndex: answer.q, selectedIndex: answer.selected }));
    const result = await api('/api/quiz-attempt', {
      method: 'POST',
      body: JSON.stringify({ quizId: window._currentQuizId, answers: answerPayload, durationSeconds: Math.max(0, Math.floor((Date.now() - quizStartedAt) / 1000)) })
    });
    quizState.score = result.score;
    currentUser.score = result.percentage;
    showToast(`Assessment saved · ${result.score}/${result.totalQuestions} correct`, 'success', 4000);
  } catch (error) {
    quizAttemptSubmitted = false;
    showToast(error.message || 'Could not save assessment results. Please retry before leaving.', 'error', 5000);
  }
}

async function saveDoctorProfile() {
  const button = document.getElementById('saveProfileBtn');
  if (button) { button.disabled = true; button.textContent = 'Saving…'; }
  try {
    const payload = {
      name: document.getElementById('pName')?.value.trim(),
      phone: document.getElementById('pPhone')?.value.trim(),
      degree: document.getElementById('pDegree')?.value.trim(),
      specialization: document.getElementById('pSpec')?.value.trim(),
      hospital: document.getElementById('pHospital')?.value.trim(),
      registrationNumber: document.getElementById('pRegistrationNumber')?.value.trim(),
      experience: document.getElementById('pExperience')?.value.trim(),
      state: document.getElementById('pState')?.value,
      city: document.getElementById('pCity')?.value
    };
    const result = await api('/api/doctor/profile', { method: 'PATCH', body: JSON.stringify(payload) });
    currentUser = { ...currentUser, ...result.user };
    setSession(currentUser);
    const nameEl = document.getElementById('sidebarUserName');
    if (nameEl) nameEl.textContent = currentUser.name;
    const specEl = document.getElementById('sidebarUserSpec');
    if (specEl) specEl.textContent = currentUser.specialization || 'Doctor';
    const welcomeEl = document.getElementById('welcomeName');
    if (welcomeEl) welcomeEl.textContent = `${getGreeting()}, ${currentUser.name.split(' ').slice(0, 2).join(' ')}`;
    document.querySelectorAll('.user-avatar, #headerAvatar').forEach((el) => { el.textContent = getInitials(currentUser.name); });
    showToast('Profile saved securely.', 'success');
  } catch (error) {
    showToast(error.message || 'Could not save profile changes.', 'error', 5000);
  } finally {
    if (button) { button.disabled = false; button.textContent = 'Save Changes'; }
  }
}

// ============================================================
// PROGRESS
// ============================================================
function renderProgress() {
  const el = document.getElementById('progressContent');
  if (!el) return;
  el.innerHTML = `
    <div class="analytics-strip stagger-children">
      <div class="analytics-item">
        <div class="analytics-value">${currentUser.completedModules.length}</div>
        <div class="analytics-label">Modules Completed</div>
      </div>
      <div class="analytics-item">
        <div class="analytics-value">${currentUser.score}%</div>
        <div class="analytics-label">Avg Score</div>
      </div>
      <div class="analytics-item">
        <div class="analytics-value">${currentUser.streak}</div>
        <div class="analytics-label">Day Streak</div>
      </div>
      <div class="analytics-item">
        <div class="analytics-value">${DB.modules.some((module) => currentUser.completedModules.includes(module.id) && Number.isFinite(Number(module.cmeCredits))) ? numberLabel(DB.modules.filter((module) => currentUser.completedModules.includes(module.id)).reduce((sum, module) => sum + (Number(module.cmeCredits) || 0), 0)) : '—'}</div>
        <div class="analytics-label">CME Credits</div>
      </div>
    </div>

    <div class="card">
      <div class="card-header"><span class="card-title">Module Progress</span></div>
      <div class="card-body">
        ${DB.modules.map(m => `
          <div style="margin-bottom:var(--space-lg)">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
              <div style="display:flex;align-items:center;gap:8px">
                <span>${m.icon}</span>
                <span style="font-size:0.87rem;font-weight:600;color:var(--text-primary)">${m.title}</span>
              </div>
              <span class="badge ${m.status === 'active' ? 'badge-active' : 'badge-coming'}">${m.status === 'active' ? 'Active' : 'Coming Soon'}</span>
            </div>
            <div class="progress-bar">
              <div class="progress-fill" style="width:${m.status === 'active' && currentUser.completedModules.includes(m.id) ? 100 : m.status === 'active' ? 25 : 0}%"></div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}