import { EditorState, type Range } from '@codemirror/state';
import { EditorView, Decoration, ViewPlugin, WidgetType, keymap, placeholder, drawSelection, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { syntaxTree } from '@codemirror/language';
import { markdownKeymap, markdownLanguage } from '@codemirror/lang-markdown';

class Bullet extends WidgetType {
  toDOM() { const span = document.createElement('span'); span.textContent = '•'; span.className = 'live-bullet'; return span; }
}

class Task extends WidgetType {
  checked: boolean;
  constructor(checked: boolean) { super(); this.checked = checked; }
  eq(other: Task) { return other.checked === this.checked; }
  toDOM() { const span = document.createElement('span'); span.textContent = this.checked ? '☑' : '☐'; span.className = 'live-task'; return span; }
}

function decorate(view: EditorView): DecorationSet {
  const { state } = view;
  const ranges: Range<Decoration>[] = [];
  const lines = new Map<number, Set<string>>();
  const active = (from: number, to: number) => view.hasFocus && state.selection.ranges.some(selection =>
    state.doc.lineAt(selection.from).from <= to && state.doc.lineAt(selection.to).to >= from);
  const mark = (from: number, to: number, className: string) => {
    if (to > from) ranges.push(Decoration.mark({ class: className }).range(from, to));
  };
  const hide = (from: number, to: number) => {
    if (to > from && state.doc.lineAt(from).number === state.doc.lineAt(to).number) ranges.push(Decoration.replace({}).range(from, to));
  };
  const lineStyle = (from: number, to: number, className: string) => {
    for (const visible of view.visibleRanges) {
      const start = Math.max(from, visible.from), end = Math.min(to, visible.to);
      if (start > end) continue;
      for (let n = state.doc.lineAt(start).number; n <= state.doc.lineAt(end).number; n++) {
        const position = state.doc.line(n).from;
        if (!lines.has(position)) lines.set(position, new Set());
        lines.get(position)!.add(className);
      }
    }
  };
  const seen = new Set<string>();
  for (const visible of view.visibleRanges) syntaxTree(state).iterate({
    from: visible.from, to: visible.to,
    enter({ node, name, from, to }) {
      const id = `${name}:${from}:${to}`;
      if (seen.has(id)) return false;
      seen.add(id);
      if (/^(ATX|Setext)Heading[1-6]$/.test(name)) lineStyle(from, to, `live-h${name.at(-1)}`);
      if (name === 'StrongEmphasis') mark(from, to, 'live-strong');
      if (name === 'Emphasis') mark(from, to, 'live-emphasis');
      if (name === 'Strikethrough') mark(from, to, 'live-strike');
      if (name === 'InlineCode') mark(from, to, 'live-inline-code');
      if (name === 'Blockquote') lineStyle(from, to, 'live-quote');
      if (name === 'ListItem') lineStyle(from, to, 'live-list');
      if (name === 'Table') lineStyle(from, to, 'live-table');
      if (name === 'HTMLBlock') { lineStyle(from, to, 'live-code'); return false; }
      if (name === 'FencedCode' || name === 'CodeBlock') {
        lineStyle(from, to, 'live-code');
        if (name === 'FencedCode') for (let child = node.firstChild; child; child = child.nextSibling) {
          if (child.name === 'CodeMark' || child.name === 'CodeInfo') {
            if (!active(from, to)) hide(child.from, child.to);
            else mark(child.from, child.to, 'live-syntax');
          }
        }
        return false;
      }
      if (name === 'Link' || name === 'Image') {
        const children = [];
        for (let child = node.firstChild; child; child = child.nextSibling) children.push(child);
        const opening = children.find(child => child.name === 'LinkMark');
        const closing = children.find(child => child.name === 'LinkMark' && state.sliceDoc(child.from, child.to) === ']');
        if (opening && closing && !active(from, to) && state.doc.lineAt(from).number === state.doc.lineAt(to).number) {
          hide(from, opening.to);
          hide(closing.from, to);
          mark(opening.to, closing.from, name === 'Image' ? 'live-image-label' : 'live-link');
        } else mark(from, to, 'live-link');
      }
      if (name === 'HeaderMark' || name === 'EmphasisMark' || name === 'StrikethroughMark' || name === 'CodeMark' || name === 'QuoteMark') {
        const parent = node.parent!;
        if (!active(parent.from, parent.to)) {
          const trailingSpace = /^(HeaderMark|QuoteMark)$/.test(name) && state.sliceDoc(to, to + 1) === ' ' ? 1 : 0;
          hide(from, to + trailingSpace);
        } else mark(from, to, 'live-syntax');
      }
      if (name === 'ListMark' && /^[*+-]$/.test(state.sliceDoc(from, to)) && !active(from, to)) ranges.push(Decoration.replace({ widget: new Bullet() }).range(from, to));
      if (name === 'TaskMarker' && !active(from, to)) ranges.push(Decoration.replace({ widget: new Task(/x/i.test(state.sliceDoc(from, to))) }).range(from, to));
    },
  });
  for (const [from, classes] of lines) ranges.push(Decoration.line({ class: [...classes].join(' ') }).range(from));
  return Decoration.set(ranges, true);
}

const livePreview = ViewPlugin.fromClass(class {
  decorations: DecorationSet;
  constructor(view: EditorView) { this.decorations = decorate(view); }
  update(update: ViewUpdate) {
    if (update.docChanged || update.selectionSet || update.viewportChanged || update.focusChanged || syntaxTree(update.startState) !== syntaxTree(update.state)) this.decorations = decorate(update.view);
  }
}, { decorations: plugin => plugin.decorations });

export function createLiveEditor(parent: HTMLElement, onChange: () => void, onLimit: () => void, limit: number) {
  const extensions = [
    markdownLanguage,
    history(), drawSelection(), EditorView.lineWrapping, livePreview,
    placeholder('start writing…'),
    keymap.of([...markdownKeymap, ...defaultKeymap, ...historyKeymap]),
    EditorView.contentAttributes.of({ 'aria-label': 'markdown', 'aria-multiline': 'true', spellcheck: 'true', autocapitalize: 'sentences' }),
    EditorView.updateListener.of(update => { if (update.docChanged) onChange(); }),
    EditorState.transactionFilter.of(transaction => {
      if (transaction.docChanged && transaction.newDoc.length > limit) { queueMicrotask(onLimit); return []; }
      return transaction;
    }),
  ];
  const view = new EditorView({ parent, state: EditorState.create({ extensions }) });
  return {
    view,
    get source() { return view.state.sliceDoc(); },
    setSource(source: string) {
      // A different draft gets its own history; undo cannot overwrite another page.
      view.setState(EditorState.create({ doc: source, extensions: [...extensions, EditorState.lineSeparator.of(source.includes('\r\n') ? '\r\n' : '\n')] }));
      view.scrollDOM.scrollTop = 0;
    },
  };
}
