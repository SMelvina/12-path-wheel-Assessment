const crypto = require('crypto');
const questionBank = require('../data/questionBank.json');
const { scoreAssessment } = require('../server/scoring');

const completedSessions = new Map();

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
    if (req.body && typeof req.body === 'object') {
      return resolve(req.body);
    }
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1e6) {
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

module.exports = async function handler(req, res) {
  // Add CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  // 1. API: Get Assessment Configuration
  if (req.method === 'GET' && (pathname === '/api/assessment/config' || pathname.endsWith('/config'))) {
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

  // 2. API: Submit assessment
  if (req.method === 'POST' && (pathname === '/api/assessment/submit' || pathname.endsWith('/submit'))) {
    try {
      const body = await parseJSONBody(req);
      const answers = body.answers;

      if (!answers || typeof answers !== 'object') {
        return sendJSON(res, 400, { error: 'Invalid answers format' });
      }

      // Check validation
      for (const p of questionBank.paths) {
        const isPathNA = answers[p.id + '_isNA'] === true;
        if (!isPathNA) {
          for (const q of p.questions) {
            const val = answers[q.id];
            if (val === undefined || val === null) {
              return sendJSON(res, 422, {
                error: `Incomplete assessment: Question ${q.id} in ${p.name} was not answered.`
              });
            }
          }
        }
      }

      const scoredResults = scoreAssessment(answers, questionBank);
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
      return sendJSON(res, 500, { error: err.message || 'Server error' });
    }
  }

  // 3. API: Results by sessionId
  if (req.method === 'GET' && pathname.includes('/results/')) {
    const parts = pathname.split('/');
    const sessionId = parts[parts.length - 1];
    if (!sessionId || !completedSessions.has(sessionId)) {
      return sendJSON(res, 404, { error: 'Assessment results not found' });
    }
    const session = completedSessions.get(sessionId);
    return sendJSON(res, 200, { success: true, results: session.results });
  }

  return sendJSON(res, 404, { error: 'Not found' });
};
