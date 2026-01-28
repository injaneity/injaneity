import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { TextSelection } from '@tiptap/pm/state';
import CodeBlockComponent from '../CodeBlockComponent';

export const CodeBlockWithUI = CodeBlockLowlight.extend({
  name: 'codeBlock',

  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockComponent);
  },

  addKeyboardShortcuts() {
    return {
      // Handle Tab to indent
      Tab: () => {
        console.log('[Tab] Pressed, isActive:', this.editor.isActive('codeBlock'));
        if (this.editor.isActive('codeBlock')) {
          console.log('[Tab] Inserting 2 spaces');
          const { state, view } = this.editor;
          const { tr, selection } = state;
          tr.insertText('  ', selection.from, selection.to);
          view.dispatch(tr);
          console.log('[Tab] Insert complete');
          return true;
        }
        return false;
      },

      // Handle Shift+Tab to outdent
      'Shift-Tab': () => {
        console.log('[Shift-Tab] Pressed, isActive:', this.editor.isActive('codeBlock'));
        if (this.editor.isActive('codeBlock')) {
          const { state, view } = this.editor;
          const { tr, selection } = state;
          const { $from } = selection;

          // Get the current line
          const line = $from.parent.textContent;
          const lineStart = $from.start();

          // Check if line starts with spaces
          const leadingSpaces = line.match(/^(\s+)/)?.[0].length || 0;
          console.log('[Shift-Tab] Leading spaces:', leadingSpaces);
          if (leadingSpaces > 0) {
            // Remove up to 2 spaces from the beginning
            const spacesToRemove = Math.min(2, leadingSpaces);
            tr.delete(lineStart, lineStart + spacesToRemove);
            view.dispatch(tr);
            console.log('[Shift-Tab] Outdent complete');
            return true;
          }

          return false;
        }
        return false;
      },

      // Handle Shift+Enter to create new line within code block (stay inside)
      'Shift-Enter': () => {
        console.log('[Shift-Enter] Pressed, isActive:', this.editor.isActive('codeBlock'));
        if (this.editor.isActive('codeBlock')) {
          console.log('[Shift-Enter] Inserting newline');
          const { state, view } = this.editor;
          const { tr, selection } = state;
          tr.insertText('\n', selection.from, selection.to);
          view.dispatch(tr);
          console.log('[Shift-Enter] Insert complete');
          return true;
        }
        return false;
      },

      // Handle Enter to exit code block and create new paragraph
      Enter: () => {
        if (this.editor.isActive('codeBlock')) {
          const { state, view } = this.editor;
          const { selection } = state;
          const { $from } = selection;

          // Check if we're at the end of the code block
          const isAtEnd = $from.parentOffset === $from.parent.nodeSize - 2;

          // Check if current line is empty
          const textContent = $from.parent.textContent;
          const currentLineStart = textContent.lastIndexOf('\n', $from.parentOffset - 1) + 1;
          const currentLineEnd = textContent.indexOf('\n', $from.parentOffset);
          const currentLine = textContent.slice(
            currentLineStart,
            currentLineEnd === -1 ? textContent.length : currentLineEnd
          );

          // If current line is empty or we're at the end, exit the code block
          if (currentLine.trim() === '' || isAtEnd) {
            return this.editor.commands.exitCode();
          }

          // Otherwise, insert a newline within the code block
          const { tr } = state;
          tr.insertText('\n', selection.from, selection.to);
          view.dispatch(tr);
          return true;
        }
        return false;
      },

      // Handle Backspace to remove full indent and matching braces
      Backspace: () => {
        if (this.editor.isActive('codeBlock')) {
          const { state, view } = this.editor;
          const { tr, selection } = state;
          const { $from, empty } = selection;

          // Only handle if selection is empty (no text selected)
          if (!empty) {
            return false;
          }

          const lineStart = $from.start();
          const cursorPos = $from.pos;
          const textBefore = state.doc.textBetween(lineStart, cursorPos);

          // Check if we're deleting between matching braces
          const charBefore = state.doc.textBetween(cursorPos - 1, cursorPos);
          const charAfter = state.doc.textBetween(cursorPos, cursorPos + 1);
          const matchingBraces: Record<string, string> = { '{': '}', '[': ']', '(': ')' };

          if (matchingBraces[charBefore] === charAfter) {
            // Delete both the opening and closing brace
            tr.delete(cursorPos - 1, cursorPos + 1);
            view.dispatch(tr);
            return true;
          }

          // Check if we're only deleting spaces at the start of the line
          const onlySpacesBefore = /^\s+$/.test(textBefore);

          if (onlySpacesBefore && textBefore.length > 0) {
            // Calculate how many spaces to delete (up to 2, or all remaining)
            const spacesToDelete = textBefore.length % 2 === 0 ? 2 : textBefore.length % 2;
            tr.delete(cursorPos - spacesToDelete, cursorPos);
            view.dispatch(tr);
            return true;
          }

          return false;
        }
        return false;
      },

      // Auto-complete opening braces
      '{': () => {
        if (this.editor.isActive('codeBlock')) {
          const { state, view } = this.editor;
          const { tr, selection } = state;
          const { from, to } = selection;

          tr.insertText('{}', from, to);
          tr.setSelection(TextSelection.create(tr.doc, from + 1));
          view.dispatch(tr);
          return true;
        }
        return false;
      },

      '[': () => {
        if (this.editor.isActive('codeBlock')) {
          const { state, view } = this.editor;
          const { tr, selection } = state;
          const { from, to } = selection;

          tr.insertText('[]', from, to);
          tr.setSelection(TextSelection.create(tr.doc, from + 1));
          view.dispatch(tr);
          return true;
        }
        return false;
      },

      '(': () => {
        if (this.editor.isActive('codeBlock')) {
          const { state, view } = this.editor;
          const { tr, selection } = state;
          const { from, to } = selection;

          tr.insertText('()', from, to);
          tr.setSelection(TextSelection.create(tr.doc, from + 1));
          view.dispatch(tr);
          return true;
        }
        return false;
      },

      // Skip over closing braces if they're already there
      '}': () => {
        if (this.editor.isActive('codeBlock')) {
          const { state, view } = this.editor;
          const { tr, selection } = state;
          const { from, empty } = selection;

          if (!empty) return false;

          const charAfter = state.doc.textBetween(from, from + 1);
          if (charAfter === '}') {
            // Just move cursor forward
            tr.setSelection(TextSelection.create(tr.doc, from + 1));
            view.dispatch(tr);
            return true;
          }

          return false;
        }
        return false;
      },

      ']': () => {
        if (this.editor.isActive('codeBlock')) {
          const { state, view } = this.editor;
          const { tr, selection } = state;
          const { from, empty } = selection;

          if (!empty) return false;

          const charAfter = state.doc.textBetween(from, from + 1);
          if (charAfter === ']') {
            // Just move cursor forward
            tr.setSelection(TextSelection.create(tr.doc, from + 1));
            view.dispatch(tr);
            return true;
          }

          return false;
        }
        return false;
      },

      ')': () => {
        if (this.editor.isActive('codeBlock')) {
          const { state, view } = this.editor;
          const { tr, selection } = state;
          const { from, empty } = selection;

          if (!empty) return false;

          const charAfter = state.doc.textBetween(from, from + 1);
          if (charAfter === ')') {
            // Just move cursor forward
            tr.setSelection(TextSelection.create(tr.doc, from + 1));
            view.dispatch(tr);
            return true;
          }

          return false;
        }
        return false;
      },
    };
  },
});
