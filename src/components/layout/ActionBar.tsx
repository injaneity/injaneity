import { useState } from 'react';
import { Check, Settings } from 'lucide-react';
import { SettingsMenu } from './SettingsMenu';

interface ActionBarProps {
  saveStatus: 'saved' | 'saving' | 'unsaved';
}

export const ActionBar: React.FC<ActionBarProps> = ({ saveStatus }) => {
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <>
      <div className="fixed top-0 left-0 right-0 h-16 bg-white border-b border-gray-200 z-50">
        <div className="max-w-full h-full px-6 flex items-center justify-between">
          {/* Left side - Save status */}
          <div className="flex items-center gap-2">
            {saveStatus === 'saved' && (
              <div className="flex items-center gap-2 text-sm text-green-600">
                <Check className="w-4 h-4" />
                <span>Saved</span>
              </div>
            )}
            {saveStatus === 'saving' && (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-gray-400 border-t-transparent"></div>
                <span>Saving...</span>
              </div>
            )}
            {saveStatus === 'unsaved' && (
              <div className="text-sm text-gray-400">
                <span>Unsaved changes</span>
              </div>
            )}
          </div>

          {/* Right side - Settings */}
          <button
            onClick={() => setSettingsOpen(!settingsOpen)}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
            title="Settings"
          >
            <Settings className="w-5 h-5 text-gray-700" />
          </button>
        </div>
      </div>

      {/* Settings Menu */}
      {settingsOpen && (
        <SettingsMenu onClose={() => setSettingsOpen(false)} />
      )}
    </>
  );
};
