/**
 * Pure scoring and interpretation engine for the 12-Path Wheel of Life Assessment.
 * Implements PRD Section 5 and Build Brief specifications.
 * 
 * Rules:
 * - Each path score = Arithmetic mean of valid responses (1-10)
 * - Displayed scores rounded to 1 decimal place
 * - Interpretation band classification uses unrounded scores
 * - Conditional / N/A domains are handled gracefully without corrupting score averages
 * - Strictly NO overall life score combining all 12 domains
 */

const questionBank = require('../data/questionBank.json');

const BANDS = [
  {
    key: 'needs_attention',
    label: 'Needs Attention',
    min: 1.0,
    max: 3.999999,
    description: 'Responses indicate an area that may benefit from deliberate attention and development.',
    tone: 'constructive'
  },
  {
    key: 'developing',
    label: 'Developing',
    min: 4.0,
    max: 6.999999,
    description: 'Responses suggest existing foundations alongside opportunities for improvement.',
    tone: 'balanced'
  },
  {
    key: 'strong_foundation',
    label: 'Strong Foundation',
    min: 7.0,
    max: 10.0,
    description: 'Responses suggest relatively strong foundations in this area.',
    tone: 'encouraging'
  }
];

/**
 * Classifies an unrounded score into an interpretation band.
 * @param {number} rawScore
 * @returns {object} band object
 */
function classifyScore(rawScore) {
  if (rawScore === null || rawScore === undefined || isNaN(rawScore)) {
    return {
      key: 'not_assessed',
      label: 'Not Applicable',
      description: 'This area was marked as not applicable to your current circumstances.',
      color: '#94A3B8'
    };
  }

  for (const band of BANDS) {
    if (rawScore >= band.min && rawScore <= band.max) {
      return band;
    }
  }

  // Handle upper boundary precision (e.g. 10.0)
  if (rawScore >= 7.0) {
    return BANDS[2];
  }
  return BANDS[0];
}

/**
 * Calculates a single domain's score and interpretation from its responses.
 * @param {object} pathDef - The path definition from questionBank
 * @param {object|Array} pathAnswers - Map of questionId -> number | 'NA', or array of responses
 * @returns {object} Scored domain result
 */
function calculateDomainScore(pathDef, pathAnswers) {
  const questions = pathDef.questions;
  const validScores = [];
  const itemBreakdown = [];
  let isPathNA = false;

  // Check if entire path is marked N/A (e.g. Marriage for unmarried users)
  if (pathAnswers === 'NA' || (pathAnswers && pathAnswers._isNA === true)) {
    isPathNA = true;
  }

  if (!isPathNA && pathAnswers) {
    for (const q of questions) {
      const val = Array.isArray(pathAnswers) 
        ? pathAnswers[q.index - 1] 
        : pathAnswers[q.id];

      if (val === 'NA' || val === null || val === undefined) {
        itemBreakdown.push({
          questionId: q.id,
          dimension: q.dimension,
          statement: q.statement,
          score: null,
          isNA: true
        });
      } else {
        const numVal = Number(val);
        if (!isNaN(numVal) && numVal >= 1 && numVal <= 10) {
          validScores.push(numVal);
          itemBreakdown.push({
            questionId: q.id,
            dimension: q.dimension,
            statement: q.statement,
            score: numVal,
            isNA: false
          });
        }
      }
    }
  }

  if (isPathNA || validScores.length === 0) {
    return {
      id: pathDef.id,
      order: pathDef.order,
      name: pathDef.name,
      color: pathDef.color,
      description: pathDef.description,
      rawScore: null,
      displayScore: 'N/A',
      isNA: true,
      validResponsesCount: 0,
      totalQuestions: questions.length,
      band: classifyScore(null),
      reflectionPrompts: pathDef.reflectionPrompts || [],
      itemBreakdown
    };
  }

  // PRD 5.1: Domain score = Sum of valid question scores ÷ Number of valid question scores
  const sum = validScores.reduce((acc, curr) => acc + curr, 0);
  const rawScore = sum / validScores.length;
  // Displayed domain scores rounded to one decimal place (PRD 5.2)
  const displayScore = Number(rawScore.toFixed(1));
  // Interpretation band must use unrounded score to avoid classification errors (PRD 5.2)
  const band = classifyScore(rawScore);

  return {
    id: pathDef.id,
    order: pathDef.order,
    name: pathDef.name,
    color: pathDef.color,
    description: pathDef.description,
    rawScore,
    displayScore,
    isNA: false,
    validResponsesCount: validScores.length,
    totalQuestions: questions.length,
    band,
    reflectionPrompts: pathDef.reflectionPrompts || [],
    itemBreakdown
  };
}

/**
 * Calculates complete assessment results across all 12 paths.
 * Enforces PRD rule: NO OVERALL LIFE SCORE.
 * 
 * @param {object} allAnswers - { [pathId]: { [questionId]: score } } or flat question map
 * @returns {object} Complete results payload
 */
function scoreAssessment(allAnswers) {
  if (!allAnswers || typeof allAnswers !== 'object') {
    throw new Error('Assessment answers are required for scoring.');
  }

  const domainResults = [];

  for (const pathDef of questionBank.paths) {
    let pathAnswers = allAnswers[pathDef.id];

    // Support flat answer structures: { "spirituality_1": 8, ... }
    if (!pathAnswers && !allAnswers[pathDef.id + '_isNA']) {
      pathAnswers = {};
      for (const q of pathDef.questions) {
        if (allAnswers[q.id] !== undefined) {
          pathAnswers[q.id] = allAnswers[q.id];
        }
      }
    }

    if (allAnswers[pathDef.id + '_isNA'] === true) {
      pathAnswers = 'NA';
    }

    const domainScore = calculateDomainScore(pathDef, pathAnswers);
    domainResults.push(domainScore);
  }

  // Identify Strengths and Areas for Attention based on valid scored paths
  const scoredDomains = domainResults
    .filter(d => !d.isNA && d.rawScore !== null)
    .sort((a, b) => b.rawScore - a.rawScore);

  const strongFoundations = scoredDomains.filter(d => d.band.key === 'strong_foundation');
  const needsAttention = scoredDomains.filter(d => d.band.key === 'needs_attention');
  const developing = scoredDomains.filter(d => d.band.key === 'developing');

  // Relative strengths: All Strong Foundations, or top 2 highest if none >= 7.0
  let relativeStrengths = strongFoundations;
  if (relativeStrengths.length === 0 && scoredDomains.length > 0) {
    relativeStrengths = scoredDomains.slice(0, Math.min(2, scoredDomains.length));
  }

  // Areas needing attention: All Needs Attention, or bottom 2 lowest if none < 4.0
  let areasForAttention = needsAttention;
  if (areasForAttention.length === 0 && scoredDomains.length > 0) {
    areasForAttention = scoredDomains.slice(-Math.min(2, scoredDomains.length)).reverse();
  }

  return {
    completedAt: new Date().toISOString(),
    totalPaths: questionBank.totalPaths,
    assessedPathsCount: scoredDomains.length,
    domains: domainResults,
    strengths: relativeStrengths.map(d => ({
      id: d.id,
      name: d.name,
      displayScore: d.displayScore,
      band: d.band.label,
      description: d.description
    })),
    attentionAreas: areasForAttention.map(d => ({
      id: d.id,
      name: d.name,
      displayScore: d.displayScore,
      band: d.band.label,
      description: d.description
    })),
    // Explicitly guarantee no overall life score
    hasOverallScore: false
  };
}

module.exports = {
  BANDS,
  classifyScore,
  calculateDomainScore,
  scoreAssessment
};

