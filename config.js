// =========================================================
// Летопись — общая конфигурация и вспомогательные функции
// =========================================================

const BOT_USERNAME = 'lcftype_bot';
const MINIAPP_SHORT_NAME = 'lcftype';

const db = window.supabase.createClient(
  window.SUPABASE_URL,
  window.SUPABASE_ANON_KEY
);

const tg = window.Telegram
  ? window.Telegram.WebApp
  : null;

if (tg) {
  tg.ready();
  tg.expand();
}

const tgUser =
  tg?.initDataUnsafe?.user || null;

// =========================================================
// Ключи для хранения в localStorage
// =========================================================

const DRAFTS_STORAGE_KEY = 'lcftype_drafts';
const OLD_DRAFT_STORAGE_KEY = 'lcftype_draft'; // Для миграции

// =========================================================
// Лимиты
// =========================================================

const MAX_DRAFTS = 10;
const DRAFTS_WARNING_THRESHOLD = 7;

// =========================================================
// Состояние приложения
// =========================================================

const state = {
  view: 'feed',
  articles: [],
  draft: null,           // Текущий редактируемый черновик (объект)
  activeDraftId: null,   // ID текущего открытого черновика
  currentId: null,
  profile: null,
  search: '',
  authorFilter: new Set(),
  pendingImageInsertIndex: null,
  sortOrder: 'desc',
  hasDraft: false        // Есть ли непустые черновики
};

let activeBlockEl = null;


// =========================================================
// Toast
// =========================================================

function showToast(msg) {
  const t = document.getElementById('toast');

  if (!t) {
    console.log(msg);
    return;
  }

  t.textContent = msg;
  t.classList.add('show');

  clearTimeout(showToast._timer);

  showToast._timer = setTimeout(
    () => t.classList.remove('show'),
    2500
  );
}


// =========================================================
// Дата
// =========================================================

function fmtDate(iso) {
  return iso
    ? new Date(iso).toLocaleDateString(
        'ru-RU',
        {
          day: 'numeric',
          month: 'long',
          year: 'numeric'
        }
      )
    : '';
}

function fmtDateShort(iso) {
  if (!iso) return '';
  
  const date = new Date(iso);
  const now = new Date();
  const diff = now - date;
  const oneDay = 24 * 60 * 60 * 1000;
  const oneWeek = 7 * oneDay;
  
  if (diff < oneDay) {
    return 'сегодня, ' + date.toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit'
    });
  } else if (diff < 2 * oneDay) {
    return 'вчера, ' + date.toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit'
    });
  } else if (diff < oneWeek) {
    const days = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
    return days[date.getDay()] + ', ' + date.toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit'
    });
  } else {
    return date.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  }
}


// =========================================================
// Экранирование HTML
// =========================================================

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s ?? '';
  return d.innerHTML;
}


// =========================================================
// Разрешённые HTML-теги для текста статьи
// =========================================================

const ALLOWED_TAGS = new Set([
  'B',
  'STRONG',
  'I',
  'EM',
  'U',
  'BR',
  'SPAN',
  'DIV',
  'CODE',
  'BLOCKQUOTE',
  'S',
  'STRIKE'
]);


// =========================================================
// Очистка HTML
// =========================================================

function sanitizeHtml(html) {
  const doc = document.createElement('div');

  doc.innerHTML = html || '';

  (function clean(node) {
    [...node.childNodes].forEach(child => {
      if (child.nodeType === 1) {
        // Разрешаем SPAN только если у него есть класс tg-spoiler
        if (child.tagName === 'SPAN') {
          const isSpoiler = child.classList.contains('tg-spoiler');
          if (!isSpoiler) {
            const p = child.parentNode;
            while (child.firstChild) {
              p.insertBefore(child.firstChild, child);
            }
            p.removeChild(child);
            return;
          }
          // Разрешаем SPAN.tg-spoiler, но удаляем все другие атрибуты
          [...child.attributes].forEach(
            a => {
              if (a.name !== 'class') {
                child.removeAttribute(a.name);
              }
            }
          );
          clean(child);
          return;
        }

        if (!ALLOWED_TAGS.has(child.tagName)) {
          const p = child.parentNode;

          while (child.firstChild) {
            p.insertBefore(
              child.firstChild,
              child
            );
          }

          p.removeChild(child);

          return;
        }

        // Удаляем все атрибуты у разрешенных тегов, кроме class у SPAN
        [...child.attributes].forEach(
          a => {
            if (child.tagName === 'SPAN' && a.name === 'class') {
              // Сохраняем класс только если это tg-spoiler
              if (!child.classList.contains('tg-spoiler')) {
                child.removeAttribute(a.name);
              }
            } else {
              child.removeAttribute(a.name);
            }
          }
        );

        clean(child);

      } else if (child.nodeType !== 3) {
        child.parentNode.removeChild(child);
      }
    });
  })(doc);

  return doc.innerHTML;
}


