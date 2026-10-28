/**
 * Wheel of Life Assessment — Client Application
 * Strict adherence to PRD & Build Brief:
 * - One question at a time
 * - Zero interim scores or leaked calculations
 * - Response retention during back/forward navigation
 * - Graceful conditional path (Marriage) N/A handling
 * - 12-segment Polar Area Wheel SVG visualisation
 * - WCAG accessible table alternative
 */

(function () {
  'use strict';

  // Detect whether we are in Design Preview Mode
  const isPreviewMode = window.location.pathname.includes('/preview') || 
                        window.location.search.includes('preview') ||
                        window.location.search.includes('mode=prototype');

  // Application State
  const state = {
    config: null,
    answers: {},
    currentPathIdx: 0,
    currentQuestionIdx: 0,
    activeView: 'welcome',
    results: null,
    sessionId: null,
    autoAdvanceTimer: null
  };

  // DOM Elements
  const elements = {
    headerStatus: document.getElementById('header-status'),
    views: {
      welcome: document.getElementById('view-welcome'),
      instructions: document.getElementById('view-instructions'),
      question: document.getElementById('view-question'),
      transition: document.getElementById('view-transition'),
      submitting: document.getElementById('view-submitting'),
      results: document.getElementById('view-results')
    },
    welcome: {
      btnStart: document.getElementById('btn-start-welcome')
    },
    instructions: {
      btnBack: document.getElementById('btn-back-instructions'),
      btnProceed: document.getElementById('btn-proceed-first-question')
    },
    question: {
      pathBadge: document.getElementById('current-path-badge'),
      pathName: document.getElementById('current-path-name'),
      questionCounter: document.getElementById('current-question-counter'),
      progressBar: document.getElementById('overall-progress-bar'),
      progressFill: document.getElementById('progress-fill'),
      overallCounterText: document.getElementById('overall-counter-text'),
      dimensionTag: document.getElementById('current-dimension-tag'),
      statementText: document.getElementById('current-statement-text'),
      scaleBtns: document.querySelectorAll('.rating-pill, .scale-btn'),
      activeAnchorBox: document.getElementById('active-anchor-box'),
      validationError: document.getElementById('question-validation-error'),
      conditionalBanner: document.getElementById('conditional-path-banner'),
      conditionalText: document.getElementById('conditional-banner-text'),
      btnSkipConditional: document.getElementById('btn-skip-conditional'),
      btnPrev: document.getElementById('btn-prev-question'),
      btnNext: document.getElementById('btn-next-question')
    },
    transition: {
      title: document.getElementById('transition-completed-title'),
      message: document.getElementById('transition-message'),
      btnContinue: document.getElementById('btn-continue-transition')
    },
    results: {
      dateDisplay: document.getElementById('results-date-display'),
      wheelSvgContainer: document.getElementById('svg-wheel-container'),
      legendContainer: document.getElementById('chart-legend-container'),
      tableBody: document.getElementById('results-table-body'),
      btnPrint: document.getElementById('btn-print-results'),
      btnRetake: document.getElementById('btn-retake-assessment')
    },
    modal: {
      backdrop: document.getElementById('modal-skip-marriage'),
      btnCancel: document.getElementById('modal-skip-cancel'),
      btnConfirm: document.getElementById('modal-skip-confirm')
    }
  };

  // Scale Anchor Descriptions
  const SCALE_DESCRIPTIONS = {
    1: 'Not at all true of me / rarely true',
    2: 'Not at all true of me / rarely true',
    3: 'Seldom true of me',
    4: 'Seldom true of me',
    5: 'Sometimes or partly true of me',
    6: 'Sometimes or partly true of me',
    7: 'Often true of me',
    8: 'Often true of me',
    9: 'Consistently true of me',
    10: 'Consistently true of me'
  };

  /**
   * Switches visible view panel
   */
  function switchView(viewName) {
    state.activeView = viewName;
    Object.keys(elements.views).forEach(name => {
      elements.views[name].classList.toggle('active', name === viewName);
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Update header status
    if (viewName === 'welcome') {
      elements.headerStatus.textContent = 'Welcome';
    } else if (viewName === 'instructions') {
      elements.headerStatus.textContent = 'Instructions';
    } else if (viewName === 'question') {
      const pathNum = state.currentPathIdx + 1;
      const totalPaths = state.config ? state.config.totalPaths : 12;
      elements.headerStatus.textContent = `Path ${pathNum} of ${totalPaths}`;
    } else if (viewName === 'transition') {
      elements.headerStatus.textContent = 'Path Completed';
    } else if (viewName === 'submitting') {
      elements.headerStatus.textContent = 'Processing...';
    } else if (viewName === 'results') {
      elements.headerStatus.textContent = 'Your Results';
    }
  }

  /**
   * Client-side scoring engine (used as reliable fallback if server connection drops)
   */
  const BANDS = [
    {
      key: 'needs_attention',
      label: 'Needs Attention',
      min: 1.0,
      max: 3.999999,
      description: 'Responses indicate an area that may benefit from deliberate attention and development.'
    },
    {
      key: 'developing',
      label: 'Developing',
      min: 4.0,
      max: 6.999999,
      description: 'Responses suggest existing foundations alongside opportunities for improvement.'
    },
    {
      key: 'strong_foundation',
      label: 'Strong Foundation',
      min: 7.0,
      max: 10.0,
      description: 'Responses suggest relatively strong foundations in this area.'
    }
  ];

  function clientClassifyScore(rawScore) {
    if (rawScore === null || rawScore === undefined || isNaN(rawScore)) {
      return {
        key: 'not_assessed',
        label: 'Not Applicable',
        description: 'This area was marked as not applicable to your current circumstances.'
      };
    }
    for (const b of BANDS) {
      if (rawScore >= b.min && rawScore <= b.max) return b;
    }
    return rawScore >= 7.0 ? BANDS[2] : BANDS[0];
  }

  function clientScoreAssessment(answers, config) {
    const domainResults = [];
    for (const pathDef of config.paths) {
      const isPathNA = answers[pathDef.id + '_isNA'] === true;
      const validScores = [];
      const itemBreakdown = [];

      for (const q of pathDef.questions) {
        const val = answers[q.id];
        if (val === 'NA' || val === null || val === undefined || isPathNA) {
          itemBreakdown.push({ questionId: q.id, dimension: q.dimension, statement: q.statement, score: null, isNA: true });
        } else {
          const num = Number(val);
          if (!isNaN(num) && num >= 1 && num <= 10) {
            validScores.push(num);
            itemBreakdown.push({ questionId: q.id, dimension: q.dimension, statement: q.statement, score: num, isNA: false });
          }
        }
      }

      if (isPathNA || validScores.length === 0) {
        domainResults.push({
          id: pathDef.id,
          order: pathDef.order,
          name: pathDef.name,
          color: pathDef.color,
          description: pathDef.description,
          rawScore: null,
          displayScore: 'N/A',
          isNA: true,
          validResponsesCount: 0,
          totalQuestions: pathDef.questions.length,
          band: clientClassifyScore(null),
          reflectionPrompts: pathDef.reflectionPrompts || [],
          itemBreakdown
        });
      } else {
        const sum = validScores.reduce((a, b) => a + b, 0);
        const rawScore = sum / validScores.length;
        const displayScore = Number(rawScore.toFixed(1));
        const band = clientClassifyScore(rawScore);
        domainResults.push({
          id: pathDef.id,
          order: pathDef.order,
          name: pathDef.name,
          color: pathDef.color,
          description: pathDef.description,
          rawScore,
          displayScore,
          isNA: false,
          validResponsesCount: validScores.length,
          totalQuestions: pathDef.questions.length,
          band,
          reflectionPrompts: pathDef.reflectionPrompts || [],
          itemBreakdown
        });
      }
    }

    const scoredDomains = domainResults.filter(d => !d.isNA && d.rawScore !== null).sort((a, b) => b.rawScore - a.rawScore);
    const strongFoundations = scoredDomains.filter(d => d.band.key === 'strong_foundation');
    const needsAttention = scoredDomains.filter(d => d.band.key === 'needs_attention');

    let relativeStrengths = strongFoundations;
    if (relativeStrengths.length === 0 && scoredDomains.length > 0) {
      relativeStrengths = scoredDomains.slice(0, Math.min(2, scoredDomains.length));
    }

    let areasForAttention = needsAttention;
    if (areasForAttention.length === 0 && scoredDomains.length > 0) {
      areasForAttention = scoredDomains.slice(-Math.min(2, scoredDomains.length)).reverse();
    }

    return {
      completedAt: new Date().toISOString(),
      totalPaths: config.totalPaths,
      assessedPathsCount: scoredDomains.length,
      domains: domainResults,
      strengths: relativeStrengths.map(d => ({ id: d.id, name: d.name, displayScore: d.displayScore, band: d.band.label, description: d.description })),
      attentionAreas: areasForAttention.map(d => ({ id: d.id, name: d.name, displayScore: d.displayScore, band: d.band.label, description: d.description })),
      hasOverallScore: false
    };
  }

  /**
   * Persists progress to localStorage
   */
  function persistProgress() {
    try {
      localStorage.setItem('wol_assessment_answers', JSON.stringify(state.answers));
      localStorage.setItem('wol_assessment_step', JSON.stringify({
        pathIdx: state.currentPathIdx,
        questionIdx: state.currentQuestionIdx
      }));
    } catch (_) {}
  }

  /**
   * Restores progress from localStorage
   */
  function restoreProgress() {
    try {
      const savedAnswers = localStorage.getItem('wol_assessment_answers');
      if (savedAnswers) {
        state.answers = JSON.parse(savedAnswers);
      }
      const savedStep = localStorage.getItem('wol_assessment_step');
      if (savedStep) {
        const step = JSON.parse(savedStep);
        if (step.pathIdx !== undefined && step.questionIdx !== undefined) {
          state.currentPathIdx = step.pathIdx;
          state.currentQuestionIdx = step.questionIdx;
        }
      }
    } catch (_) {}
  }

  /**
   * Initializes assessment configuration from server
   */
  async function init() {
    try {
      const response = await fetch('/api/assessment/config');
      if (!response.ok) {
        throw new Error('Failed to load assessment configuration');
      }
      state.config = await response.json();
      restoreProgress();
      setupEventListeners();
    } catch (err) {
      console.error(err);
      alert('Unable to load assessment questions. Please refresh the page.');
    }
  }

  /**
   * Attaches event handlers
   */
  function setupEventListeners() {
    // Welcome flow
    elements.welcome.btnStart.addEventListener('click', () => switchView('instructions'));

    // Instructions flow
    elements.instructions.btnBack.addEventListener('click', () => switchView('welcome'));
    elements.instructions.btnProceed.addEventListener('click', () => {
      state.currentPathIdx = 0;
      state.currentQuestionIdx = 0;
      renderCurrentQuestion();
      switchView('question');
      const card = document.getElementById('question-card-inner');
      if (card) {
        card.classList.remove('slide-enter-bottom', 'slide-enter-top', 'slide-exit-up', 'slide-exit-down');
        card.classList.add('slide-enter-bottom');
        setTimeout(() => card.classList.remove('slide-enter-bottom'), 300);
      }
    });

    // Rating buttons selection
    elements.question.scaleBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const val = parseInt(btn.getAttribute('data-value'), 10);
        selectRating(val);
      });
    });

    // Keyboard support for 1-9, 0 (for 10), Enter and arrows
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      if (state.activeView === 'question') {
        if (e.key >= '1' && e.key <= '9') {
          selectRating(parseInt(e.key, 10));
        } else if (e.key === '0') {
          selectRating(10);
        } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
          goToNextQuestion();
        } else if (e.key === 'ArrowLeft') {
          goToPrevQuestion();
        }
      } else if (state.activeView === 'transition' && (e.key === 'Enter' || e.key === 'ArrowRight')) {
        renderCurrentQuestion();
        switchView('question');
      } else if (state.activeView === 'instructions' && e.key === 'Enter') {
        state.currentPathIdx = 0;
        state.currentQuestionIdx = 0;
        renderCurrentQuestion();
        switchView('question');
      }
    });

    // Navigation buttons
    elements.question.btnNext.addEventListener('click', goToNextQuestion);
    elements.question.btnPrev.addEventListener('click', goToPrevQuestion);

    // Custom In-Screen Modal for Marriage Skip
    elements.question.btnSkipConditional.addEventListener('click', () => {
      elements.modal.backdrop.style.display = 'flex';
    });

    elements.modal.btnCancel.addEventListener('click', () => {
      elements.modal.backdrop.style.display = 'none';
    });

    elements.modal.btnConfirm.addEventListener('click', () => {
      elements.modal.backdrop.style.display = 'none';
      if (state.autoAdvanceTimer) {
        clearTimeout(state.autoAdvanceTimer);
        state.autoAdvanceTimer = null;
      }
      const currentPath = state.config.paths[state.currentPathIdx];
      state.answers[currentPath.id + '_isNA'] = true;
      advanceToNextPath();
    });

    // Transition continue
    elements.transition.btnContinue.addEventListener('click', () => {
      renderCurrentQuestion();
      switchView('question');
      const card = document.getElementById('question-card-inner');
      if (card) {
        card.classList.remove('slide-enter-bottom', 'slide-enter-top', 'slide-exit-up', 'slide-exit-down');
        card.classList.add('slide-enter-bottom');
        setTimeout(() => card.classList.remove('slide-enter-bottom'), 300);
      }
    });

    // Results actions
    elements.results.btnPrint.addEventListener('click', () => window.print());
    elements.results.btnRetake.addEventListener('click', resetAssessment);

    // Setup Design Preview Mode Controls if active
    if (isPreviewMode) {
      const banner = document.getElementById('preview-mode-banner');
      if (banner) banner.style.display = 'flex';

      const jumpWelcome = document.getElementById('jump-welcome');
      if (jumpWelcome) jumpWelcome.addEventListener('click', () => switchView('welcome'));

      const jumpInstructions = document.getElementById('jump-instructions');
      if (jumpInstructions) jumpInstructions.addEventListener('click', () => switchView('instructions'));

      const jumpQuestion = document.getElementById('jump-question');
      if (jumpQuestion) jumpQuestion.addEventListener('click', () => {
        state.currentPathIdx = 0;
        state.currentQuestionIdx = 0;
        renderCurrentQuestion();
        switchView('question');
      });

      const jumpResults = document.getElementById('jump-results');
      if (jumpResults) jumpResults.addEventListener('click', () => {
        if (!state.config) return;
        state.config.paths.forEach((p, pIdx) => {
          p.questions.forEach((q, qIdx) => {
            if (state.answers[q.id] === undefined) {
              state.answers[q.id] = ((pIdx * 2 + qIdx) % 6) + 5; // values between 5 and 10
            }
          });
        });
        const results = clientScoreAssessment(state.answers, state.config);
        state.results = results;
        renderResultsDashboard(results);
        switchView('results');
      });
    }
  }

  /**
   * Selects a rating value for the active question
   */
  function selectRating(val, triggerAutoAdvance = true) {
    const currentPath = state.config.paths[state.currentPathIdx];
    const currentQ = currentPath.questions[state.currentQuestionIdx];

    state.answers[currentQ.id] = val;
    persistProgress();

    // Highlight selected button
    elements.question.scaleBtns.forEach(btn => {
      const btnVal = parseInt(btn.getAttribute('data-value'), 10);
      btn.classList.toggle('selected', btnVal === val);
      btn.setAttribute('aria-checked', btnVal === val ? 'true' : 'false');
    });

    // Update verbal anchor description
    elements.question.activeAnchorBox.classList.add('has-selection');
    elements.question.activeAnchorBox.innerHTML = `<strong>${val} / 10</strong> &mdash; <em>${SCALE_DESCRIPTIONS[val]}</em>`;

    // Hide any validation message
    elements.question.validationError.style.display = 'none';

    // Clear any active auto-advance timer
    if (state.autoAdvanceTimer) {
      clearTimeout(state.autoAdvanceTimer);
      state.autoAdvanceTimer = null;
    }

    // Auto-advance after 500ms (0.5s) dwell delay even if user doesn't click Next,
    // while still allowing immediate advance via clicking Next or pressing Enter
    if (triggerAutoAdvance) {
      state.autoAdvanceTimer = setTimeout(() => {
        state.autoAdvanceTimer = null;
        goToNextQuestion();
      }, 500);
    }
  }

  /**
   * Renders the current question onto the interface
   */
  function renderCurrentQuestion() {
    const currentPath = state.config.paths[state.currentPathIdx];
    const currentQ = currentPath.questions[state.currentQuestionIdx];

    // Total questions progress calculation
    const totalQCount = state.config.totalQuestions;
    const currentOverallNum = (state.currentPathIdx * state.config.questionsPerPath) + (state.currentQuestionIdx + 1);
    const progressPercent = (currentOverallNum / totalQCount) * 100;

    // Header info
    elements.question.pathBadge.textContent = `${String(state.currentPathIdx + 1).padStart(2, '0')} / ${state.config.totalPaths}`;
    elements.question.pathName.textContent = currentPath.name;
    elements.question.questionCounter.textContent = `Question ${state.currentQuestionIdx + 1} of ${currentPath.questions.length}`;

    // Progress bar
    elements.question.progressFill.style.width = `${progressPercent}%`;
    elements.question.progressBar.setAttribute('aria-valuenow', currentOverallNum);

    // Question statement & dimension
    elements.question.dimensionTag.textContent = currentQ.dimension;
    elements.question.statementText.textContent = `“${currentQ.statement}”`;

    // Handle Conditional Banner (Path 3: Marriage)
    if (currentPath.isConditional) {
      elements.question.conditionalBanner.style.display = 'flex';
      elements.question.conditionalText.textContent = currentPath.conditionalPrompt || 
        'This path evaluates marital relationship health.';
    } else {
      elements.question.conditionalBanner.style.display = 'none';
    }

    // Restore previously selected answer if present without auto-advancing
    const existingVal = state.answers[currentQ.id];
    if (existingVal !== undefined && existingVal !== null) {
      selectRating(existingVal, false);
    } else {
      // Clear selection
      elements.question.scaleBtns.forEach(btn => {
        btn.classList.remove('selected');
        btn.setAttribute('aria-checked', 'false');
      });
      elements.question.activeAnchorBox.classList.remove('has-selection');
      elements.question.activeAnchorBox.innerHTML = '<span class="feedback-placeholder">Select a rating that reflects your recent experience.</span>';
    }

    elements.question.validationError.style.display = 'none';

    // Previous button label / disabled state
    if (state.currentPathIdx === 0 && state.currentQuestionIdx === 0) {
      elements.question.btnPrev.textContent = '← Instructions';
    } else {
      elements.question.btnPrev.textContent = '← Previous';
    }
  }

  let isNavigating = false;

  /**
   * Smooth Typeform-style directional slide transition between questions
   */
  function transitionQuestion(direction, updateFn) {
    if (isNavigating) return;
    const card = document.getElementById('question-card-inner');
    if (!card) {
      updateFn();
      return;
    }

    isNavigating = true;
    const exitClass = direction > 0 ? 'slide-exit-up' : 'slide-exit-down';
    const enterClass = direction > 0 ? 'slide-enter-bottom' : 'slide-enter-top';

    card.classList.remove('slide-enter-bottom', 'slide-enter-top', 'slide-exit-up', 'slide-exit-down');
    card.classList.add(exitClass);

    setTimeout(() => {
      try {
        updateFn();
      } catch (err) {
        console.error('Transition error:', err);
      } finally {
        card.classList.remove(exitClass);
        card.classList.add(enterClass);

        setTimeout(() => {
          card.classList.remove(enterClass);
          isNavigating = false;
        }, 290);
      }
    }, 200);

    // Failsafe watchdog to prevent any stuck state
    setTimeout(() => {
      isNavigating = false;
    }, 550);
  }

  /**
   * Advances to next question with validation
   */
  function goToNextQuestion() {
    if (isNavigating) return;
    if (state.autoAdvanceTimer) {
      clearTimeout(state.autoAdvanceTimer);
      state.autoAdvanceTimer = null;
    }
    const currentPath = state.config.paths[state.currentPathIdx];
    const currentQ = currentPath.questions[state.currentQuestionIdx];

    // In Design Prototype / Preview Mode: allow moving without choosing an answer
    let currentAnswer = state.answers[currentQ.id];
    if (currentAnswer === undefined || currentAnswer === null) {
      if (isPreviewMode) {
        // Auto-assign sample score for preview so preview results can be rendered
        const sampleVal = ((state.currentPathIdx * 3 + state.currentQuestionIdx) % 5) + 6;
        state.answers[currentQ.id] = sampleVal;
        currentAnswer = sampleVal;
      } else {
        elements.question.validationError.textContent = 'Please select a rating before continuing.';
        elements.question.validationError.style.display = 'block';
        return;
      }
    }

    elements.question.validationError.style.display = 'none';

    // Check if within current path
    if (state.currentQuestionIdx < currentPath.questions.length - 1) {
      transitionQuestion(1, () => {
        state.currentQuestionIdx++;
        renderCurrentQuestion();
      });
    } else {
      // End of this path!
      advanceToNextPath();
    }
  }

  /**
   * Advances to next path or final submission
   */
  function advanceToNextPath() {
    if (state.autoAdvanceTimer) {
      clearTimeout(state.autoAdvanceTimer);
      state.autoAdvanceTimer = null;
    }
    const currentPath = state.config.paths[state.currentPathIdx];

    if (state.currentPathIdx < state.config.totalPaths - 1) {
      const nextPath = state.config.paths[state.currentPathIdx + 1];
      state.currentPathIdx++;
      state.currentQuestionIdx = 0;

      // Show neutral completion transition (PRD 4.4)
      elements.transition.title.textContent = `${currentPath.name} Completed`;
      elements.transition.message.textContent = `You have completed all questions for ${currentPath.name}. Next: ${nextPath.name}.`;
      elements.transition.btnContinue.textContent = `Begin ${nextPath.name} →`;
      switchView('transition');
    } else {
      // Assessment fully completed! Submit to server
      submitAssessment();
    }
  }

  /**
   * Navigates back to previous question
   */
  function goToPrevQuestion() {
    if (isNavigating) return;
    if (state.autoAdvanceTimer) {
      clearTimeout(state.autoAdvanceTimer);
      state.autoAdvanceTimer = null;
    }
    if (state.currentQuestionIdx > 0) {
      transitionQuestion(-1, () => {
        state.currentQuestionIdx--;
        renderCurrentQuestion();
      });
    } else if (state.currentPathIdx > 0) {
      transitionQuestion(-1, () => {
        state.currentPathIdx--;
        const prevPath = state.config.paths[state.currentPathIdx];
        state.currentQuestionIdx = prevPath.questions.length - 1;
        renderCurrentQuestion();
      });
    } else {
      switchView('instructions');
    }
  }

  /**
   * Submits responses to server API for validated scoring, with resilient client fallback
   */
  async function submitAssessment() {
    switchView('submitting');

    try {
      const response = await fetch('/api/assessment/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers: state.answers })
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.results) {
          state.sessionId = data.sessionId;
          state.results = data.results;
          renderResultsDashboard(data.results);
          switchView('results');
          return;
        }
      } else {
        const errData = await response.json().catch(() => ({}));
        console.warn('Backend rejected submission:', errData);
      }
    } catch (err) {
      console.warn('Backend submit connection interrupted, falling back to client scoring:', err);
    }

    // Resilient fallback scoring guarantees user never gets stuck or loses their answers
    try {
      const fallbackResults = clientScoreAssessment(state.answers, state.config);
      state.results = fallbackResults;
      renderResultsDashboard(fallbackResults);
      switchView('results');
    } catch (calcErr) {
      console.error('Calculation error:', calcErr);
      alert('An error occurred calculating results. Please ensure all required questions are answered.');
      switchView('question');
    }
  }

  /**
   * Renders the Results Dashboard:
   * 1. Dynamic Stats Summary Strip
   * 2. Polar Area Wheel SVG (12 segments with vibrant pastel palette)
   * 3. Clean Editorial Dimension Score Table with color indicators
   */
  function renderResultsDashboard(results) {
    // Current date
    const dateStr = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    elements.results.dateDisplay.textContent = `Completed on ${dateStr}`;

    // Update Quick Stats Strip
    const assessedCount = results.assessedPathsCount || results.domains.filter(d => !d.isNA).length;
    const statEvaluated = document.getElementById('stat-evaluated-count');
    if (statEvaluated) statEvaluated.textContent = `${assessedCount} / ${results.totalPaths}`;

    const scoredDomains = results.domains
      .filter(d => !d.isNA && d.rawScore !== null)
      .sort((a, b) => b.rawScore - a.rawScore);

    const statTop = document.getElementById('stat-top-domain');
    if (statTop) {
      statTop.textContent = scoredDomains.length > 0
        ? `${scoredDomains[0].name} (${scoredDomains[0].displayScore})`
        : '—';
    }

    const statFocus = document.getElementById('stat-focus-domain');
    if (statFocus) {
      statFocus.textContent = scoredDomains.length > 0
        ? `${scoredDomains[scoredDomains.length - 1].name} (${scoredDomains[scoredDomains.length - 1].displayScore})`
        : '—';
    }

    // 1. Render 12-segment Polar Area Wheel SVG
    renderPolarAreaWheel(results.domains);

    // 2. Render Clean Editorial Table
    renderAccessibleTable(results.domains);
  }

  /**
   * Generates the 12-segment Polar Area Wheel SVG
   * Each wedge radiates according to score 1-10.
   */
  function renderPolarAreaWheel(domains) {
    const width = 760;
    const height = 540;
    const cx = width / 2; // 380
    const cy = height / 2; // 270
    const maxRadius = 158;
    const minRadius = 18;
    const totalSegments = 12;
    const anglePerSegment = (2 * Math.PI) / totalSegments;

    // Elegant clean short titles for radial wheel labels to prevent bleeding
    const SHORT_LABELS = {
      'spirituality': 'Spirituality',
      'intellectual_growth': 'Intellectual Growth',
      'marriage': 'Marriage',
      'career': 'Career & Ministry',
      'personal_finance': 'Personal Finance',
      'friends': 'Friends',
      'networks': 'Networks & Support',
      'health': 'Health & Vitality',
      'rest_renewal': 'Rest & Renewal',
      'influence_legacy': 'Influence & Legacy',
      'purpose_calling': 'Purpose & Calling',
      'identity_character': 'Identity & Character'
    };

    // Palette of 12 exquisite, harmonious luxury pastels
    const colors = [
      '#C4B5FD', // Soft Lavender Mist (Spirituality)
      '#93C5FD', // Pale Cornflower (Intellectual Growth)
      '#F9A8D4', // Dusty Blush Rose (Marriage)
      '#A78BFA', // Muted Iris (Career & Ministry)
      '#86EFAC', // Sage Mist (Personal Finance)
      '#FDBA74', // Warm Peach (Friends)
      '#6EE7B7', // Pale Celadon (Networks & Alliances)
      '#7DD3FC', // Soft Sky Blue (Health)
      '#D9F99D', // Gentle Lime Mist (Rest & Renewal)
      '#FCA5A5', // Soft Terracotta (Influence & Legacy)
      '#D8B4FE', // Soft Amethyst (Purpose & Calling)
      '#CBD5E1'  // Whisper Slate (Identity & Character)
    ];

    let svgHtml = `
      <svg class="wheel-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="12-Path Wheel of Life polar chart">
        <title>12-Path Wheel of Life</title>
        <desc>Polar area chart representing your 12 life path scores on a scale from 1 to 10.</desc>
        
        <!-- Concentric Guideline Rings (Scale 2, 4, 6, 8, 10) -->
        <g class="chart-rings">
    `;

    // Delicate concentric hairline circles
    [2, 4, 6, 8, 10].forEach(level => {
      const r = minRadius + (level / 10) * (maxRadius - minRadius);
      svgHtml += `<circle cx="${cx}" cy="${cy}" r="${r.toFixed(1)}" fill="none" stroke="#EFE6F3" stroke-width="1" stroke-dasharray="${level === 10 ? 'none' : '2 3'}" />`;
      // Scale label on vertical axis
      svgHtml += `<text x="${cx + 4}" y="${(cy - r + 10).toFixed(1)}" font-size="9" fill="#B3A2C0" font-family="'Plus Jakarta Sans', sans-serif">${level}</text>`;
    });

    svgHtml += `</g><g class="chart-wedges">`;

    // Draw wedges for each domain
    domains.forEach((d, i) => {
      const color = colors[i % colors.length];
      const startAngle = -Math.PI / 2 + i * anglePerSegment;
      const endAngle = -Math.PI / 2 + (i + 1) * anglePerSegment;

      const score = (d.isNA || d.rawScore === null) ? 0 : Math.min(10, Math.max(0.5, d.rawScore));
      const wedgeRadius = score === 0 ? 0 : minRadius + (score / 10) * (maxRadius - minRadius);

      if (wedgeRadius > 0) {
        const x1 = cx + wedgeRadius * Math.cos(startAngle);
        const y1 = cy + wedgeRadius * Math.sin(startAngle);
        const x2 = cx + wedgeRadius * Math.cos(endAngle);
        const y2 = cy + wedgeRadius * Math.sin(endAngle);

        const pathData = `M ${cx} ${cy} L ${x1.toFixed(1)} ${y1.toFixed(1)} A ${wedgeRadius.toFixed(1)} ${wedgeRadius.toFixed(1)} 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)} Z`;

        svgHtml += `
          <path d="${pathData}" 
                fill="${color}" 
                fill-opacity="0.9" 
                stroke="#FFFFFF" 
                stroke-width="1.5"
                tabindex="0"
                role="graphics-symbol"
                aria-label="${d.name}: Score ${d.displayScore} out of 10 (${d.band.label})">
            <title>${d.name}: ${d.displayScore}/10 (${d.band.label})</title>
          </path>
        `;
      } else {
        // Render empty / dashed wedge outline for N/A
        const x1 = cx + maxRadius * Math.cos(startAngle);
        const y1 = cy + maxRadius * Math.sin(startAngle);
        const x2 = cx + maxRadius * Math.cos(endAngle);
        const y2 = cy + maxRadius * Math.sin(endAngle);
        svgHtml += `
          <path d="M ${cx} ${cy} L ${x1.toFixed(1)} ${y1.toFixed(1)} A ${maxRadius} ${maxRadius} 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)} Z" 
                fill="none" 
                stroke="#E5DEEB" 
                stroke-width="1"
                stroke-dasharray="2 2"
                aria-label="${d.name}: Not Applicable">
            <title>${d.name}: Not Applicable</title>
          </path>
        `;
      }
    });

    svgHtml += `</g><g class="chart-spokes">`;

    // Delicate radial dividing lines
    for (let i = 0; i < totalSegments; i++) {
      const angle = -Math.PI / 2 + i * anglePerSegment;
      const x = cx + maxRadius * Math.cos(angle);
      const y = cy + maxRadius * Math.sin(angle);
      svgHtml += `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#EFE6F3" stroke-width="1" />`;
    }

    svgHtml += `</g><g class="chart-labels">`;

    // Labels positioned outside the wheel with ample breathing room
    domains.forEach((d, i) => {
      const midAngle = -Math.PI / 2 + (i + 0.5) * anglePerSegment;
      const labelRadius = maxRadius + 24;
      const lx = cx + labelRadius * Math.cos(midAngle);
      const ly = cy + labelRadius * Math.sin(midAngle);

      let textAnchor = 'middle';
      const cosA = Math.cos(midAngle);
      if (cosA > 0.22) textAnchor = 'start';
      else if (cosA < -0.22) textAnchor = 'end';

      const shortName = SHORT_LABELS[d.id] || (d.name.length > 20 ? d.name.split('&')[0].trim() : d.name);
      const scoreText = d.isNA ? 'N/A' : d.displayScore;

      svgHtml += `
        <text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" 
              text-anchor="${textAnchor}" 
              font-size="11.5" 
              font-weight="500" 
              fill="#261733" 
              dominant-baseline="central"
              font-family="'Plus Jakarta Sans', sans-serif"
              letter-spacing="0.01em">
          ${shortName} <tspan font-weight="800" font-size="12.5" fill="#461d5d">${scoreText}</tspan>
        </text>
      `;
    });

    svgHtml += `
        </g>
        <!-- Center Hub -->
        <circle cx="${cx}" cy="${cy}" r="${minRadius}" fill="#FFFFFF" stroke="#EFE6F3" stroke-width="1.5" />
      </svg>
    `;

    elements.results.wheelSvgContainer.innerHTML = svgHtml;

    // Render legend pills
    let legendHtml = '';
    domains.forEach((d, i) => {
      const color = colors[i % colors.length];
      legendHtml += `
        <span class="legend-pill">
          <span class="legend-color-dot" style="background-color: ${color};"></span>
          <span>${d.name}: <strong>${d.displayScore}</strong></span>
        </span>
      `;
    });
    elements.results.legendContainer.innerHTML = legendHtml;
  }

  /**
   * Renders Clean Editorial Table
   */
  function renderAccessibleTable(domains) {
    elements.results.tableBody.innerHTML = domains.map(d => {
      const badgeClass = d.isNA ? 'not-assessed' : d.band.key.replace(/_/g, '-');
      const dotColor = d.color || '#461d5d';
      return `
        <tr>
          <td>${d.order}</td>
          <td>
            <div class="table-dimension-cell">
              <span class="table-color-dot" style="background-color: ${dotColor};"></span>
              <strong>${d.name}</strong>
            </div>
          </td>
          <td><span class="table-score-val">${d.displayScore}</span></td>
          <td><span class="band-badge ${badgeClass}">${d.band.label}</span></td>
        </tr>
      `;
    }).join('');
  }

  /**
   * Resets assessment to start fresh
   */
  function resetAssessment() {
    if (confirm('Are you sure you want to start a new assessment? Your current responses will be cleared.')) {
      if (state.autoAdvanceTimer) {
        clearTimeout(state.autoAdvanceTimer);
        state.autoAdvanceTimer = null;
      }
      state.answers = {};
      state.currentPathIdx = 0;
      state.currentQuestionIdx = 0;
      state.sessionId = null;
      state.results = null;
      try {
        localStorage.removeItem('wol_assessment_answers');
        localStorage.removeItem('wol_assessment_step');
      } catch (_) {}
      switchView('welcome');
    }
  }

  // Start app on DOM load
  document.addEventListener('DOMContentLoaded', init);
})();

