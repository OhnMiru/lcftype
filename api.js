// =========================================================
// Летопись — API / Supabase
// =========================================================


// =========================================================
// Вызов Telegram Edge Function
// =========================================================

async function callTelegramApi(
  action,
  extra = {}
) {
  if (!tg?.initData) {
    throw new Error(
      'Откройте приложение внутри Telegram'
    );
  }

  const {
    data,
    error
  } = await db.functions.invoke(
    'telegram-api',
    {
      body: {
        action,
        initData: tg.initData,
        ...extra
      }
    }
  );

  if (error) {
    throw new Error(
      error.message ||
      'Ошибка Edge Function'
    );
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  return data;
}


// =========================================================
// Лента статей
// =========================================================

async function fetchFeed() {
  const {
    data,
    error
  } = await db
    .from('articles')
    .select(
      'id,title,excerpt,cover,created_at,author_id,author_name'
    )
    .order(
      'created_at',
      {
        ascending: false
      }
    );

  if (error) {
    console.error(error);
    return [];
  }

  return data || [];
}


// =========================================================
// Одна статья
// =========================================================

async function fetchArticle(id) {
  const {
    data,
    error
  } = await db
    .from('articles')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.error(error);
    return null;
  }

  return data;
}


// =========================================================
// Загрузка изображения в Supabase Storage
// =========================================================

async function uploadImage(
  dataUrl,
  filename
) {
  const res = await fetch(dataUrl);

  const blob = await res.blob();

  const safe = String(
    filename || 'image.jpg'
  ).replace(
    /[^a-zA-Z0-9._-]/g,
    '_'
  );

  const path =
    `${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}-${safe}`;

  const {
    error
  } = await db.storage
    .from('images')
    .upload(
      path,
      blob,
      {
        contentType:
          blob.type || 'image/jpeg',
        upsert: false
      }
    );

  if (error) {
    throw error;
  }

  return db.storage
    .from('images')
    .getPublicUrl(path)
    .data.publicUrl;
}


// =========================================================
// КОММЕНТАРИИ
// =========================================================


// =========================================================
// Получить комментарии статьи
// =========================================================

async function fetchComments(articleId) {
  const r = await callTelegramApi(
    'get-article-comments',
    {
      articleId
    }
  );

  return Array.isArray(r.comments)
    ? r.comments
    : [];
}


// =========================================================
// Создать комментарий
// =========================================================

async function createComment(
  articleId,
  content,
  parentId = null
) {
  const r = await callTelegramApi(
    'create-comment',
    {
      articleId,
      content,
      parentId
    }
  );

  return r.comment;
}


// =========================================================
// Обновить комментарий (редактирование)
// =========================================================

async function updateComment(
  commentId,
  content
) {
  const r = await callTelegramApi(
    'update-comment',
    {
      commentId,
      content
    }
  );

  return r.comment;
}


// =========================================================
// Удалить комментарий
// =========================================================

async function deleteComment(commentId) {
  const r = await callTelegramApi(
    'delete-comment',
    {
      commentId
    }
  );

  return r.success;
}


// =========================================================
// Реакции на комментарии
// =========================================================


// =========================================================
// Получить реакции комментария
// =========================================================

async function fetchCommentReactions(commentId) {
  const r = await callTelegramApi(
    'get-comment-reactions',
    {
      commentId
    }
  );

  return r.reactions || {
    counts: {},
    total: 0,
    my_reaction: null
  };
}


// =========================================================
// Поставить/убрать реакцию на комментарий
// =========================================================

async function reactToComment(
  commentId,
  reactionType
) {
  const r = await callTelegramApi(
    'react-comment',
    {
      commentId,
      reactionType
    }
  );

  return r.reactions;
}


// =========================================================
// Реакции на статьи
// =========================================================


// =========================================================
// Получить реакции статьи
// =========================================================

async function fetchArticleReactions(articleId) {
  const r = await callTelegramApi(
    'get-article-reactions',
    {
      articleId
    }
  );

  return r.reactions || {
    counts: {},
    total: 0,
    my_reaction: null
  };
}


// =========================================================
// Поставить/убрать реакцию на статью
// =========================================================

async function reactToArticle(
  articleId,
  reactionType
) {
  const r = await callTelegramApi(
    'react-article',
    {
      articleId,
      reactionType
    }
  );

  return r.reactions;
}


// =========================================================
// ПРОФИЛЬ
// =========================================================


// =========================================================
// Получить профиль
// =========================================================

async function getProfile() {
  const r = await callTelegramApi('get-profile');
  return r.profile || null;
}


// =========================================================
// Сохранить профиль
// =========================================================

async function saveProfile(
  username,
  avatar = null,
  bio = null
) {
  const r = await callTelegramApi(
    'set-profile',
    {
      username,
      avatar,
      bio
    }
  );

  return r.profile;
}


// =========================================================
// Получить профиль автора (публичный)
// =========================================================

async function getPublicProfile(authorId) {
  const r = await callTelegramApi(
    'get-author-profile',
    {
      authorId
    }
  );

  return r.profile || null;
}


// =========================================================
// СТАТЬИ (дополнительные методы)
// =========================================================


// =========================================================
// Создать статью
// =========================================================

async function createArticle(article) {
  const r = await callTelegramApi(
    'create-article',
    {
      article
    }
  );

  return r.article;
}


// =========================================================
// Обновить статью
// =========================================================

async function updateArticle(article) {
  const r = await callTelegramApi(
    'update-article',
    {
      article
    }
  );

  return r.article;
}


