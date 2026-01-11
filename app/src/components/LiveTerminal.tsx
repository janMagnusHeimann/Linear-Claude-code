import React, { useRef, useEffect } from 'react';
import { Terminal } from 'lucide-react';

interface LiveTerminalProps {
  output: string;
  title?: string;
}

// Helper function to detect and linkify URLs
function linkifyUrls(text: string): React.ReactNode {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);

  return parts.map((part, index) => {
    if (part.match(urlRegex)) {
      return (
        <a
          key={index}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="text-linear-purple underline hover:text-linear-purple/80 cursor-pointer"
          onClick={(e) => {
            e.preventDefault();
            if (window.electronAPI) {
              window.electronAPI.openExternal(part);
            } else {
              window.open(part, '_blank');
            }
          }}
        >
          {part}
        </a>
      );
    }
    return part;
  });
}

export function LiveTerminal({ output, title = 'Claude Code Output' }: LiveTerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Auto-scroll to bottom when output changes
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [output]);

  return (
    <div className="card p-0 overflow-hidden">
      <div className="bg-gray-900 px-4 py-3 border-b border-gray-800 flex items-center gap-2">
        <Terminal className="w-4 h-4 text-gray-400" />
        <span className="text-sm text-gray-300 font-medium">{title}</span>
      </div>
      <div
        ref={terminalRef}
        className="bg-black p-4 font-mono text-sm text-green-400 h-96 overflow-y-auto overflow-x-auto"
        style={{
          lineHeight: '1.5',
          scrollBehavior: 'smooth',
        }}
      >
        {output ? (
          <pre className="whitespace-pre-wrap break-words">{linkifyUrls(output)}</pre>
        ) : (
          <div className="text-gray-600 italic">Waiting for output...</div>
        )}
      </div>
    </div>
  );
}
