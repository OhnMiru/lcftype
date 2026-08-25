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

const state = {
  view: 'feed',
  articles: [],
  draft: null,
  currentId: null,
  profile: null,
  search: '',
  authorFilter: new Set(),
  pendingImageInsertIndex: null,
  sortOrder: 'desc' // 'desc' — новые сначала, 'asc' — старые сначала
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
  'DIV'
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

        [...child.attributes].forEach(
          a => child.removeAttribute(a.name)
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
