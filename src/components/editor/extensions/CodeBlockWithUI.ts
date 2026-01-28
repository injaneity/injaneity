import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { Transaction } from '@tiptap/pm/state';
import { EditorState } from '@tiptap/pm/state';
import CodeBlockComponent from '../CodeBlockComponent';

export const CodeBlockWithUI = CodeBlockLowlight.extend({
  name: 'codeBlockWithUI',

  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockComponent);
  },

  addKeyboardShortcuts() {
    return {
      // Handle Tab to indent
      Tab: () => {
        if (this.editor.isActive('codeBlock')) {
          return this.editor.commands.command(({ tr }: { tr: Transaction }) => {
            // Insert 2 spaces for indentation
            tr.insertText('  ');
            return true;
          });
        }
        return false;
      },
      // Handle Shift-Tab to outdent
      'Shift-Tab': () => {
        if (this.editor.isActive('codeBlock')) {
          return this.editor.commands.command(({ tr, state }: { tr: Transaction; state: EditorState }) => {
            const { selection } = state;
            const { $from } = selection;

            // Get the current line
            const line = $from.parent.textContent;
            const lineStart = $from.start();

            // Check if line starts with spaces
            const leadingSpaces = line.match(/^(\s+)/)?.[0].length || 0;
            if (leadingSpaces > 0) {
              // Remove up to 2 spaces from the beginning
              const spacesToRemove = Math.min(2, leadingSpaces);
              tr.delete(lineStart, lineStart + spacesToRemove);
              return true;
            }

            return false;
          });
        }
        return false;
      },
      // Handle Backspace to remove full indent
      Backspace: () => {
        if (this.editor.isActive('codeBlock')) {
          return this.editor.commands.command(({ tr, state }: { tr: Transaction; state: EditorState }) => {
            const { selection } = state;
            const { $from, empty } = selection;

            // Only handle if selection is empty (no text selected)
            if (!empty) {
              return false;
            }

            const lineStart = $from.start();
            const cursorPos = $from.pos;
            const textBefore = state.doc.textBetween(lineStart, cursorPos);

            // Check if we're only deleting spaces at the start of the line
            const onlySpacesBefore = /^\s+$/.test(textBefore);

            if (onlySpacesBefore && textBefore.length > 0) {
              // Calculate how many spaces to delete (up to 2, or all remaining)
              const spacesToDelete = textBefore.length % 2 === 0 ? 2 : textBefore.length % 2;
              tr.delete(cursorPos - spacesToDelete, cursorPos);
              return true;
            }

            return false;
          });
        }
        return false;
      },
    };
  },
});
