import { Check } from 'lucide-react';

interface EditorToolbarProps {
  saveStatus: 'saved' | 'saving' | 'unsaved';
}

export const EditorToolbar: React.FC<EditorToolbarProps> = ({ saveStatus }) => {
  return (
    <div className="sticky top-0 z-10 bg-white border-b border-gray-200">
      <div className="max-w-[680px] mx-auto px-4 h-12 flex items-center justify-between">
        {/* Save status */}
        <div className="flex items-center gap-3">
          {saveStatus === 'saved' && (
            <div className="flex items-center gap-1.5 text-sm text-[#F6821F] font-semibold">
              <Check className="w-3.5 h-3.5" />
              <span>Saved locally</span>
            </div>
          )}
          {saveStatus === 'saving' && (
            <div className="flex items-center gap-1.5 text-sm text-gray-500 font-semibold">
              <div className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-[#F6821F] border-t-transparent"></div>
              <span>Saving...</span>
            </div>
          )}
          {saveStatus === 'unsaved' && (
            <span className="text-sm text-gray-400 font-semibold">Unsaved</span>
          )}
        </div>
      </div>
    </div>
  );
};
