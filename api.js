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
