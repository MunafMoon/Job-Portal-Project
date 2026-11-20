import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { filtersSchema } from './jobs-query.js';

export function createApp({ service, logger = () => {}, staticDirectory = fileURLToPath(new URL('../../client/dist/', import.meta.url)) }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('query parser','simple');
  app.use(helmet());
  app.use('/api', rateLimit({
    windowMs:60000, limit:120, standardHeaders:'draft-8', legacyHeaders:false,
    message:{ error:'Too many requests. Please try again shortly.' },
  }));
  app.use('/api', (_request,response,next) => { response.set('Cache-Control','no-store'); next(); });
  app.get('/api/health', async (_request,response) => {
    try { response.json(await service.health()); }
    catch { response.status(503).json({ status:'unavailable', database:'unavailable' }); }
  });
  app.get('/api/jobs', async (request,response) => {
    const parsed = filtersSchema.safeParse(request.query);
    if (!parsed.success) return response.status(400).json({
      error:'Invalid filters. Check page, limit, keyword, role, city, type and location_type.',
    });
    response.json(await service.jobs(parsed.data));
  });
  app.get('/api/stats', async (_request,response) => response.json(await service.stats()));
  app.use('/api', (_request,response) => response.status(404).json({ error:'API endpoint not found' }));
  if (staticDirectory && existsSync(staticDirectory)) {
    app.use(express.static(staticDirectory, { index:false }));
    app.get('/{*path}', (request,response,next) => {
      if (!request.accepts('html') || /\.[a-z0-9]+$/i.test(request.path)) return next();
      response.sendFile('index.html',{root:staticDirectory});
    });
  }
  app.use((_request,response) => response.status(404).json({ error:'Not found' }));
  app.use((error,_request,response,_next) => {
    // Log no SQL, URL, credentials or untrusted error messages.
    logger({ event:'api_request_failed', error_code:'DATABASE_OR_SERVER_ERROR' });
    response.status(503).json({ error:'Job data is temporarily unavailable. Please try again.' });
  });
  return app;
}