// =========================================================
// Telegram BackButton
// =========================================================

function setBackButton(
  show,
  onClick
) {
  if (!tg?.BackButton) {
    return;
  }

  try {
    if (
      setBackButton._last &&
      tg.BackButton.offClick
    ) {
      tg.BackButton.offClick(
        setBackButton._last
      );
    }

    if (show) {
      tg.BackButton.show();

      if (tg.BackButton.onClick) {
        tg.BackButton.onClick(onClick);

        setBackButton._last = onClick;
      }

    } else {
      tg.BackButton.hide();

      setBackButton._last = null;
    }

  } catch (e) {
    console.warn(
      'BackButton:',
      e
    );
  }
}


// =========================================================
// ЧЕРНОВИКИ — НОВАЯ СИСТЕМА
// =========================================================

// ---------------------------------------------------------
// Вспомогательные функции
// ---------------------------------------------------------

function generateDraftId() {
  return 'draft_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
}

function countWords(text) {
  if (!text) return 0;
  const clean = text.replace(/<[^>]+>/g, ' ').trim();
  if (!clean) return 0;
  return clean.split(/\s+/).length;
}

function countImages(blocks) {
  if (!blocks || !Array.isArray(blocks)) return 0;
  return blocks.filter(b => b.type === 'image' && b.src).length;
}

function isEmptyDraft(draft) {
  if (!draft) return true;
  
  const hasTitle = draft.title && draft.title.trim().length > 0;
  const hasCover = draft.cover && draft.cover.trim().length > 0;
  const hasContent = draft.blocks && draft.blocks.some(b => {
    if (b.type === 'text' && b.html && b.html.replace(/<[^>]+>/g, '').trim()) {
      return true;
    }
    if (b.type === 'image' && b.src) {
      return true;
    }
    return false;
  });
  
  return !(hasTitle || hasCover || hasContent);
}