// =========================================================
// Удалить статью
// =========================================================

async function deleteArticle(articleId) {
  const r = await callTelegramApi(
    'delete-article',
    {
      articleId
    }
  );

  return r.success;
}


// =========================================================
// Получить статьи автора
// =========================================================

async function fetchAuthorArticles(authorId) {
  const r = await callTelegramApi(
    'get-author-articles',
    {
      authorId
    }
  );

  return {
    profile: r.profile || null,
    articles: Array.isArray(r.articles) ? r.articles : []
  };
}


// =========================================================
// Получить мои статьи
// =========================================================

async function fetchMyArticles() {
  const r = await callTelegramApi('get-my-articles');
  return Array.isArray(r.articles) ? r.articles : [];
}


// =========================================================
// Получить мои комментарии
// =========================================================

async function fetchMyComments() {
  const r = await callTelegramApi('get-my-comments');
  return Array.isArray(r.comments) ? r.comments : [];
}


// =========================================================
// Получить статистику профиля
// =========================================================

async function fetchProfileStats() {
  const r = await callTelegramApi('get-profile-stats');
  return r.stats || {
    articles_count: 0,
    comments_count: 0,
    article_reactions_received: 0,
    comment_reactions_received: 0,
    total_reactions_received: 0
  };
}


// =========================================================
// ПОДПИСКИ
// =========================================================


// =========================================================
// Получить подписки пользователя
// =========================================================

async function getSubscriptions() {
  const r = await callTelegramApi('get-subscriptions');
  return Array.isArray(r.subscriptions) ? r.subscriptions : [];
}


// =========================================================
// Проверить подписку на автора
// =========================================================

async function isSubscribed(authorId) {
  const r = await callTelegramApi(
    'is-subscribed',
    {
      authorId
    }
  );

  return r.isSubscribed || false;
}


// =========================================================
// Подписаться на автора
// =========================================================

async function subscribeToAuthor(authorId) {
  const r = await callTelegramApi(
    'subscribe',
    {
      authorId
    }
  );

  return r.success;
}


// =========================================================
// Отписаться от автора
// =========================================================

async function unsubscribeFromAuthor(authorId) {
  const r = await callTelegramApi(
    'unsubscribe',
    {
      authorId
    }
  );

  return r.success;
}


// =========================================================
// ДОНАТЫ
// =========================================================


// =========================================================
// Получить настройки донатов автора
// =========================================================

async function getDonationSettings(userId) {
  try {
    const { data, error } = await db
      .from('donation_settings')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw error;
    return data || { donation_link: null, is_enabled: false };

  } catch (e) {
    console.error('getDonationSettings error:', e);
    return { donation_link: null, is_enabled: false };
  }
}


// =========================================================
// Сохранить настройки донатов
// =========================================================

async function saveDonationSettings(userId, settings) {
  const { data, error } = await db
    .from('donation_settings')
    .upsert({
      user_id: userId,
      donation_link: settings.donation_link || null,
      is_enabled: settings.is_enabled || false,
      updated_at: new Date().toISOString()
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}


// =========================================================
// Получить ссылку на донаты автора
// =========================================================

async function getDonationLink(userId) {
  const settings = await getDonationSettings(userId);
  return settings.is_enabled ? settings.donation_link : null;
}


// =========================================================
// Проверить, может ли автор принимать донаты
// =========================================================

async function canAcceptDonations(userId) {
  const settings = await getDonationSettings(userId);
  return settings.is_enabled && settings.donation_link;
}


// =========================================================
// ЗАГРУЗКА АВАТАРКИ
// =========================================================


// =========================================================
// Загрузить аватарку
// =========================================================

async function uploadAvatar(file) {
  try {
    // Используем функцию compressImageFile из editor.js
    // Если она недоступна, используем uploadImage напрямую
    let dataUrl;
    
    if (typeof compressImageFile === 'function') {
      dataUrl = await compressImageFile(file, 400, 0.9);
    } else {
      // Fallback: читаем файл как DataURL
      dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    }
    
    const url = await uploadImage(dataUrl, 'avatar.jpg');
    return url;
  } catch (e) {
    console.error('uploadAvatar error:', e);
    throw new Error('Не удалось загрузить аватарку');
  }
}


// =========================================================
// ЧЕРНОВИКИ (НЕСКОЛЬКО) — ДОПОЛНИТЕЛЬНЫЕ API
// =========================================================


// =========================================================
// Получить все черновики пользователя
// =========================================================

async function fetchMyDrafts() {
  try {
    // Черновики хранятся локально, но для синхронизации
    // между устройствами можно добавить бэкенд
    // Пока возвращаем из localStorage
    const drafts = getDraftsFromStorage();
    return drafts;
  } catch (e) {
    console.error('fetchMyDrafts error:', e);
    return [];
  }
}


// =========================================================
// Сохранить черновик на сервер (для синхронизации)
// =========================================================

async function syncDraftToServer(draft) {
  try {
    // Здесь можно добавить синхронизацию с Supabase
    // Пока просто сохраняем локально
    return saveDraft(draft);
  } catch (e) {
    console.error('syncDraftToServer error:', e);
    return false;
  }
}


// =========================================================
// Удалить черновик с сервера
// =========================================================

async function deleteDraftFromServer(draftId) {
  try {
    // Здесь можно добавить удаление с бэкенда
    // Пока просто удаляем локально
    return deleteDraftById(draftId);
  } catch (e) {
    console.error('deleteDraftFromServer error:', e);
    return false;
  }
}
