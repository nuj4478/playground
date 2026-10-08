// 배포 전에 프론트와 붙여보는 로컬 서버 (Function URL 흉내)
// 사용법: 루트에서 npm run dev  → http://localhost:3001/movies , /ads
import http from 'node:http';
import { handler } from './index.mjs';

const PORT = 3001;
// 로컬에서만 쓰는 CORS 헤더 (실서버에서는 Function URL 설정이 이 역할을 한다)
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT',
  'Access-Control-Allow-Headers': 'content-type, authorization',
};

http
  .createServer(async (req, res) => {
    // PUT + Authorization 헤더 요청 전에 브라우저가 보내는 사전 확인(preflight)
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS);
      return res.end();
    }

    let body = '';
    for await (const chunk of req) body += chunk;

    const url = new URL(req.url, `http://localhost:${PORT}`);
    const event = {
      rawPath: url.pathname,
      queryStringParameters: url.searchParams.size ? Object.fromEntries(url.searchParams) : undefined,
      requestContext: { http: { method: req.method } },
      headers: req.headers, // Node 는 헤더 이름을 소문자로 준다 (Function URL 과 같음)
      body,
      isBase64Encoded: false,
    };

    const out = await handler(event);
    res.writeHead(out.statusCode, { ...out.headers, ...CORS });
    res.end(out.body);
  })
  .listen(PORT, () => console.log(`local api → http://localhost:${PORT}/movies , /ads`));