function createEmptyDraft() {
  return {
    id: generateDraftId(),
    title: '',
    cover: null,
    blocks: [{ type: 'text', html: '' }],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

// ---------------------------------------------------------
// Получить все черновики из localStorage
// ---------------------------------------------------------

function getDraftsFromStorage() {
  try {
    const saved = localStorage.getItem(DRAFTS_STORAGE_KEY);
    if (!saved) return [];
    
    const data = JSON.parse(saved);
    if (!data || !Array.isArray(data.drafts)) return [];
    
    return data.drafts;
  } catch (e) {
    console.warn('getDraftsFromStorage error:', e);
    return [];
  }
}

// ---------------------------------------------------------
// Сохранить черновики в localStorage
// ---------------------------------------------------------

function saveDraftsToStorage(drafts) {
  try {
    if (!Array.isArray(drafts)) return;
    
    const data = {
      drafts: drafts,
      updatedAt: new Date().toISOString()
    };
    
    localStorage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn('saveDraftsToStorage error:', e);
  }
}

// ---------------------------------------------------------
// Получить черновик по ID
// ---------------------------------------------------------

function getDraftById(id) {
  const drafts = getDraftsFromStorage();
  return drafts.find(d => d.id === id) || null;
}

// ---------------------------------------------------------
// Сохранить черновик (создать или обновить)
// ---------------------------------------------------------

function saveDraft(draft) {
  if (!draft) return false;
  
  let drafts = getDraftsFromStorage();
  const index = drafts.findIndex(d => d.id === draft.id);
  
  // Обновляем дату
  draft.updatedAt = new Date().toISOString();
  
  // Если черновик пустой и это не новый — возможно, его стоит удалить?
  // Но мы не удаляем пустые черновики автоматически, пользователь сам решает
  
  if (index >= 0) {
    drafts[index] = draft;
  } else {
    // Проверяем лимит
    if (drafts.length >= MAX_DRAFTS) {
      showToast('Достигнут лимит черновиков (10). Удалите ненужные.');
      return false;
    }
    drafts.push(draft);
  }
  
  saveDraftsToStorage(drafts);
  return true;
}

// ---------------------------------------------------------
// Удалить черновик по ID
// ---------------------------------------------------------

function deleteDraftById(id) {
  if (!id) return false;
  
  let drafts = getDraftsFromStorage();
  const filtered = drafts.filter(d => d.id !== id);
  
  if (filtered.length === drafts.length) {
    // Черновик не найден
    return false;
  }
  
  saveDraftsToStorage(filtered);
  
  // Если удалили активный черновик — сбрасываем
  if (state.activeDraftId === id) {
    state.activeDraftId = null;
    state.draft = null;
  }
  
  return true;
}

// ---------------------------------------------------------
// Создать новый черновик
// ---------------------------------------------------------

function createNewDraft() {
  const drafts = getDraftsFromStorage();
  
  // Проверяем лимит
  if (drafts.length >= MAX_DRAFTS) {
    showToast('Достигнут лимит черновиков (10). Удалите ненужные.');
    return null;
  }
  
  // Проверяем предупреждение
  if (drafts.length >= DRAFTS_WARNING_THRESHOLD) {
    const remaining = MAX_DRAFTS - drafts.length;
    showToast('Осталось ' + remaining + ' место для черновиков. Чтобы создать новый, удалите старые.');
  }
  
  const draft = createEmptyDraft();
  drafts.push(draft);
  saveDraftsToStorage(drafts);
  
  return draft;
}

// ---------------------------------------------------------
// Получить количество черновиков
// ---------------------------------------------------------

function countDrafts() {
  return getDraftsFromStorage().length;
}

// ---------------------------------------------------------
// Проверить, есть ли непустые черновики
// ---------------------------------------------------------

function hasNonEmptyDrafts() {
  const drafts = getDraftsFromStorage();
  return drafts.some(d => !isEmptyDraft(d));
}

// ---------------------------------------------------------
// МИГРАЦИЯ из старого формата
// ---------------------------------------------------------

function migrateOldDraft() {
  try {
    const oldDraft = localStorage.getItem(OLD_DRAFT_STORAGE_KEY);
    if (!oldDraft) return false;
    
    const parsed = JSON.parse(oldDraft);
    if (!parsed || !parsed.title && !parsed.blocks) {
      // Старый черновик пустой — просто удаляем ключ
      localStorage.removeItem(OLD_DRAFT_STORAGE_KEY);
      return false;
    }
    
    // Проверяем, есть ли уже черновики в новой системе
    const drafts = getDraftsFromStorage();
    
    // Проверяем, не был ли уже мигрирован этот черновик
    const alreadyMigrated = drafts.some(d => 
      d.title === parsed.title && 
      JSON.stringify(d.blocks) === JSON.stringify(parsed.blocks)
    );
    
    if (alreadyMigrated) {
      localStorage.removeItem(OLD_DRAFT_STORAGE_KEY);
      return false;
    }
    
    // Создаём новый черновик из старого
    const newDraft = {
      id: generateDraftId(),
      title: parsed.title || '',
      cover: parsed.cover || null,
      blocks: parsed.blocks || [{ type: 'text', html: '' }],
      createdAt: parsed.savedAt || new Date().toISOString(),
      updatedAt: parsed.savedAt || new Date().toISOString()
    };
    
    // Добавляем в список
    drafts.push(newDraft);
    saveDraftsToStorage(drafts);
    
    // Удаляем старый ключ
    localStorage.removeItem(OLD_DRAFT_STORAGE_KEY);
    
    return true;
  } catch (e) {
    console.warn('migrateOldDraft error:', e);
    return false;
  }
}

// ---------------------------------------------------------
// ПОИСК ЧЕРНОВИКА ПО АКТИВНОМУ ID
// ---------------------------------------------------------

function getActiveDraft() {
  if (!state.activeDraftId) return null;
  return getDraftById(state.activeDraftId);
}

// ---------------------------------------------------------
// УСТАНОВИТЬ АКТИВНЫЙ ЧЕРНОВИК
// ---------------------------------------------------------

function setActiveDraft(draft) {
  if (!draft) {
    state.activeDraftId = null;
    state.draft = null;
    return;
  }
  
  state.activeDraftId = draft.id;
  state.draft = draft;
}

// ---------------------------------------------------------
// СТАРЫЕ ФУНКЦИИ (для обратной совместимости, помечены как deprecated)
// ---------------------------------------------------------

// DEPRECATED: Используйте getDraftsFromStorage() и getDraftById()
function loadDraftFromStorage() {
  // Пытаемся загрузить активный черновик
  const draft = getActiveDraft();
  if (draft) {
    state.hasDraft = !isEmptyDraft(draft);
    return draft;
  }
  
  // Если нет активного, но есть черновики — берём первый
  const drafts = getDraftsFromStorage();
  if (drafts.length > 0) {
    const first = drafts[0];
    state.activeDraftId = first.id;
    state.draft = first;
    state.hasDraft = !isEmptyDraft(first);
    return first;
  }
  
  state.hasDraft = false;
  return null;
}

// DEPRECATED: Используйте saveDraft()
function saveDraftToStorage(draft) {
  if (!draft) {
    // Если передали null — не делаем ничего
    return;
  }
  saveDraft(draft);
  state.hasDraft = !isEmptyDraft(draft);
}

// DEPRECATED: Используйте deleteDraftById()
function clearDraft() {
  if (state.activeDraftId) {
    deleteDraftById(state.activeDraftId);
  }
  state.draft = null;
  state.activeDraftId = null;
  state.hasDraft = false;
}

// DEPRECATED: Используйте hasNonEmptyDrafts()
function hasSavedDraft() {
  return hasNonEmptyDrafts();
}

// DEPRECATED: Используйте isEmptyDraft()
function isDraftEmpty(draft) {
  return isEmptyDraft(draft);
}
