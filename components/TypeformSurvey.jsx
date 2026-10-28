import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// Sample Mock Questions
export const MOCK_QUESTIONS = [
  {
    id: 1,
    title: 'What is your primary focus area right now?',
    description: 'Select the dimension that currently commands the most intentional energy.',
    required: true,
    options: [
      { id: 'career', badge: 'A', label: 'Career advancement & leadership impact' },
      { id: 'health', badge: 'B', label: 'Physical health, vitality & sleep rhythms' },
      { id: 'relationships', badge: 'C', label: 'Deepening friendships and family bonds' },
      { id: 'mindset', badge: 'D', label: 'Mindset, intellectual curiosity & inner peace' }
    ]
  },
  {
    id: 2,
    title: 'How often do you dedicate dedicated time to reflection or journaling?',
    description: 'Think about your regular rhythm over the last 90 days.',
    required: true,
    options: [
      { id: 'daily', badge: 'A', label: 'Daily or nearly every day' },
      { id: 'weekly', badge: 'B', label: 'Once or twice a week consistently' },
      { id: 'monthly', badge: 'C', label: 'A few times a month when time permits' },
      { id: 'rarely', badge: 'D', label: 'Rarely or almost never' }
    ]
  },
  {
    id: 3,
    title: 'What kind of growth would benefit you most right now?',
    description: 'Choose the breakthrough that would create the highest leverage in your life.',
    required: true,
    options: [
      { id: 'clarity', badge: 'A', label: 'Crystal-clear clarity on long-term vision and goals' },
      { id: 'consistency', badge: 'B', label: 'Daily consistency and discipline in execution' },
      { id: 'boundaries', badge: 'C', label: 'Better boundaries around rest and digital recovery' },
      { id: 'community', badge: 'D', label: 'A high-trust community of like-minded peers' }
    ]
  },
  {
    id: 4,
    title: 'How confident do you feel navigating unexpected life transitions?',
    description: 'When sudden shifts or disruptions occur in work or life.',
    required: true,
    options: [
      { id: 'unshakable', badge: 'A', label: 'Extremely confident — I adapt quickly with composure' },
      { id: 'steady', badge: 'B', label: 'Mostly steady, though it takes a moment to calibrate' },
      { id: 'challenged', badge: 'C', label: 'Somewhat challenged — transitions feel draining' },
      { id: 'overwhelmed', badge: 'D', label: 'Easily overwhelmed by sudden changes' }
    ]
  }
];

// Slide Animation Variants
const slideVariants = {
  enter: (direction) => ({
    y: direction > 0 ? 50 : -50,
    opacity: 0
  }),
  center: {
    y: 0,
    opacity: 1,
    transition: {
      y: { type: 'spring', stiffness: 350, damping: 30 },
      opacity: { duration: 0.28, ease: [0.25, 0.1, 0.25, 1.0] }
    }
  },
  exit: (direction) => ({
    y: direction > 0 ? -50 : 50,
    opacity: 0,
    transition: {
      duration: 0.24,
      ease: [0.4, 0.0, 1.0, 1.0]
    }
  })
};

