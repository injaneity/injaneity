import { cva } from 'class-variance-authority';

export const typographyVariants = cva(
  // Base styles - only the typography class as single source of truth
  "",
  {
    variants: {
      variant: {
        title: "typography-title",
        h2: "typography-h2", 
        h3: "typography-h3",
        body: "typography-body",
        caption: "typography-caption",
      },
    },
    defaultVariants: {
      variant: "body",
    },
  }
);

// Function to get CSS class name for textarea styling
export const getTypographyClass = (content: string): string => {
  const trimmedContent = content.trim();
  const firstLine = trimmedContent.split('\n')[0].trim();
  
  if (firstLine.startsWith('# ')) {
    return 'typography-title';
  } else if (firstLine.startsWith('## ')) {
    return 'typography-h2';
  } else if (firstLine.startsWith('### ')) {
    return 'typography-h3';
  } else {
    return 'typography-body';
  }
};
