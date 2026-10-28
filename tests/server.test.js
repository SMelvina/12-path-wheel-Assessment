const { describe, it } = require('node:test');
const assert = require('node:assert');
const { EventEmitter } = require('events');
const server = require('../server/server');
const questionBank = require('../data/questionBank.json');

// In-memory HTTP request simulator for sandboxed testing without TCP sockets
function testRequest(method, url, body = null) {
  return new Promise((resolve, reject) => {
    const req = new EventEmitter();
    req.method = method;
    req.url = url;
    req.headers = { host: 'localhost' };

    const res = new EventEmitter();
    let resHeaders = {};
    let resStatusCode = 200;
    let resData = '';

    res.writeHead = (status, headers) => {
      resStatusCode = status;
      if (headers) resHeaders = { ...resHeaders, ...headers };
      return res;
    };
    res.setHeader = (k, v) => { resHeaders[k.toLowerCase()] = v; };
    res.write = (chunk) => { resData += chunk; return true; };
    res.end = (chunk) => {
      if (chunk) resData += chunk;
      let parsed = resData;
      try {
        parsed = JSON.parse(resData);
      } catch (_) {}
      resolve({ statusCode: resStatusCode, headers: resHeaders, body: parsed });
    };

    // Emit request onto server
    server.emit('request', req, res);

    if (body) {
      const dataStr = typeof body === 'string' ? body : JSON.stringify(body);
      req.emit('data', Buffer.from(dataStr));
    }
    req.emit('end');
  });
}

describe('Server & Security Integration Tests (In-Memory)', () => {
  it('GET /api/assessment/config returns 12 paths without score formulas', async () => {
    const res = await testRequest('GET', '/api/assessment/config');
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.totalPaths, 12);
    assert.strictEqual(res.body.totalQuestions, 60);
    assert.strictEqual(res.body.paths.length, 12);
    // Confirm no scoring formulas or band thresholds are returned in config
    assert.strictEqual(res.body.interpretationBands, undefined);
    assert.strictEqual(res.body.scoringEngine, undefined);
  });

  it('POST /api/assessment/submit rejects incomplete assessments with 422', async () => {
    const incompleteAnswers = {
      spirituality_1: 8
      // Missing 59 questions
    };
    const res = await testRequest('POST', '/api/assessment/submit', { answers: incompleteAnswers });
    assert.strictEqual(res.statusCode, 422);
    assert.ok(res.body.error.includes('incomplete'));
    assert.ok(res.body.details.length > 0);
  });

  it('GET /api/assessment/results/:sessionId denies premature access without valid session', async () => {
    const res = await testRequest('GET', '/api/assessment/results/invalid-uuid-1234');
    assert.strictEqual(res.statusCode, 404);
    assert.ok(res.body.error.includes('Assessment results not found'));
  });

  it('POST /api/assessment/submit processes complete valid assessment and returns results', async () => {
    const validAnswers = {};
    for (const pathDef of questionBank.paths) {
      if (pathDef.id === 'marriage') {
        validAnswers['marriage_isNA'] = true;
      } else {
        for (const q of pathDef.questions) {
          validAnswers[q.id] = 8;
        }
      }
    }

    const res = await testRequest('POST', '/api/assessment/submit', { answers: validAnswers });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.success, true);
    assert.ok(res.body.sessionId);
    assert.strictEqual(res.body.results.domains.length, 12);
    assert.strictEqual(res.body.results.hasOverallScore, false);

    // Verify session retrieval
    const sessionRes = await testRequest('GET', `/api/assessment/results/${res.body.sessionId}`);
    assert.strictEqual(sessionRes.statusCode, 200);
    assert.strictEqual(sessionRes.body.success, true);
    assert.strictEqual(sessionRes.body.results.domains.length, 12);
  });

  it('GET / and static files return valid HTML, CSS, and JS', async () => {
    const htmlRes = await testRequest('GET', '/');
    assert.strictEqual(htmlRes.statusCode, 200);
    assert.ok(htmlRes.body.includes('<!DOCTYPE html>'));
    assert.ok(htmlRes.body.includes('Wheel of Life'));

    const cssRes = await testRequest('GET', '/styles.css');
    assert.strictEqual(cssRes.statusCode, 200);
    assert.ok(cssRes.body.includes('--accent-primary'));

    const jsRes = await testRequest('GET', '/app.js');
    assert.strictEqual(jsRes.statusCode, 200);
    assert.ok(jsRes.body.includes('submitAssessment'));
  });
});