export const TypeformSurvey = ({ questions = MOCK_QUESTIONS, onComplete }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [answers, setAnswers] = useState({});
  const [isCompleted, setIsCompleted] = useState(false);
  const [hasError, setHasError] = useState(false);

  const autoAdvanceTimerRef = useRef(null);

  const currentQ = questions[currentIndex];
  const totalQuestions = questions.length;
  const progressPercent = ((currentIndex + 1) / totalQuestions) * 100;
  const selectedOptionId = answers[currentQ?.id];

  // Clear auto-advance timer on unmount or question change
  useEffect(() => {
    return () => {
      if (autoAdvanceTimerRef.current) {
        clearTimeout(autoAdvanceTimerRef.current);
      }
    };
  }, [currentIndex]);

  // Handle Forward Navigation
  const handleNext = useCallback(() => {
    if (autoAdvanceTimerRef.current) {
      clearTimeout(autoAdvanceTimerRef.current);
    }

    if (currentQ?.required && !answers[currentQ.id]) {
      setHasError(true);
      return;
    }

    setHasError(false);

    if (currentIndex < totalQuestions - 1) {
      setDirection(1);
      setCurrentIndex((prev) => prev + 1);
    } else {
      setIsCompleted(true);
      if (onComplete) {
        onComplete(answers);
      }
    }
  }, [currentIndex, totalQuestions, currentQ, answers, onComplete]);

  // Handle Back Navigation
  const handlePrev = useCallback(() => {
    if (autoAdvanceTimerRef.current) {
      clearTimeout(autoAdvanceTimerRef.current);
    }

    setHasError(false);
    if (currentIndex > 0) {
      setDirection(-1);
      setCurrentIndex((prev) => prev - 1);
    }
  }, [currentIndex]);

  // Handle Option Selection with 300ms dwell timeout
  const handleSelectOption = useCallback(
    (optionId) => {
      setAnswers((prev) => ({ ...prev, [currentQ.id]: optionId }));
      setHasError(false);

      if (autoAdvanceTimerRef.current) {
        clearTimeout(autoAdvanceTimerRef.current);
      }

      // Auto-advance after 300ms dwell so the user sees their feedback
      autoAdvanceTimerRef.current = setTimeout(() => {
        if (currentIndex < totalQuestions - 1) {
          setDirection(1);
          setCurrentIndex((prev) => prev + 1);
        } else {
          setIsCompleted(true);
          if (onComplete) {
            onComplete({ ...answers, [currentQ.id]: optionId });
          }
        }
      }, 300);
    },
    [currentQ, currentIndex, totalQuestions, answers, onComplete]
  );

  // Global Keyboard Listener
  useEffect(() => {
    if (isCompleted) return;

    const handleKeyDown = (e) => {
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;

      const key = e.key.toUpperCase();

      // Check letter keys (A, B, C, D, etc.)
      const matchedOption = currentQ?.options.find((opt) => opt.badge === key);
      if (matchedOption) {
        e.preventDefault();
        handleSelectOption(matchedOption.id);
        return;
      }

      // Enter key -> Advance
      if (e.key === 'Enter') {
        e.preventDefault();
        handleNext();
        return;
      }

      // Arrow Down -> Advance
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        handleNext();
        return;
      }

      // Arrow Up -> Go Back
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        handlePrev();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentQ, isCompleted, handleSelectOption, handleNext, handlePrev]);

  // Reset Survey
  const handleRestart = () => {
    setAnswers({});
    setCurrentIndex(0);
    setDirection(1);
    setIsCompleted(false);
    setHasError(false);
  };

  return (
    <div className="relative w-full h-screen min-h-[600px] bg-[#f4eff4] text-neutral-800 flex flex-col justify-between overflow-hidden select-none font-sans">
      {/* Top Thin Progress Bar */}
      <div className="w-full h-1 bg-neutral-200/60 fixed top-0 left-0 z-30">
        <motion.div
          className="h-full bg-[#e91e63]"
          initial={{ width: 0 }}
          animate={{ width: `${progressPercent}%` }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
        />
      </div>

      {/* Main Card Viewport */}
      <main className="flex-1 flex items-center justify-center px-4 sm:px-8 py-12 w-full max-w-2xl mx-auto z-10">
        <AnimatePresence mode="wait" custom={direction}>
          {!isCompleted ? (
            <motion.div
              key={currentQ.id}
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              className="w-full flex flex-col justify-center"
            >
              {/* Question Header */}
              <div className="mb-6">
                <div className="flex items-baseline gap-2 mb-2">
                  <span className="text-sm font-semibold tracking-wide text-[#e91e63]">
                    {currentQ.id} &rarr;
                  </span>
                  <h1 className="text-xl sm:text-2xl md:text-3xl font-semibold text-neutral-900 leading-snug tracking-tight">
                    {currentQ.title}
                    {currentQ.required && (
                      <span className="text-[#e91e63] ml-1" title="Required">
                        *
                      </span>
                    )}
                  </h1>
                </div>

                {currentQ.description && (
                  <p className="text-neutral-500 text-sm sm:text-base font-normal ml-6">
                    {currentQ.description}
                  </p>
                )}
              </div>

              {/* Stacked Options */}
              <div className="flex flex-col gap-3 my-2" role="radiogroup">
                {currentQ.options.map((option) => {
                  const isSelected = selectedOptionId === option.id;

                  return (
                    <motion.button
                      key={option.id}
                      type="button"
                      whileHover={{ scale: 1.008 }}
                      whileTap={{ scale: 0.992 }}
                      onClick={() => handleSelectOption(option.id)}
                      className={`group relative flex items-center justify-between w-full p-3.5 sm:p-4 rounded-xl border text-left transition-all duration-150 cursor-pointer ${
                        isSelected
                          ? 'border-[#e91e63] bg-pink-50/60 ring-2 ring-[#e91e63]/20 shadow-sm'
                          : 'border-neutral-200/90 bg-white/90 hover:border-neutral-300 hover:bg-neutral-50/80 shadow-sm'
                      }`}
                      aria-checked={isSelected}
                      role="radio"
                    >
                      <div className="flex items-center gap-3 sm:gap-4 flex-1 pr-2">
                        {/* Square Letter Badge */}
                        <span
                          className={`flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 rounded-md text-xs font-bold border transition-colors duration-150 ${
                            isSelected
                              ? 'bg-[#e91e63] text-white border-[#e91e63] shadow-xs'
                              : 'bg-neutral-100 text-neutral-600 border-neutral-300 group-hover:bg-neutral-200'
                          }`}
                        >
                          {option.badge}
                        </span>

                        {/* Option Text */}
                        <span
                          className={`text-sm sm:text-base font-medium transition-colors ${
                            isSelected ? 'text-neutral-900 font-semibold' : 'text-neutral-700'
                          }`}
                        >
                          {option.label}
                        </span>
                      </div>

                      {/* Right Selection Indicator */}
                      <div className="flex items-center justify-center w-5 h-5">
                        <AnimatePresence>
                          {isSelected && (
                            <motion.svg
                              initial={{ scale: 0, opacity: 0 }}
                              animate={{ scale: 1, opacity: 1 }}
                              exit={{ scale: 0, opacity: 0 }}
                              transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                              className="w-5 h-5 text-[#e91e63]"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.5"
                              viewBox="0 0 24 24"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </motion.svg>
                          )}
                        </AnimatePresence>
                      </div>
                    </motion.button>
                  );
                })}
              </div>

              {/* Error Message */}
              {hasError && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-1.5 mt-2 text-xs font-medium text-red-600"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span>Please choose an option to continue</span>
                </motion.div>
              )}

              {/* Action Buttons Row */}
              <div className="flex items-center gap-3 mt-6">
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleNext}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-[#e91e63] hover:bg-[#d81557] text-white font-medium text-sm sm:text-base shadow-sm transition-colors cursor-pointer"
                >
                  <span>OK</span>
                  <svg
                    className="w-4 h-4 text-white"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </motion.button>

                <span className="text-xs text-neutral-400 font-normal">
                  press <strong className="font-semibold text-neutral-600">Enter ↵</strong>
                </span>
              </div>
            </motion.div>
          ) : (
            /* Survey Completed View */
            <motion.div
              key="completed"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.35, ease: 'easeOut' }}
              className="w-full text-center py-12 px-6 bg-white/80 backdrop-blur-md rounded-2xl shadow-sm border border-neutral-200/80"
            >
              <div className="w-16 h-16 bg-pink-100 text-[#e91e63] rounded-full flex items-center justify-center mx-auto mb-5 shadow-inner">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>

              <h2 className="text-2xl sm:text-3xl font-bold text-neutral-900 mb-2">
                All Done! Thank you.
              </h2>
              <p className="text-neutral-500 text-sm sm:text-base max-w-md mx-auto mb-8">
                Your responses have been successfully recorded. We appreciate your valuable feedback and thoughtful reflections.
              </p>

              <button
                type="button"
                onClick={handleRestart}
                className="px-6 py-2.5 bg-neutral-900 hover:bg-neutral-800 text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
              >
                Restart Survey
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Fixed Bottom-Right Navigation Widget */}
      <footer className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-20 flex items-center gap-3">
        {/* Up / Down Chevrons Button Group */}
        <div className="flex items-center bg-white/90 backdrop-blur-sm border border-neutral-200/90 rounded-lg shadow-sm overflow-hidden">
          {/* Chevron Up (Prev) */}
          <button
            type="button"
            onClick={handlePrev}
            disabled={currentIndex === 0 || isCompleted}
            aria-label="Previous question"
            className="p-2 sm:p-2.5 text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors"
          >
            <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
            </svg>
          </button>

          <div className="w-[1px] h-5 bg-neutral-200" />

          {/* Chevron Down (Next) */}
          <button
            type="button"
            onClick={handleNext}
            disabled={isCompleted}
            aria-label="Next question"
            className="p-2 sm:p-2.5 text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors"
          >
            <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>

        {/* Progress / Brand Pill */}
        <div className="hidden xs:flex items-center gap-2 px-3 py-1.5 bg-white/80 backdrop-blur-sm border border-neutral-200/80 rounded-lg shadow-xs text-xs font-medium text-neutral-500">
          <span>
            {Math.min(currentIndex + 1, totalQuestions)} of {totalQuestions}
          </span>
          <span className="text-neutral-300">|</span>
          <span className="text-neutral-400 font-normal">Typeform style</span>
        </div>
      </footer>
    </div>
  );
};

export default TypeformSurvey;

