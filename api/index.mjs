// 박스오피스 API — Lambda 함수 하나(AWS: boxoffice), 경로로 나눠서 처리
//
//   GET  /movies?date=         → movies/handler.mjs  (KOBIS 박스오피스)
//   GET  /ads                  → ads/handler.mjs     (광고 조회)
//   PUT  /ads                  →        〃           (광고 게시, 관리자)
//   GET  /ads/history[/<id>]   →        〃           (게시 이력, 관리자)
//
// 이 파일은 "어디로 보낼지"만 정한다. 실제 일은 각 폴더의 handler 가 한다.
// 새 기능을 붙이려면: <이름>/handler.mjs 를 만들고 아래 ROUTES 에 한 줄 추가.

import { handler as movies } from './movies/handler.mjs';
import { handler as ads } from './ads/handler.mjs';

const ROUTES = {
  '/movies': movies,
  '/ads': ads,
};

export const handler = async (event) => {
  const path = (event?.rawPath ?? '/').replace(/\/+$/, '') || '/';

  for (const [prefix, run] of Object.entries(ROUTES)) {
    if (path === prefix || path.startsWith(prefix + '/')) {
      // 각 handler 는 자기 앞부분을 뗀 경로를 받는다: /ads/history → /history
      return run({ ...event, rawPath: path.slice(prefix.length) || '/' });
    }
  }

  console.warn('알 수 없는 경로', path);
  return {
    statusCode: 404,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ error: `${path} 는 없는 경로예요. /movies 또는 /ads 를 써주세요.` }),
  };
};
