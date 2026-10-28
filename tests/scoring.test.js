const { describe, it } = require('node:test');
const assert = require('node:assert');
const {
  classifyScore,
  calculateDomainScore,
  scoreAssessment
} = require('../server/scoring');
const questionBank = require('../data/questionBank.json');

describe('Wheel of Life Scoring Engine Tests', () => {

  describe('Band Classification Logic', () => {
    it('correctly classifies score 1.0 as Needs Attention', () => {
      const band = classifyScore(1.0);
      assert.strictEqual(band.key, 'needs_attention');
      assert.strictEqual(band.label, 'Needs Attention');
    });

    it('correctly classifies score 3.9 as Needs Attention', () => {
      const band = classifyScore(3.9);
      assert.strictEqual(band.key, 'needs_attention');
    });

    it('unrounded classification: 3.96 is classified as Needs Attention even though it rounds to 4.0', () => {
      // PRD 5.2: "Interpretation bands must use the unrounded score to avoid classification errors."
      const band = classifyScore(3.96);
      assert.strictEqual(band.key, 'needs_attention');
    });

    it('correctly classifies score 4.0 as Developing', () => {
      const band = classifyScore(4.0);
      assert.strictEqual(band.key, 'developing');
      assert.strictEqual(band.label, 'Developing');
    });

    it('correctly classifies score 6.9 as Developing', () => {
      const band = classifyScore(6.9);
      assert.strictEqual(band.key, 'developing');
    });

    it('unrounded classification: 6.96 is classified as Developing even though it rounds to 7.0', () => {
      const band = classifyScore(6.96);
      assert.strictEqual(band.key, 'developing');
    });

    it('correctly classifies score 7.0 as Strong Foundation', () => {
      const band = classifyScore(7.0);
      assert.strictEqual(band.key, 'strong_foundation');
      assert.strictEqual(band.label, 'Strong Foundation');
    });

    it('correctly classifies maximum score 10.0 as Strong Foundation', () => {
      const band = classifyScore(10.0);
      assert.strictEqual(band.key, 'strong_foundation');
    });

    it('handles null/undefined gracefully as Not Applicable', () => {
      const band = classifyScore(null);
      assert.strictEqual(band.key, 'not_assessed');
    });
  });

  describe('Single Domain Scoring', () => {
    const spiritualityPath = questionBank.paths[0]; // 5 questions

    it('calculates exact arithmetic mean of 5 valid responses', () => {
      const answers = {
        spirituality_1: 8,
        spirituality_2: 6,
        spirituality_3: 7,
        spirituality_4: 9,
        spirituality_5: 5
      };
      // Sum = 8 + 6 + 7 + 9 + 5 = 35. Mean = 35 / 5 = 7.0
      const result = calculateDomainScore(spiritualityPath, answers);
      assert.strictEqual(result.rawScore, 7.0);
      assert.strictEqual(result.displayScore, 7.0);
      assert.strictEqual(result.band.key, 'strong_foundation');
      assert.strictEqual(result.validResponsesCount, 5);
      assert.strictEqual(result.isNA, false);
    });

    it('handles floating point scores with proper 1-decimal rounding for display', () => {
      const answers = {
        spirituality_1: 8,
        spirituality_2: 7,
        spirituality_3: 7,
        spirituality_4: 6,
        spirituality_5: 8
      };
      // Sum = 36. Mean = 36 / 5 = 7.2
      const result = calculateDomainScore(spiritualityPath, answers);
      assert.strictEqual(result.rawScore, 7.2);
      assert.strictEqual(result.displayScore, 7.2);
    });

    it('handles a domain with an N/A question by averaging over remaining valid items', () => {
      const answers = {
        spirituality_1: 8,
        spirituality_2: 6,
        spirituality_3: 10,
        spirituality_4: 'NA',
        spirituality_5: 8
      };
      // Sum = 8 + 6 + 10 + 8 = 32. Mean = 32 / 4 = 8.0
      const result = calculateDomainScore(spiritualityPath, answers);
      assert.strictEqual(result.rawScore, 8.0);
      assert.strictEqual(result.displayScore, 8.0);
      assert.strictEqual(result.validResponsesCount, 4);
    });

    it('handles an entire path marked as Not Applicable', () => {
      const marriagePath = questionBank.paths[2];
      const result = calculateDomainScore(marriagePath, 'NA');
      assert.strictEqual(result.isNA, true);
      assert.strictEqual(result.displayScore, 'N/A');
      assert.strictEqual(result.rawScore, null);
      assert.strictEqual(result.band.key, 'not_assessed');
    });
  });

  describe('Full Assessment Scoring Rules', () => {
    it('scores all 12 paths independently and produces NO overall life score', () => {
      const allAnswers = {};
      questionBank.paths.forEach((path, idx) => {
        path.questions.forEach((q) => {
          // Assign varied scores
          allAnswers[q.id] = (idx % 10) + 1;
        });
      });

      const results = scoreAssessment(allAnswers);

      assert.strictEqual(results.totalPaths, 12);
      assert.strictEqual(results.domains.length, 12);
      // PRD Section 5.4: "The system must not combine the domain scores into a single overall life score."
      assert.strictEqual(results.hasOverallScore, false);
      assert.strictEqual(results.overallScore, undefined);
      assert.strictEqual(results.averageScore, undefined);
    });

    it('correctly handles marriage as N/A without breaking other domains', () => {
      const allAnswers = {
        marriage_isNA: true
      };
      questionBank.paths.forEach((path) => {
        if (path.id !== 'marriage') {
          path.questions.forEach((q) => {
            allAnswers[q.id] = 8;
          });
        }
      });

      const results = scoreAssessment(allAnswers);
      const marriageResult = results.domains.find(d => d.id === 'marriage');
      assert.strictEqual(marriageResult.isNA, true);
      assert.strictEqual(marriageResult.displayScore, 'N/A');

      const nonMarriage = results.domains.filter(d => d.id !== 'marriage');
      assert.strictEqual(nonMarriage.length, 11);
      nonMarriage.forEach(d => {
        assert.strictEqual(d.displayScore, 8.0);
        assert.strictEqual(d.band.key, 'strong_foundation');
      });
    });

    it('correctly identifies relative strengths and attention areas', () => {
      const allAnswers = {};
      questionBank.paths.forEach((path) => {
        const val = path.id === 'spirituality' ? 9 : path.id === 'health' ? 2 : 5;
        path.questions.forEach((q) => {
          allAnswers[q.id] = val;
        });
      });

      const results = scoreAssessment(allAnswers);
      assert.ok(results.strengths.some(s => s.id === 'spirituality'));
      assert.ok(results.attentionAreas.some(a => a.id === 'health'));
    });
  });
});

