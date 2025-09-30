import { useState, useRef, useEffect, type KeyboardEvent } from 'react';
import { Typography } from './ui/typography';
import { getTypographyClass } from './ui/typography-variants';
import defaultMarkdownContent from '../default.md?raw';

// Parse inline markdown (bold, italic)
function parseInlineMarkdown(text: string): React.ReactNode[] {
  const current = text.replace(/^#+\s*/, ''); // Remove heading markers
  let key = 0;

  if (!current.trim()) return [current];

  // Split on markdown patterns
  const tokens = current.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/);
  
  return tokens.map((token) => {
    if (token.match(/^\*\*[^*]+\*\*$/)) {
      return <strong key={key++}>{token.slice(2, -2)}</strong>;
    } else if (token.match(/^\*[^*]+\*$/)) {
      return <em key={key++}>{token.slice(1, -1)}</em>;  
    } else {
      return token || null;
    }
  }).filter(Boolean);
}

// Split markdown into sections (separated by double newlines)
function parseMarkdownSections(markdown: string): string[] {
  return markdown.split('\n\n');
}

// Render a single section
function renderSection(section: string): React.ReactNode {
  const lines = section.split('\n');
  
  return lines.map((line, index) => {
    const trimmedLine = line.trim();
    
    if (!trimmedLine) {
      return null; // Let CSS handle line spacing
    }

    // Determine the type and render accordingly
    if (trimmedLine.startsWith('# ')) {
      return (
        <Typography key={index} variant="title">
          {parseInlineMarkdown(trimmedLine.slice(2))}
        </Typography>
      );
    } else if (trimmedLine.startsWith('## ')) {
      return (
        <Typography key={index} variant="h2">
          {parseInlineMarkdown(trimmedLine.slice(3))}
        </Typography>
      );
    } else if (trimmedLine.startsWith('### ')) {
      return (
        <Typography key={index} variant="h3">
          {parseInlineMarkdown(trimmedLine.slice(4))}
        </Typography>
      );
    } else {
      return (
        <Typography key={index} variant="body">
          {parseInlineMarkdown(trimmedLine)}
        </Typography>
      );
    }
  });
}

interface EditableSectionProps {
  section: string;
  sectionIndex: number;
  isEditing: boolean;
  onEdit: (index: number) => void;
  onUpdate: (index: number, content: string) => void;
  onDelete: (index: number) => void;
  onStopEditing: () => void;
}

function EditableSection({ section, sectionIndex, isEditing, onEdit, onUpdate, onDelete, onStopEditing }: EditableSectionProps) {
  const [value, setValue] = useState(section);
  const [initialHeight, setInitialHeight] = useState<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setValue(section);
  }, [section]);

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      // Position cursor at end
      const length = textareaRef.current.value.length;
      textareaRef.current.setSelectionRange(length, length);
      
      // Set height to match the initial rendered height exactly
      const textarea = textareaRef.current;
      if (initialHeight !== null) {
        // Use the exact measured height from the rendered element
        textarea.style.height = initialHeight + 'px';
        textarea.style.maxHeight = initialHeight + 'px';
        textarea.style.minHeight = initialHeight + 'px';
      } else {
        // Fallback to auto-resize
        textarea.style.height = 'auto';
        textarea.style.height = Math.max(textarea.scrollHeight, 100) + 'px';
      }
    }
  }, [isEditing, initialHeight]);

  // Auto-resize when value changes, but maintain exact height from initial render
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      const textarea = textareaRef.current;
      
      // If we have an initial height, maintain it exactly to prevent jumping
      if (initialHeight !== null) {
        textarea.style.height = initialHeight + 'px';
        textarea.style.maxHeight = initialHeight + 'px';
        textarea.style.minHeight = initialHeight + 'px';
      } else {
        // Only auto-resize if we don't have an initial height measurement
        textarea.style.height = 'auto';
        const scrollHeight = textarea.scrollHeight;
        textarea.style.height = Math.max(scrollHeight, 100) + 'px';
      }
    }
  }, [value, isEditing, initialHeight]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setValue(section); // Reset to original
      onStopEditing();
    }
    
    if (e.key === 'Enter' && e.metaKey) {
      e.preventDefault();
      handleSaveOrDelete(value);
    }

    // Handle backspace/delete on empty content
    if ((e.key === 'Backspace' || e.key === 'Delete') && value.trim() === '') {
      e.preventDefault();
      onDelete(sectionIndex);
      onStopEditing();
    }
  };

  const handleSaveOrDelete = (content: string) => {
    if (content.trim() === '') {
      onDelete(sectionIndex);
    } else {
      onUpdate(sectionIndex, content);
    }
    onStopEditing();
  };

  const handleBlur = () => {
    handleSaveOrDelete(value);
  };

  const handleEditClick = () => {
    // Capture the current height of the rendered section before editing
    if (sectionRef.current) {
      const height = sectionRef.current.offsetHeight;
      setInitialHeight(height);
    }
    onEdit(sectionIndex);
  };

  if (isEditing) {
    const typographyClass = getTypographyClass(value);
    
    return (
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        className={`w-full bg-transparent border-none outline-none resize-none hover:bg-muted/10 rounded-md transition-colors ${typographyClass}`}
        style={{ 
          minHeight: '100px',
          height: 'auto',
          whiteSpace: 'pre-wrap',
          wordWrap: 'break-word',
          boxShadow: 'none',
          overflow: 'hidden'
        }}
        placeholder="Type your content here..."
      />
    );
  }

  return (
    <div 
      ref={sectionRef}
      className="cursor-pointer hover:bg-muted/10 rounded-md transition-colors"
      onClick={handleEditClick}
      title="Click to edit this section"
    >
      {renderSection(section)}
    </div>
  );
}

export function UnifiedMarkdownEditor() {
  const [markdown, setMarkdown] = useState(defaultMarkdownContent);
  const [editingSectionIndex, setEditingSectionIndex] = useState<number | null>(null);

  const sections = parseMarkdownSections(markdown);

  const updateSection = (index: number, content: string) => {
    const newSections = [...sections];
    newSections[index] = content;
    setMarkdown(newSections.join('\n\n'));
  };

  const deleteSection = (index: number) => {
    const newSections = [...sections];
    newSections.splice(index, 1);
    setMarkdown(newSections.join('\n\n'));
    setEditingSectionIndex(null);
  };

  return (
    <div className="w-full max-w-2xl lg:max-w-3xl px-4 sm:px-6 lg:px-8 py-8 text-left">
      {/* Document Content */}
      <div className="space-y-0">
        {sections.map((section, index) => (
          <EditableSection
            key={index}
            section={section}
            sectionIndex={index}
            isEditing={editingSectionIndex === index}
            onEdit={setEditingSectionIndex}
            onUpdate={updateSection}
            onDelete={deleteSection}
            onStopEditing={() => setEditingSectionIndex(null)}
          />
        ))}
      </div>
    </div>
  );
}
