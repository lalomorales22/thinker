import React, { useState, useEffect } from 'react';
import { X, ArrowRight, ArrowLeft, Sparkles } from 'lucide-react';

interface TourStep {
  title: string;
  description: string;
  target?: string; // CSS selector for the element to highlight
  position?: 'top' | 'bottom' | 'left' | 'right';
}

const TOUR_STEPS: TourStep[] = [
  {
    title: '🎉 Welcome to Thinker!',
    description: "Let's take a quick tour to help you train your first AI model. This will only take 2 minutes!",
  },
  {
    title: '⚙️ Settings First',
    description: 'Click the Settings icon in the top-right to add your Tinker API key. This is required for training models.',
    target: '[data-tour="settings"]',
    position: 'bottom',
  },
  {
    title: '💾 Dataset Manager',
    description: 'Upload your training data here. Supports JSONL, JSON, and CSV formats. You can also import datasets from HuggingFace!',
    target: '[data-tour="dataset-manager"]',
    position: 'right',
  },
  {
    title: '⚡ Training Dashboard',
    description: 'Start training jobs here. Click "Deploy New Job" to configure and launch your model training.',
    target: '[data-tour="training-dashboard"]',
    position: 'right',
  },
  {
    title: '📦 Models Library',
    description: 'Browse your trained models here. You can view details, export checkpoints, or test models in the playground.',
    target: '[data-tour="models-library"]',
    position: 'right',
  },
  {
    title: '💬 Playground',
    description: 'Test your trained models interactively! Compare different models and see how they perform on real examples.',
    target: '[data-tour="playground"]',
    position: 'right',
  },
  {
    title: '📊 Analytics',
    description: 'Monitor training metrics, view loss curves, and analyze model performance over time.',
    target: '[data-tour="analytics"]',
    position: 'right',
  },
  {
    title: '🤖 AI Assistant',
    description: 'Need help? Click the robot icon to chat with the AI Training Assistant. It can help you configure training jobs using natural language!',
    target: '[data-tour="ai-assistant"]',
    position: 'bottom',
  },
  {
    title: '🚀 You\'re Ready!',
    description: 'That\'s it! Start by adding your API key in Settings, then upload a dataset and deploy your first training job. Check out the documentation for detailed guides.',
  },
];

interface OnboardingTourProps {
  onComplete?: () => void;
}

export const OnboardingTour: React.FC<OnboardingTourProps> = ({ onComplete }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [highlightPosition, setHighlightPosition] = useState<DOMRect | null>(null);

  useEffect(() => {
    // Check if user has completed the tour
    const tourCompleted = localStorage.getItem('thinker-tour-completed');
    if (!tourCompleted) {
      // Show tour after a short delay
      const timer = setTimeout(() => setIsOpen(true), 1000);
      return () => clearTimeout(timer);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const step = TOUR_STEPS[currentStep];
    if (step.target) {
      // Find the target element and get its position
      const targetElement = document.querySelector(step.target);
      if (targetElement) {
        const rect = targetElement.getBoundingClientRect();
        setHighlightPosition(rect);

        // Scroll element into view
        targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        setHighlightPosition(null);
      }
    } else {
      setHighlightPosition(null);
    }
  }, [currentStep, isOpen]);

  const handleNext = () => {
    if (currentStep < TOUR_STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleComplete();
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleComplete = () => {
    localStorage.setItem('thinker-tour-completed', 'true');
    setIsOpen(false);
    onComplete?.();
  };

  const handleSkip = () => {
    localStorage.setItem('thinker-tour-completed', 'true');
    setIsOpen(false);
  };

  if (!isOpen) return null;

  const step = TOUR_STEPS[currentStep];
  const progress = ((currentStep + 1) / TOUR_STEPS.length) * 100;

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 bg-black/60 z-[9998] pointer-events-none" />

      {/* Highlight box */}
      {highlightPosition && (
        <div
          className="fixed z-[9999] pointer-events-none"
          style={{
            left: highlightPosition.left - 4,
            top: highlightPosition.top - 4,
            width: highlightPosition.width + 8,
            height: highlightPosition.height + 8,
            border: '3px solid #06b6d4',
            borderRadius: '8px',
            boxShadow: '0 0 0 4px rgba(6, 182, 212, 0.3), 0 0 20px rgba(6, 182, 212, 0.5)',
            animation: 'pulse 2s ease-in-out infinite',
          }}
        />
      )}

      {/* Tour modal */}
      <div
        className="fixed z-[10000] bg-[#0a0a0a] border border-cyan-500/30 rounded-lg shadow-2xl max-w-md pointer-events-auto"
        style={{
          left: highlightPosition
            ? step.position === 'right'
              ? highlightPosition.right + 20
              : step.position === 'left'
              ? highlightPosition.left - 420
              : highlightPosition.left
            : '50%',
          top: highlightPosition
            ? step.position === 'bottom'
              ? highlightPosition.bottom + 20
              : step.position === 'top'
              ? highlightPosition.top - 240
              : highlightPosition.top
            : '50%',
          transform: !highlightPosition ? 'translate(-50%, -50%)' : undefined,
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-cyan-500/20">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-cyan-400" />
            <h3 className="text-lg font-semibold text-cyan-100">{step.title}</h3>
          </div>
          <button
            onClick={handleSkip}
            className="text-gray-400 hover:text-gray-300 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          <p className="text-gray-300 text-sm leading-relaxed">{step.description}</p>
        </div>

        {/* Progress bar */}
        <div className="px-4 pb-2">
          <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-gray-500 mt-1 text-center">
            Step {currentStep + 1} of {TOUR_STEPS.length}
          </p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-cyan-500/20">
          <button
            onClick={handleSkip}
            className="text-sm text-gray-400 hover:text-gray-300 transition-colors"
          >
            Skip Tour
          </button>
          <div className="flex gap-2">
            {currentStep > 0 && (
              <button
                onClick={handlePrevious}
                className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-300 hover:text-white transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </button>
            )}
            <button
              onClick={handleNext}
              className="flex items-center gap-1 px-4 py-1.5 text-sm bg-gradient-to-r from-cyan-500 to-blue-500 text-white rounded-md hover:from-cyan-600 hover:to-blue-600 transition-all"
            >
              {currentStep === TOUR_STEPS.length - 1 ? 'Finish' : 'Next'}
              {currentStep < TOUR_STEPS.length - 1 && <ArrowRight className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.6;
          }
        }
      `}</style>
    </>
  );
};

// Hook to restart the tour
export const useRestartTour = () => {
  return () => {
    localStorage.removeItem('thinker-tour-completed');
    window.location.reload();
  };
};

export default OnboardingTour;
