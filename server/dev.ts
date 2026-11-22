import { createServer } from 'node:http';
import handler from '../api/game.ts';

const port = Number(process.env.API_PORT || 8787);
createServer(async (req, res) => {
  if (req.url !== '/api/game') { res.writeHead(404); res.end(); return; }
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
    if (Buffer.concat(chunks).length > 65_536) { res.writeHead(413); res.end(); return; }
  }
  let body: unknown;
  try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { res.writeHead(400); res.end(); return; }
  const response = Object.assign(res, {
    status(status: number) { res.statusCode = status; return response; },
    json(value: unknown) { res.setHeader('Content-Type','application/json; charset=utf-8'); res.end(JSON.stringify(value)); },
  });
  await handler(Object.assign(req,{body}),response);
}).listen(port, () => console.log(`API local em http://localhost:${port}`));
