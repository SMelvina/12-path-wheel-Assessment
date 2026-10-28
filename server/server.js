/**
 * Multidimensional Wheel of Life Assessment Server
 * Built with Node.js standard library (Zero external dependencies).
 * Enforces server-side scoring confidentiality, data validation, and static asset delivery.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const questionBank = require('../data/questionBank.json');
const { scoreAssessment } = require('./scoring');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

// In-memory completed session store (anonymous, secure, session-scoped)
const completedSessions = new Map();

// Session expiry (24 hours)
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
function cleanExpiredSessions() {
  const now = Date.now();
  for (const [id, session] of completedSessions.entries()) {
    if (now - session.createdAt > SESSION_TTL_MS) {
      completedSessions.delete(id);
    }
  }
}
setInterval(cleanExpiredSessions, 60 * 60 * 1000).unref();

const MIME_TYPES = {
  '.html': 'text/html; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.js': 'application/javascript; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=UTF-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(JSON.stringify(data));
}

function parseJSONBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1e6) { // 1MB limit
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      try {
        const parsed = body ? JSON.parse(body) : {};
        resolve(parsed);
      } catch (err) {
        reject(new Error('Invalid JSON format: ' + err.message));
      }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  // Add CORS headers to all responses
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight OPTIONS requests
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  console.log(`[HTTP] ${req.method} ${pathname}`);

  // 1. API: Get Assessment Structure (Questions without scoring formulas)
  if (req.method === 'GET' && pathname === '/api/assessment/config') {
    // Deliver path and question data for rendering, without exposing formulas
    const clientConfig = {
      title: questionBank.title,
      totalPaths: questionBank.totalPaths,
      questionsPerPath: questionBank.questionsPerPath,
      totalQuestions: questionBank.totalQuestions,
      responseScale: questionBank.responseScale,
      paths: questionBank.paths.map(p => ({
        id: p.id,
        order: p.order,
        name: p.name,
        color: p.color,
        description: p.description,
        isConditional: p.isConditional || false,
        conditionalPrompt: p.conditionalPrompt || null,
        questions: p.questions.map(q => ({
          id: q.id,
          index: q.index,
          dimension: q.dimension,
          statement: q.statement
        }))
      }))
    };
    return sendJSON(res, 200, clientConfig);
  }

  // 2. API: Submit Completed Assessment & Calculate Confidential Scores
  if (req.method === 'POST' && pathname === '/api/assessment/submit') {
    try {
      const payload = await parseJSONBody(req);
      const answers = payload.answers;

      if (!answers || typeof answers !== 'object') {
        return sendJSON(res, 400, { error: 'Invalid answers payload' });
      }

      // Strict validation: check all 12 paths
      const validationErrors = [];
      let totalValidResponses = 0;

      for (const pathDef of questionBank.paths) {
        const isPathNA = answers[pathDef.id + '_isNA'] === true;

        if (isPathNA) {
          if (!pathDef.isConditional) {
            validationErrors.push(`Path '${pathDef.name}' is not marked as conditional.`);
          }
          continue;
        }

        for (const q of pathDef.questions) {
          const val = answers[q.id];
          if (val === undefined || val === null || val === '') {
            validationErrors.push(`Missing answer for question: ${pathDef.name} - ${q.dimension}`);
          } else if (val !== 'NA') {
            const numVal = Number(val);
            if (isNaN(numVal) || numVal < 1 || numVal > 10) {
              validationErrors.push(`Invalid rating (${val}) for question: ${q.dimension}. Must be between 1 and 10.`);
            } else {
              totalValidResponses++;
            }
          }
        }
      }

      if (validationErrors.length > 0) {
        return sendJSON(res, 422, {
          error: 'Assessment is incomplete or contains invalid responses.',
          details: validationErrors
        });
      }

      // Calculate scores on server
      const scoredResults = scoreAssessment(answers);

      // Create cryptographically secure session ID
      const sessionId = crypto.randomUUID();
      completedSessions.set(sessionId, {
        createdAt: Date.now(),
        results: scoredResults
      });

      return sendJSON(res, 200, {
        success: true,
        sessionId,
        results: scoredResults
      });
    } catch (err) {
      console.error('Error submitting assessment:', err);
      return sendJSON(res, 500, { error: err.message || 'Server error processing assessment' });
    }
  }

  // 3. API: Retrieve Results for a verified completed session
  if (req.method === 'GET' && pathname.startsWith('/api/assessment/results/')) {
    const sessionId = pathname.replace('/api/assessment/results/', '').trim();
    if (!sessionId || !completedSessions.has(sessionId)) {
      return sendJSON(res, 404, {
        error: 'Assessment results not found or session has expired. You must complete the assessment to view results.'
      });
    }
    const session = completedSessions.get(sessionId);
    return sendJSON(res, 200, {
      success: true,
      results: session.results
    });
  }

  // 4. Static File Server
  if (req.method === 'GET' || req.method === 'HEAD') {
    let safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
    if (safePath === '/' || safePath === '' || safePath === '/preview' || safePath === '/preview/' || safePath === 'preview') {
      safePath = '/index.html';
    } else if (safePath === '/typeform' || safePath === '/typeform/' || safePath === 'typeform' || safePath === '/survey' || safePath === '/survey/' || safePath === 'survey') {
      safePath = '/typeform.html';
    }

    const filePath = path.join(PUBLIC_DIR, safePath);

    fs.stat(filePath, (err, stats) => {
      if (err || !stats.isFile()) {
        // Fallback to index.html for client-side routing
        const indexPath = path.join(PUBLIC_DIR, 'index.html');
        fs.readFile(indexPath, (readErr, content) => {
          if (readErr) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            return res.end('404 Not Found');
          }
          res.writeHead(200, { 'Content-Type': 'text/html; charset=UTF-8' });
          return res.end(content);
        });
        return;
      }

      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';

      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0'
      });

      if (req.method === 'HEAD') {
        return res.end();
      }

      const stream = fs.createReadStream(filePath);
      stream.pipe(res);
    });
    return;
  }

  // Fallback 405 Method Not Allowed
  res.writeHead(405, { 'Content-Type': 'text/plain' });
  res.end('Method Not Allowed');
});

if (require.main === module) {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Wheel of Life Assessment server running at http://localhost:${PORT}`);
  });
}

module.exports = server;

