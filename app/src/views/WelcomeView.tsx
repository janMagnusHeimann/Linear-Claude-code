import React, { useState } from 'react';
import { Zap, Key, FolderOpen, ArrowRight, CheckCircle2, Loader2 } from 'lucide-react';
import { useSettings } from '../contexts/SettingsContext';

interface WelcomeViewProps {
  onComplete: () => void;
}

export function WelcomeView({ onComplete }: WelcomeViewProps) {
  const { updateSettings } = useSettings();
  const [step, setStep] = useState(1);
  const [apiKey, setApiKey] = useState('');
  const [codebasePath, setCodebasePath] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState('');

  const validateApiKey = async () => {
    if (!apiKey.trim()) {
      setError('Please enter your API key');
      return;
    }

    setIsValidating(true);
    setError('');

    try {
      if (window.electronAPI) {
        const result = await window.electronAPI.testLinearConnection(apiKey.trim());
        if (result.success) {
          setStep(2);
        } else {
          setError(result.error || 'Invalid API key. Please check and try again.');
        }
      }
    } catch (err) {
      setError('Invalid API key. Please check and try again.');
    } finally {
      setIsValidating(false);
    }
  };

  const selectCodebase = async () => {
    if (window.electronAPI) {
      const path = await window.electronAPI.selectDirectory();
      if (path) {
        setCodebasePath(path);
      }
    }
  };

  const completeSetup = async () => {
    await updateSettings({
      linearApiKey: apiKey.trim(),
      codebasePath: codebasePath,
    });
    onComplete();
  };

  return (
    <div className="h-full flex items-center justify-center bg-linear-gray-950 p-8">
      <div className="max-w-lg w-full">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-linear-purple to-linear-blue flex items-center justify-center animate-pulse-glow">
            <Zap className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gradient mb-3">Welcome to Linear Claude</h1>
          <p className="text-linear-gray-400">
            Automatically solve Linear issues with the power of Claude Code
          </p>
        </div>

        {/* Steps */}
        <div className="card p-8">
          {/* Step indicator */}
          <div className="flex items-center justify-center gap-4 mb-8">
            {[1, 2].map((s) => (
              <React.Fragment key={s}>
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold transition-all ${
                    step > s
                      ? 'bg-linear-green text-white'
                      : step === s
                      ? 'bg-linear-purple text-white'
                      : 'bg-linear-gray-800 text-linear-gray-500'
                  }`}
                >
                  {step > s ? <CheckCircle2 className="w-5 h-5" /> : s}
                </div>
                {s < 2 && (
                  <div
                    className={`w-16 h-1 rounded-full transition-all ${
                      step > s ? 'bg-linear-green' : 'bg-linear-gray-800'
                    }`}
                  />
                )}
              </React.Fragment>
            ))}
          </div>

          {/* Step 1: API Key */}
          {step === 1 && (
            <div className="animate-fade-in">
              <div className="flex items-center gap-3 mb-4">
                <Key className="w-5 h-5 text-linear-purple" />
                <h2 className="text-lg font-semibold text-linear-gray-100">
                  Connect to Linear
                </h2>
              </div>
              <p className="text-linear-gray-400 text-sm mb-6">
                Enter your Linear API key to get started. You can find it in{' '}
                <button
                  onClick={() => window.electronAPI?.openExternal('https://linear.app/settings/api')}
                  className="text-linear-purple hover:underline"
                >
                  Linear Settings → API
                </button>
              </p>

              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="lin_api_xxxxxxxxxxxxxxxx"
                className="input mb-4"
                onKeyDown={(e) => e.key === 'Enter' && validateApiKey()}
              />

              {error && (
                <p className="text-red-400 text-sm mb-4">{error}</p>
              )}

              <button
                onClick={validateApiKey}
                disabled={isValidating}
                className="btn-primary w-full"
              >
                {isValidating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Validating...
                  </>
                ) : (
                  <>
                    Continue
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          )}

          {/* Step 2: Codebase */}
          {step === 2 && (
            <div className="animate-fade-in">
              <div className="flex items-center gap-3 mb-4">
                <FolderOpen className="w-5 h-5 text-linear-purple" />
                <h2 className="text-lg font-semibold text-linear-gray-100">
                  Select Your Codebase
                </h2>
              </div>
              <p className="text-linear-gray-400 text-sm mb-6">
                Choose the project directory where Claude Code will work on your issues.
              </p>

              <div className="flex gap-3 mb-6">
                <input
                  type="text"
                  value={codebasePath}
                  onChange={(e) => setCodebasePath(e.target.value)}
                  placeholder="/path/to/your/project"
                  className="input flex-1"
                />
                <button onClick={selectCodebase} className="btn-secondary">
                  Browse
                </button>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep(1)}
                  className="btn-ghost flex-1"
                >
                  Back
                </button>
                <button
                  onClick={completeSetup}
                  className="btn-primary flex-1"
                >
                  Get Started
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Features preview */}
        <div className="mt-8 grid grid-cols-3 gap-4 text-center">
          {[
            { title: 'Smart Routing', desc: 'AI finds relevant code' },
            { title: 'Context Rich', desc: 'Full issue context' },
            { title: 'Auto Branch', desc: 'Creates git branches' },
          ].map((feature) => (
            <div key={feature.title} className="p-4">
              <h3 className="text-sm font-medium text-linear-gray-100">{feature.title}</h3>
              <p className="text-xs text-linear-gray-500">{feature.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
