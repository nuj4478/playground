// 광고 API — S3 에 광고 목록 JSON 하나(ads/config.json)를 두고 읽고 덮어쓴다
//
//   GET  /   → 현재 광고 목록 (관리자 토큰이 맞으면 숨긴 광고까지)
//   PUT  /   → 광고 목록 통째로 저장 (관리자 토큰 필수, 배열 순서 = 노출 순서)
//   (index.mjs 가 /ads 를 떼고 넘겨준다: 브라우저의 /ads → 여기서는 /)
//
// 환경 변수
//   ADMIN_TOKEN : 운영자 토큰. 없으면 저장이 전부 막힌다.
//   ADS_BUCKET  : S3 버킷 이름. 없으면 로컬 폴더(.local-store/)를 S3 대신 쓴다.
//
// 광고 노출 기간(startAt/endAt)은 보는 쪽(브라우저)이 현재 시각과 비교해 판단한다.

import { randomUUID, timingSafeEqual } from 'node:crypto';

const CONFIG_KEY = 'ads/config.json';
const MAX_ADS = 20;
const LIMITS = { title: 40, text: 100, link: 300 };
const DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/; // 2026-12-20T09:00 (타임존 없음 = 보는 사람 기준 현지 시각)

// ---------- 저장소: AWS 는 S3, 로컬은 폴더 (읽기 / 쓰기 두 가지만) ----------

const store = process.env.ADS_BUCKET ? await s3Store(process.env.ADS_BUCKET) : await folderStore();

async function s3Store(Bucket) {
  // Node.js 22 Lambda 런타임에는 AWS SDK v3 가 기본으로 들어 있어서 zip 에 넣지 않아도 된다
  const { S3Client, GetObjectCommand, PutObjectCommand } = await import('@aws-sdk/client-s3');
  const s3 = new S3Client({});
  return {
    async read(Key) {
      try {
        const res = await s3.send(new GetObjectCommand({ Bucket, Key }));
        return JSON.parse(await res.Body.transformToString());
      } catch (err) {
        if (err.name === 'NoSuchKey') return null;
        throw err;
      }
    },
    async write(Key, data) {
      await s3.send(new PutObjectCommand({
        Bucket, Key,
        Body: JSON.stringify(data, null, 2),
        ContentType: 'application/json; charset=utf-8',
      }));
    },
  };
}

async function folderStore() {
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const root = new URL('./.local-store/', import.meta.url).pathname;
  const file = (key) => path.join(root, key);
  return {
    async read(key) {
      try { return JSON.parse(await fs.readFile(file(key), 'utf8')); } catch { return null; }
    },
    async write(key, data) {
      await fs.mkdir(path.dirname(file(key)), { recursive: true });
      await fs.writeFile(file(key), JSON.stringify(data, null, 2));
    },
  };
}

// ---------- 도우미 ----------

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  body: JSON.stringify(body),
});

/** Authorization: Bearer <토큰> 이 ADMIN_TOKEN 과 같은지 (시간 차 공격을 막는 비교) */
function isAdmin(headers = {}) {
  const expected = process.env.ADMIN_TOKEN;
  const got = (headers.authorization ?? headers.Authorization ?? '').replace(/^Bearer\s+/i, '');
  if (!expected || !got) return false;
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** 들어온 광고 목록을 검사하고 정리한다. 문제가 있으면 에러 메시지를 throw */
function validate(input) {
  if (!Array.isArray(input)) throw new Error('ads 는 배열이어야 해요.');
  if (input.length > MAX_ADS) throw new Error(`광고는 최대 ${MAX_ADS}개까지예요.`);

  return input.map((ad, i) => {
    const n = i + 1;
    const title = String(ad?.title ?? '').trim();
    const text = String(ad?.text ?? '').trim();
    const link = String(ad?.link ?? '').trim();
    const startAt = String(ad?.startAt ?? '').trim();
    const endAt = String(ad?.endAt ?? '').trim();

    if (!title) throw new Error(`${n}번 광고의 제목이 비어 있어요.`);
    for (const [field, value] of Object.entries({ title, text, link })) {
      if (value.length > LIMITS[field]) throw new Error(`${n}번 광고의 ${field} 가 너무 길어요 (최대 ${LIMITS[field]}자).`);
    }
    if (link && !/^https?:\/\//i.test(link)) throw new Error(`${n}번 광고의 링크는 http:// 또는 https:// 로 시작해야 해요.`);
    for (const [label, value] of [['시작', startAt], ['종료', endAt]]) {
      if (value && !DATETIME.test(value)) throw new Error(`${n}번 광고의 ${label} 일시 형식이 잘못됐어요 (예: 2026-12-20T09:00).`);
    }
    if (startAt && endAt && startAt >= endAt) throw new Error(`${n}번 광고의 종료 일시가 시작 일시보다 빨라요.`);

    return {
      id: typeof ad.id === 'string' && ad.id ? ad.id : randomUUID(),
      title,
      text,
      link,
      active: ad.active !== false,
      ...(startAt && { startAt }),
      ...(endAt && { endAt }),
    };
  });
}

function parseBody(event) {
  const raw = event.isBase64Encoded ? Buffer.from(event.body ?? '', 'base64').toString('utf8') : event.body;
  return JSON.parse(raw || '{}');
}

// ---------- 핸들러 ----------

export const handler = async (event) => {
  const method = event?.requestContext?.http?.method ?? 'GET';
  const path = (event?.rawPath ?? '/').replace(/\/+$/, '') || '/';
  const admin = isAdmin(event?.headers);

  if (path !== '/') return json(404, { error: `/ads${path} 는 없는 경로예요.` });

  try {
    if (method === 'GET') {
      const config = (await store.read(CONFIG_KEY)) ?? { publishedAt: null, ads: [] };
      // 일반 방문자에게는 켜진 광고만, 관리자에게는 숨긴 광고까지. 기간 판단은 브라우저가 한다.
      const ads = admin ? config.ads : config.ads.filter((a) => a.active);
      return json(200, { admin, publishedAt: config.publishedAt, ads });
    }

    if (method === 'PUT') {
      if (!admin) return json(401, { error: '관리자 토큰이 맞지 않아요.' });

      let ads;
      try {
        ads = validate(parseBody(event).ads);
      } catch (err) {
        return json(400, { error: err instanceof SyntaxError ? '요청 본문이 올바른 JSON 이 아니에요.' : err.message });
      }

      const publishedAt = new Date().toISOString();
      await store.write(CONFIG_KEY, { publishedAt, ads });
      console.log(`광고 ${ads.length}개 저장 (${publishedAt})`);
      return json(200, { admin, publishedAt, ads });
    }

    return json(405, { error: `${method} 는 지원하지 않아요.` });
  } catch (err) {
    console.error(err);
    return json(500, { error: '광고 저장소에 문제가 생겼어요.' });
  }
};
