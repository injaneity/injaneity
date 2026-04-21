import { layoutWithLines, prepareWithSegments, type PreparedTextWithSegments } from '@chenglou/pretext';

type BlockKind =
  | 'paragraph'
  | 'heading-1'
  | 'heading-2'
  | 'heading-3'
  | 'blockquote'
  | 'unordered-list-item'
  | 'ordered-list-item'
  | 'code'
  | 'horizontal-rule';

interface EditorBlock {
  id: string;
  source: string;
  kind: BlockKind;
  className: string;
  font: string;
  lineHeight: number;
  insetLeft: number;
  insetRight: number;
  paddingY: number;
  gapAfter: number;
  top: number;
  height: number;
  measuredWidth: number;
  prepared: PreparedTextWithSegments | null;
  measureKey: string;
}

interface SimpleMarkdownEditorOptions {
  root: HTMLElement;
  initialMarkdown: string;
  placeholder?: string;
}

function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeText(text: string) {
  return text.replace(/\r\n/g, '\n').replace(/\u00a0/g, ' ');
}

function splitMarkdownIntoBlocks(markdown: string) {
  const normalized = markdown.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  const blocks: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? '';
    const trimmed = line.trim();

    if (!trimmed) {
      blocks.push('');
      index += 1;
      continue;
    }

    if (/^(```|~~~)/.test(trimmed)) {
      const start = index;
      const fence = trimmed.slice(0, 3);
      index += 1;
      while (index < lines.length && !lines[index].trim().startsWith(fence)) {
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push(lines.slice(start, index).join('\n'));
      continue;
    }

    if (/^(---|\*\*\*|___)$/.test(trimmed) || /^(#{1,3})\s+/.test(line)) {
      blocks.push(line);
      index += 1;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const start = index;
      index += 1;
      while (index < lines.length && /^>\s?/.test(lines[index] ?? '')) {
        index += 1;
      }
      blocks.push(lines.slice(start, index).join('\n'));
      continue;
    }

    if (/^\s*[-*+]\s+/.test(line) || /^\s*\d+\.\s+/.test(line)) {
      const listPattern = /^\s*[-*+]\s+/.test(line) ? /^\s*[-*+]\s+/ : /^\s*\d+\.\s+/;
      const start = index;
      index += 1;
      while (index < lines.length && listPattern.test(lines[index] ?? '')) {
        index += 1;
      }
      blocks.push(lines.slice(start, index).join('\n'));
      continue;
    }

    const start = index;
    index += 1;
    while (index < lines.length) {
      const next = lines[index] ?? '';
      const nextTrimmed = next.trim();
      if (!nextTrimmed) break;
      if (/^(---|\*\*\*|___)$/.test(nextTrimmed)) break;
      if (/^(#{1,3})\s+/.test(next)) break;
      if (/^>\s?/.test(next)) break;
      if (/^\s*[-*+]\s+/.test(next)) break;
      if (/^\s*\d+\.\s+/.test(next)) break;
      if (/^(```|~~~)/.test(nextTrimmed)) break;
      index += 1;
    }
    blocks.push(lines.slice(start, index).join('\n'));
  }

  return blocks.length > 0 ? blocks : [''];
}

function classifyKind(source: string): BlockKind {
  const trimmed = source.trim();

  if (/^(---|\*\*\*|___)$/.test(trimmed)) return 'horizontal-rule';
  if (/^#{1}\s+/.test(source)) return 'heading-1';
  if (/^#{2}\s+/.test(source)) return 'heading-2';
  if (/^#{3}\s+/.test(source)) return 'heading-3';
  if (/^>\s?/.test(source)) return 'blockquote';
  if (/^\s*[-*+]\s+/.test(source)) return 'unordered-list-item';
  if (/^\s*\d+\.\s+/.test(source)) return 'ordered-list-item';
  if (/^(```|~~~)/.test(trimmed) || /^\s{4}/.test(source)) return 'code';
  return 'paragraph';
}

function getBlockStyle(kind: BlockKind) {
  switch (kind) {
    case 'heading-1':
      return {
        className: 'simple-block simple-block--heading-1',
        font: '500 48px "Source Serif Pro", Georgia, serif',
        lineHeight: 58,
        insetLeft: 0,
        insetRight: 0,
        paddingY: 0,
        gapAfter: 16,
      };
    case 'heading-2':
      return {
        className: 'simple-block simple-block--heading-2',
        font: '700 32px "Sohne Bold", system-ui, sans-serif',
        lineHeight: 42,
        insetLeft: 0,
        insetRight: 0,
        paddingY: 0,
        gapAfter: 12,
      };
    case 'heading-3':
      return {
        className: 'simple-block simple-block--heading-3',
        font: '600 24px "Sohne Medium", system-ui, sans-serif',
        lineHeight: 34,
        insetLeft: 0,
        insetRight: 0,
        paddingY: 0,
        gapAfter: 8,
      };
    case 'blockquote':
      return {
        className: 'simple-block simple-block--blockquote',
        font: '400 18px "Sohne Regular", system-ui, sans-serif',
        lineHeight: 31,
        insetLeft: 0,
        insetRight: 0,
        paddingY: 12,
        gapAfter: 24,
      };
    case 'unordered-list-item':
      return {
        className: 'simple-block simple-block--unordered-list-item',
        font: '400 18px "Sohne Regular", system-ui, sans-serif',
        lineHeight: 31,
        insetLeft: 24,
        insetRight: 0,
        paddingY: 0,
        gapAfter: 8,
      };
    case 'ordered-list-item':
      return {
        className: 'simple-block simple-block--ordered-list-item',
        font: '400 18px "Sohne Regular", system-ui, sans-serif',
        lineHeight: 31,
        insetLeft: 24,
        insetRight: 0,
        paddingY: 0,
        gapAfter: 8,
      };
    case 'code':
      return {
        className: 'simple-block simple-block--code',
        font: '400 14px Monaco, "Courier New", monospace',
        lineHeight: 21,
        insetLeft: 16,
        insetRight: 16,
        paddingY: 16,
        gapAfter: 24,
      };
    case 'horizontal-rule':
      return {
        className: 'simple-block simple-block--horizontal-rule',
        font: '400 18px "Sohne Regular", system-ui, sans-serif',
        lineHeight: 1,
        insetLeft: 0,
        insetRight: 0,
        paddingY: 16,
        gapAfter: 32,
      };
    case 'paragraph':
    default:
      return {
        className: 'simple-block simple-block--paragraph',
        font: '400 18px "Sohne Regular", system-ui, sans-serif',
        lineHeight: 31,
        insetLeft: 0,
        insetRight: 0,
        paddingY: 0,
        gapAfter: 24,
      };
  }
}

function createBlock(source = ''): EditorBlock {
  const kind = classifyKind(source);
  const style = getBlockStyle(kind);
  return {
    id: createId(),
    source,
    kind,
    className: style.className,
    font: style.font,
    lineHeight: style.lineHeight,
    insetLeft: style.insetLeft,
    insetRight: style.insetRight,
    paddingY: style.paddingY,
    gapAfter: style.gapAfter,
    top: 0,
    height: style.lineHeight + style.paddingY * 2,
    measuredWidth: 0,
    prepared: null,
    measureKey: '',
  };
}

function getSelectionOffsets(element: HTMLElement) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return { start: 0, end: 0 };
  }

  const range = selection.getRangeAt(0);
  if (!element.contains(range.startContainer) || !element.contains(range.endContainer)) {
    const fallback = element.textContent?.length ?? 0;
    return { start: fallback, end: fallback };
  }

  const startRange = range.cloneRange();
  startRange.selectNodeContents(element);
  startRange.setEnd(range.startContainer, range.startOffset);

  const endRange = range.cloneRange();
  endRange.selectNodeContents(element);
  endRange.setEnd(range.endContainer, range.endOffset);

  return {
    start: startRange.toString().length,
    end: endRange.toString().length,
  };
}

function getFenceLines(source: string) {
  const lines = source.split('\n');
  if (lines.length >= 2 && /^(```|~~~)/.test(lines[0]?.trim() ?? '') && /^(```|~~~)/.test(lines[lines.length - 1]?.trim() ?? '')) {
    return {
      opening: lines[0] ?? '',
      body: lines.slice(1, -1),
      closing: lines[lines.length - 1] ?? '',
    };
  }
  return {
    opening: '',
    body: lines,
    closing: '',
  };
}

function escapeHtml(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function stripInlineMarkdown(text: string) {
  return text
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '$1')
    .replace(/(?<!_)_([^_]+)_(?!_)/g, '$1')
    .replace(/`([^`]+)`/g, '$1');
}

function renderInlineHtml(text: string) {
  const tokens: string[] = [];
  const tokenStart = '\uE000';
  const tokenEnd = '\uE001';
  let html = text;

  const protect = (pattern: RegExp, render: (...args: string[]) => string) => {
    html = html.replace(pattern, (...args) => {
      const token = `${tokenStart}${tokens.length}${tokenEnd}`;
      tokens.push(render(...(args.slice(1, -2) as string[])));
      return token;
    });
  };

  protect(/<br\s*\/?>/gi, () => '<br>');
  html = escapeHtml(html);
  protect(/\[([^\]]+)\]\(([^)]+)\)/g, (label, href) => {
    const safeHref = escapeHtml(href);
    return `<a href="${safeHref}">${renderInlineHtml(label)}</a>`;
  });
  protect(/`([^`]+)`/g, (code) => `<code>${escapeHtml(code)}</code>`);
  protect(/\*\*([^*]+)\*\*/g, (strong) => `<strong>${renderInlineHtml(strong)}</strong>`);
  protect(/__([^_]+)__/g, (strong) => `<strong>${renderInlineHtml(strong)}</strong>`);
  protect(/(?<!\*)\*([^*]+)\*(?!\*)/g, (em) => `<em>${renderInlineHtml(em)}</em>`);
  protect(/(?<!_)_([^_]+)_(?!_)/g, (em) => `<em>${renderInlineHtml(em)}</em>`);

  html = html.replace(/\n/g, '<br>');
  return tokens.reduce((result, tokenHtml, index) => result.replace(`${tokenStart}${index}${tokenEnd}`, tokenHtml), html);
}

function getDisplayLines(kind: BlockKind, source: string) {
  const lines = source.split('\n');

  switch (kind) {
    case 'heading-1':
    case 'heading-2':
    case 'heading-3':
      return [source.replace(/^#{1,3}\s+/, '')];
    case 'blockquote':
      return lines.map((line) => line.replace(/^>\s?/, ''));
    case 'unordered-list-item':
      return lines.map((line) => line.replace(/^\s*[-*+]\s+/, ''));
    case 'ordered-list-item':
      return lines.map((line) => line.replace(/^\s*\d+\.\s+/, ''));
    case 'code': {
      const fence = getFenceLines(source);
      return fence.body;
    }
    case 'horizontal-rule':
      return [''];
    case 'paragraph':
    default:
      return lines;
  }
}

function getDisplayText(kind: BlockKind, source: string) {
  return getDisplayLines(kind, source).map(stripInlineMarkdown).join('\n');
}

function getEditableText(kind: BlockKind, source: string) {
  return getDisplayLines(kind, source).join('\n');
}

function mapSourceOffsetToDisplay(kind: BlockKind, source: string, sourceOffset: number) {
  if (kind === 'horizontal-rule') {
    return 0;
  }

  if (kind === 'code') {
    const { opening, body } = getFenceLines(source);
    const openingOffset = opening ? opening.length + 1 : 0;
    const displayText = body.join('\n');
    return Math.max(0, Math.min(displayText.length, sourceOffset - openingOffset));
  }

  const sourceLines = source.split('\n');
  const displayLines = getDisplayLines(kind, source);
  let sourceCount = 0;
  let displayCount = 0;

  for (let index = 0; index < sourceLines.length; index += 1) {
    const sourceLine = sourceLines[index] ?? '';
    const displayLine = displayLines[index] ?? sourceLine;
    const prefixLength = Math.max(0, sourceLine.length - displayLine.length);
    const lineSourceStart = sourceCount;
    const lineDisplayStart = displayCount;
    const lineSourceEnd = lineSourceStart + sourceLine.length;

    if (sourceOffset <= lineSourceStart + prefixLength) {
      return lineDisplayStart;
    }

    if (sourceOffset <= lineSourceEnd) {
      return lineDisplayStart + Math.min(displayLine.length, sourceOffset - lineSourceStart - prefixLength);
    }

    sourceCount = lineSourceEnd;
    displayCount = lineDisplayStart + displayLine.length;

    if (index < sourceLines.length - 1) {
      if (sourceOffset <= sourceCount + 1) {
        return displayCount;
      }
      sourceCount += 1;
      displayCount += 1;
    }
  }

  return displayCount;
}

function mapDisplayOffsetToSource(kind: BlockKind, source: string, displayOffset: number) {
  if (kind === 'horizontal-rule') {
    return source.length;
  }

  if (kind === 'code') {
    const { opening, body } = getFenceLines(source);
    const openingOffset = opening ? opening.length + 1 : 0;
    const displayText = body.join('\n');
    return Math.min(source.length, openingOffset + Math.min(displayOffset, displayText.length));
  }

  const sourceLines = source.split('\n');
  const displayLines = getDisplayLines(kind, source);
  let displayCount = 0;
  let sourceCount = 0;

  for (let index = 0; index < sourceLines.length; index += 1) {
    const sourceLine = sourceLines[index] ?? '';
    const displayLine = displayLines[index] ?? sourceLine;
    const prefixLength = sourceLine.length - displayLine.length;
    const nextDisplayCount = displayCount + displayLine.length;

    if (displayOffset <= nextDisplayCount) {
      return Math.min(source.length, sourceCount + prefixLength + (displayOffset - displayCount));
    }

    displayCount = nextDisplayCount;
    sourceCount += sourceLine.length;

    if (index < sourceLines.length - 1) {
      if (displayOffset === displayCount) {
        return sourceCount;
      }
      displayCount += 1;
      sourceCount += 1;
      if (displayOffset <= displayCount) {
        return sourceCount;
      }
    }
  }

  return source.length;
}

function rebuildSourceFromDisplay(kind: BlockKind, displayText: string, previousSource: string) {
  switch (kind) {
    case 'heading-1':
      return displayText ? `# ${displayText}` : '# ';
    case 'heading-2':
      return displayText ? `## ${displayText}` : '## ';
    case 'heading-3':
      return displayText ? `### ${displayText}` : '### ';
    case 'blockquote':
      return displayText
        ? displayText.split('\n').map((line) => `> ${line}`).join('\n')
        : '> ';
    case 'unordered-list-item':
      return displayText
        ? displayText.split('\n').map((line) => `- ${line}`).join('\n')
        : '- ';
    case 'ordered-list-item': {
      const start = Number.parseInt((previousSource.match(/^\s*(\d+)\./)?.[1] ?? '1'), 10) || 1;
      return displayText
        ? displayText.split('\n').map((line, index) => `${start + index}. ${line}`).join('\n')
        : `${start}. `;
    }
    case 'code': {
      const { opening, closing } = getFenceLines(previousSource);
      const open = opening || '```';
      const close = closing || '```';
      return `${open}\n${displayText}\n${close}`;
    }
    case 'horizontal-rule':
      return previousSource;
    case 'paragraph':
    default:
      return displayText;
  }
}

function getBlockElementFromEventTarget(target: EventTarget | null) {
  return (target instanceof HTMLElement ? target.closest<HTMLElement>('[data-block-id]') : null);
}

function hasSelectionInside(element: HTMLElement) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return false;
  const range = selection.getRangeAt(0);
  return element.contains(range.startContainer) && element.contains(range.endContainer);
}

function resolveTextPosition(element: HTMLElement, offset: number) {
  const clamped = Math.max(0, Math.min(offset, element.textContent?.length ?? 0));
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let currentOffset = 0;
  let targetNode: Node | null = null;
  let targetOffset = 0;

  while (walker.nextNode()) {
    const node = walker.currentNode;
    const length = node.textContent?.length ?? 0;
    if (currentOffset + length >= clamped) {
      targetNode = node;
      targetOffset = clamped - currentOffset;
      break;
    }
    currentOffset += length;
  }

  if (!targetNode) {
    if (element.firstChild?.nodeType === Node.TEXT_NODE) {
      targetNode = element.firstChild;
      targetOffset = targetNode.textContent?.length ?? 0;
    } else {
      const textNode = document.createTextNode(element.textContent ?? '');
      element.replaceChildren(textNode);
      targetNode = textNode;
      targetOffset = textNode.textContent?.length ?? 0;
    }
  }

  return { node: targetNode, offset: targetOffset };
}

function setSelectionOffsets(element: HTMLElement, start: number, end: number) {
  const selection = window.getSelection();
  if (!selection) return;

  const startPosition = resolveTextPosition(element, start);
  const endPosition = resolveTextPosition(element, end);
  if (!startPosition.node || !endPosition.node) return;

  const range = document.createRange();
  range.setStart(startPosition.node, startPosition.offset);
  range.setEnd(endPosition.node, endPosition.offset);
  selection.removeAllRanges();
  selection.addRange(range);
}

function setCaretOffset(element: HTMLElement, offset: number) {
  setSelectionOffsets(element, offset, offset);
}

export class SimpleMarkdownEditor {
  private readonly root: HTMLElement;
  private readonly placeholder: string;
  private readonly blocks: EditorBlock[];
  private readonly elements = new Map<string, HTMLElement>();
  private readonly resizeObserver: ResizeObserver;
  private activeBlockId: string | null = null;
  private editingBlockId: string | null = null;
  private resizeFrame: number | null = null;

  constructor(options: SimpleMarkdownEditorOptions) {
    this.root = options.root;
    this.placeholder = options.placeholder ?? 'Start writing...';
    this.blocks = splitMarkdownIntoBlocks(options.initialMarkdown).map((line) => createBlock(line));

    this.handleInput = this.handleInput.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleFocusIn = this.handleFocusIn.bind(this);
    this.handleFocusOut = this.handleFocusOut.bind(this);
    this.handlePointerDown = this.handlePointerDown.bind(this);
    this.handleDoubleClick = this.handleDoubleClick.bind(this);
    this.handlePaste = this.handlePaste.bind(this);
    this.handleResize = this.handleResize.bind(this);

    this.root.className = 'simple-markdown-editor';
    this.root.addEventListener('input', this.handleInput);
    this.root.addEventListener('keydown', this.handleKeyDown);
    this.root.addEventListener('focusin', this.handleFocusIn);
    this.root.addEventListener('focusout', this.handleFocusOut);
    this.root.addEventListener('pointerdown', this.handlePointerDown);
    this.root.addEventListener('dblclick', this.handleDoubleClick);
    this.root.addEventListener('paste', this.handlePaste);

    this.blocks.forEach((block) => this.root.appendChild(this.createElement(block)));

    this.resizeObserver = new ResizeObserver(this.handleResize);
    this.resizeObserver.observe(this.root);

    this.relayoutAll();
  }

  destroy() {
    this.root.removeEventListener('input', this.handleInput);
    this.root.removeEventListener('keydown', this.handleKeyDown);
    this.root.removeEventListener('focusin', this.handleFocusIn);
    this.root.removeEventListener('focusout', this.handleFocusOut);
    this.root.removeEventListener('pointerdown', this.handlePointerDown);
    this.root.removeEventListener('dblclick', this.handleDoubleClick);
    this.root.removeEventListener('paste', this.handlePaste);
    this.resizeObserver.disconnect();
    if (this.resizeFrame !== null) cancelAnimationFrame(this.resizeFrame);
    this.elements.clear();
  }

  getMarkdown() {
    return this.blocks.map((block) => block.source).join('\n');
  }

  private handleResize() {
    if (this.resizeFrame !== null) return;
    this.resizeFrame = requestAnimationFrame(() => {
      this.resizeFrame = null;
      this.relayoutAll();
    });
  }

  private handleFocusIn(event: FocusEvent) {
    const target = getBlockElementFromEventTarget(event.target);
    const id = target?.dataset.blockId ?? null;
    const previousActiveId = this.activeBlockId;
    this.activeBlockId = id;
    if (!id || !target) return;

    const index = this.getBlockIndex(id);
    if (index === -1) return;

    if (previousActiveId && previousActiveId !== id) {
      const previousIndex = this.getBlockIndex(previousActiveId);
      if (previousIndex !== -1) this.measureBlock(previousIndex);
    }

    const heightChanged = this.measureBlock(index);
    if (heightChanged) {
      this.positionFrom(Math.max(0, previousActiveId ? Math.min(index, this.getBlockIndex(previousActiveId)) : index));
    }
    this.patchPresentation(index);

    if (this.editingBlockId === id && !hasSelectionInside(target)) {
      const block = this.blocks[index];
      if (block) setCaretOffset(target, getEditableText(block.kind, block.source).length);
    }
  }

  private handleFocusOut(event: FocusEvent) {
    const target = getBlockElementFromEventTarget(event.target);
    const id = target?.dataset.blockId ?? null;
    if (!id) return;
    const index = this.getBlockIndex(id);
    if (index === -1) return;
    if (this.activeBlockId === id) this.activeBlockId = null;
    if (this.editingBlockId === id) this.editingBlockId = null;
    const heightChanged = this.measureBlock(index);
    if (heightChanged) this.positionFrom(index);
    this.patchPresentation(index);
  }

  private handlePointerDown(event: PointerEvent) {
    if (event.button !== 0) return;
    const target = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-block-id]');
    const id = target?.dataset.blockId;
    if (!target || !id) return;

    const index = this.getBlockIndex(id);
    if (index === -1) return;

    if (this.activeBlockId !== id) {
      this.activeBlockId = id;
      const heightChanged = this.measureBlock(index);
      if (heightChanged) this.positionFrom(index);
      this.patchPresentation(index);
    }
  }

  private handleDoubleClick(event: MouseEvent) {
    const target = getBlockElementFromEventTarget(event.target);
    const id = target?.dataset.blockId;
    if (!target || !id) return;

    const index = this.getBlockIndex(id);
    if (index === -1) return;

    const selection = getSelectionOffsets(target);
    this.enterEditingMode(index, selection.start, selection.end);
  }

  private handlePaste(event: ClipboardEvent) {
    const target = getBlockElementFromEventTarget(event.target);
    const id = target?.dataset.blockId;
    if (!id) return;

    const pasted = normalizeText(event.clipboardData?.getData('text/plain') ?? '');
    if (!pasted) return;

    event.preventDefault();
    const index = this.getBlockIndex(id);
    if (index === -1) return;
    const offsets = getSelectionOffsets(target);
    const block = this.blocks[index];
    this.insertPastedText(
      index,
      mapDisplayOffsetToSource(block.kind, block.source, offsets.start),
      mapDisplayOffsetToSource(block.kind, block.source, offsets.end),
      pasted,
    );
  }

  private handleInput(event: Event) {
    const target = getBlockElementFromEventTarget(event.target);
    const id = target?.dataset.blockId;
    if (!id || this.editingBlockId !== id) return;

    const index = this.getBlockIndex(id);
    if (index === -1) return;

    const selectionOffsets = getSelectionOffsets(target);
    const displayText = normalizeText(target.innerText ?? '').replace(/\n$/, '');
    const nextSource = rebuildSourceFromDisplay(this.blocks[index].kind, displayText, this.blocks[index].source);
    if (nextSource === this.blocks[index].source) return;

    this.blocks[index].source = nextSource;
    const heightChanged = this.measureBlock(index);
    if (heightChanged) this.positionFrom(index);
    this.patchPresentation(index);

    if (this.activeBlockId === id) {
      setSelectionOffsets(target, selectionOffsets.start, selectionOffsets.end);
    }
  }

  private handleKeyDown(event: KeyboardEvent) {
    const target = getBlockElementFromEventTarget(event.target);
    const id = target?.dataset.blockId;
    if (!id) return;

    const index = this.getBlockIndex(id);
    if (index === -1) return;

    const offsets = getSelectionOffsets(target);
    const block = this.blocks[index];
    const isEditing = this.editingBlockId === id;
    const sourceStart = mapDisplayOffsetToSource(block.kind, block.source, offsets.start);
    const sourceEnd = mapDisplayOffsetToSource(block.kind, block.source, offsets.end);
    const displayText = getDisplayText(block.kind, block.source);

    if (!isEditing && event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault();
      this.enterEditingMode(index, offsets.start, offsets.end, event.key);
      return;
    }

    if (!isEditing && (event.key === 'Backspace' || event.key === 'Delete')) {
      event.preventDefault();
      this.enterEditingMode(index, offsets.start, offsets.end);
      return;
    }

    if (event.key === 'Escape' && isEditing) {
      event.preventDefault();
      this.exitEditingMode(index, offsets.start);
      return;
    }

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (block.kind === 'code') {
        this.insertTextIntoBlock(index, sourceStart, sourceEnd, '\n');
      } else {
        this.splitBlock(index, sourceStart, sourceEnd, offsets.start, offsets.end);
      }
      return;
    }

    if (
      event.key === 'Backspace'
      && offsets.start === offsets.end
      && offsets.start === 0
      && block.kind !== 'paragraph'
      && block.kind !== 'horizontal-rule'
    ) {
      event.preventDefault();
      block.source = getDisplayLines(block.kind, block.source).join('\n');
      const heightChanged = this.measureBlock(index);
      if (heightChanged) this.positionFrom(index);
      this.patchPresentation(index);
      this.focusBlock(index, 0);
      return;
    }

    if (event.key === 'Backspace' && offsets.start === offsets.end && offsets.start === 0 && index > 0) {
      event.preventDefault();
      const previous = this.blocks[index - 1];
      const caret = previous.source.length;
      previous.source += block.source;
      this.removeBlock(index);
      this.measureBlock(index - 1);
      this.positionFrom(index - 1);
      this.focusBlock(index - 1, caret);
      return;
    }

    if (event.key === 'Delete' && offsets.start === offsets.end && offsets.start === displayText.length && index < this.blocks.length - 1) {
      event.preventDefault();
      const next = this.blocks[index + 1];
      block.source += next.source;
      this.removeBlock(index + 1);
      this.measureBlock(index);
      this.positionFrom(index);
      this.focusBlock(index, sourceStart);
    }
  }

  private splitBlock(index: number, start: number, end: number, displayStart: number, displayEnd: number) {
    const block = this.blocks[index];
    let before = block.source.slice(0, start);
    let after = block.source.slice(end);

    if (
      block.kind === 'blockquote'
      || block.kind === 'unordered-list-item'
      || block.kind === 'ordered-list-item'
    ) {
      const displayValue = getDisplayLines(block.kind, block.source).join('\n');
      const beforeDisplay = displayValue.slice(0, displayStart);
      const afterDisplay = displayValue.slice(displayEnd);
      before = rebuildSourceFromDisplay(block.kind, beforeDisplay, block.source);
      after = rebuildSourceFromDisplay(block.kind, afterDisplay, block.source);

      if (!beforeDisplay && !afterDisplay) {
        before = '';
        after = '';
      }
    }

    block.source = before;
    this.patchText(index);
    this.measureBlock(index);

    const nextBlock = createBlock(after);
    this.blocks.splice(index + 1, 0, nextBlock);
    this.root.insertBefore(this.createElement(nextBlock), this.root.children[index + 1] ?? null);
    this.measureBlock(index + 1);
    this.positionFrom(index);
    this.focusBlock(index + 1, 0);
  }

  private insertTextIntoBlock(index: number, start: number, end: number, text: string) {
    const block = this.blocks[index];
    block.source = `${block.source.slice(0, start)}${text}${block.source.slice(end)}`;
    const heightChanged = this.measureBlock(index);
    if (heightChanged) this.positionFrom(index);
    this.patchPresentation(index);
    this.focusBlock(index, start + text.length);
  }

  private insertPastedText(index: number, start: number, end: number, text: string) {
    const block = this.blocks[index];
    const merged = `${block.source.slice(0, start)}${text}${block.source.slice(end)}`;
    const sources = splitMarkdownIntoBlocks(merged);
    const caretBlockIndex = Math.max(0, sources.length - 1);
    const caretOffset = sources[caretBlockIndex]?.length ?? 0;

    this.replaceBlockWithSources(index, sources);
    this.focusBlock(index + caretBlockIndex, caretOffset);
  }

  private replaceBlockWithSources(index: number, sources: string[]) {
    const normalizedSources = sources.length > 0 ? sources : [''];
    const replacement = normalizedSources.map((source) => createBlock(source));
    const removed = this.blocks.splice(index, 1, ...replacement);

    const removedElement = removed[0] ? this.elements.get(removed[0].id) : null;
    const anchor = removedElement?.nextSibling ?? this.root.children[index + 1] ?? null;
    removedElement?.remove();
    if (removed[0]) this.elements.delete(removed[0].id);

    replacement.forEach((block) => {
      this.root.insertBefore(this.createElement(block), anchor);
    });

    for (let blockIndex = index; blockIndex < index + replacement.length; blockIndex += 1) {
      this.measureBlock(blockIndex);
    }
    this.positionFrom(index);
  }

  private removeBlock(index: number) {
    const [removed] = this.blocks.splice(index, 1);
    if (!removed) return;
    const element = this.elements.get(removed.id);
    element?.remove();
    this.elements.delete(removed.id);
    if (this.blocks.length === 0) {
      const fallback = createBlock('');
      this.blocks.push(fallback);
      this.root.appendChild(this.createElement(fallback));
      this.measureBlock(0);
      this.positionFrom(0);
    }
  }

  private relayoutAll() {
    for (let index = 0; index < this.blocks.length; index += 1) {
      this.measureBlock(index);
    }
    this.positionFrom(0);
  }

  private measureBlock(index: number) {
    const block = this.blocks[index];
    if (!block) return false;

    const previousHeight = block.height;
    const nextKind = classifyKind(block.source);
    const style = getBlockStyle(nextKind);
    const availableWidth = Math.max(1, this.root.clientWidth - style.insetLeft - style.insetRight);
    const measuredText = this.editingBlockId === block.id
      ? getEditableText(nextKind, block.source)
      : getDisplayText(nextKind, block.source);
    const probeText = measuredText.length > 0 ? measuredText : ' ';
    const measureKey = `${nextKind}::${availableWidth}::${style.font}::${style.lineHeight}::${style.paddingY}::${probeText}`;

    block.kind = nextKind;
    block.className = style.className;
    block.font = style.font;
    block.lineHeight = style.lineHeight;
    block.insetLeft = style.insetLeft;
    block.insetRight = style.insetRight;
    block.paddingY = style.paddingY;
    block.gapAfter = style.gapAfter;

    if (block.measureKey !== measureKey) {
      const prepared = nextKind === 'horizontal-rule'
        ? null
        : prepareWithSegments(probeText, style.font, { whiteSpace: 'pre-wrap' });
      const layout = prepared
        ? layoutWithLines(prepared, availableWidth, style.lineHeight)
        : { height: style.lineHeight };

      block.prepared = prepared;
      block.measuredWidth = availableWidth;
      block.height = Math.max(style.lineHeight, layout.height) + style.paddingY * 2;
      block.measureKey = measureKey;
    }

    this.patchPresentation(index);
    return previousHeight !== block.height;
  }

  private positionFrom(startIndex: number) {
    if (this.blocks.length === 0) return;

    let top = 0;
    if (startIndex > 0) {
      const previous = this.blocks[startIndex - 1];
      top = previous.top + previous.height + previous.gapAfter;
    }

    for (let index = startIndex; index < this.blocks.length; index += 1) {
      const block = this.blocks[index];
      block.top = top;
      const element = this.elements.get(block.id);
      if (element) {
        element.style.top = `${block.top}px`;
        element.style.height = `${block.height}px`;
      }
      top += block.height + block.gapAfter;
    }

    this.root.style.height = `${Math.max(1, top)}px`;
  }

  private createElement(block: EditorBlock) {
    const element = document.createElement('div');
    element.dataset.blockId = block.id;
    element.setAttribute('contenteditable', 'false');
    element.setAttribute('spellcheck', 'false');
    element.tabIndex = 0;
    element.textContent = block.source;
    this.elements.set(block.id, element);
    this.patchPresentation(this.getBlockIndex(block.id));
    return element;
  }

  private patchText(index: number) {
    const block = this.blocks[index];
    const element = this.elements.get(block.id);
    if (!block || !element) return;
    if (document.activeElement !== element && element.textContent !== block.source) {
      element.textContent = block.source;
    }
  }

  private patchPresentation(index: number) {
    const block = this.blocks[index];
    const element = block ? this.elements.get(block.id) : null;
    if (!block || !element) return;

    const isActive = block.id === this.activeBlockId;

    element.className = block.className;
    element.classList.toggle('is-active', isActive);
    element.style.left = `${block.insetLeft}px`;
    element.style.width = `calc(100% - ${block.insetLeft + block.insetRight}px)`;
    element.style.paddingTop = `${block.paddingY}px`;
    element.style.paddingBottom = `${block.paddingY}px`;

    const showPlaceholder = this.blocks.length === 1 && this.blocks[0]?.source === '';
    if (showPlaceholder) {
      element.dataset.placeholder = this.placeholder;
    } else {
      delete element.dataset.placeholder;
    }

    if (block.kind === 'horizontal-rule') {
      element.setAttribute('contenteditable', 'false');
      if (element.innerHTML !== '<hr>') {
        element.innerHTML = '<hr>';
      }
      return;
    }

    const isEditing = this.editingBlockId === block.id;
    element.setAttribute('contenteditable', isEditing || isActive ? 'true' : 'false');

    if (isEditing) {
      const editableText = getEditableText(block.kind, block.source);
      if (element.textContent !== editableText) {
        element.textContent = editableText;
      }
      return;
    }

    if (block.kind === 'unordered-list-item' || block.kind === 'ordered-list-item') {
      const tag = block.kind === 'unordered-list-item' ? 'ul' : 'ol';
      const items = getDisplayLines(block.kind, block.source)
        .map((line) => `<li>${line ? renderInlineHtml(line) : '<br>'}</li>`)
        .join('');
      const nextHtml = `<${tag}>${items}</${tag}>`;
      if (element.innerHTML !== nextHtml) {
        element.innerHTML = nextHtml;
      }
      return;
    }

    const nextHtml = renderInlineHtml(getDisplayLines(block.kind, block.source).join('\n'));
    if (element.innerHTML !== nextHtml) {
      element.innerHTML = nextHtml;
    }
  }

  private enterEditingMode(index: number, selectionStart: number, selectionEnd: number, insertedText?: string) {
    const block = this.blocks[index];
    if (!block) return;

    this.editingBlockId = block.id;

    let nextCaretStart = selectionStart;
    let nextCaretEnd = selectionEnd;

    if (insertedText) {
      const sourceStart = mapDisplayOffsetToSource(block.kind, block.source, selectionStart);
      const sourceEnd = mapDisplayOffsetToSource(block.kind, block.source, selectionEnd);
      block.source = `${block.source.slice(0, sourceStart)}${insertedText}${block.source.slice(sourceEnd)}`;
      nextCaretStart = selectionStart + insertedText.length;
      nextCaretEnd = nextCaretStart;
    }

    const heightChanged = this.measureBlock(index);
    if (heightChanged) this.positionFrom(index);
    this.patchPresentation(index);

    requestAnimationFrame(() => {
      const currentBlock = this.blocks[index];
      const element = currentBlock ? this.elements.get(currentBlock.id) : null;
      if (!currentBlock || !element || this.editingBlockId !== currentBlock.id) return;
      element.focus();
      setSelectionOffsets(element, nextCaretStart, nextCaretEnd);
    });
  }

  private exitEditingMode(index: number, caretOffset: number) {
    const block = this.blocks[index];
    if (!block) return;

    this.editingBlockId = null;
    this.activeBlockId = block.id;
    const heightChanged = this.measureBlock(index);
    if (heightChanged) this.positionFrom(index);
    this.patchPresentation(index);

    requestAnimationFrame(() => {
      const currentBlock = this.blocks[index];
      const element = currentBlock ? this.elements.get(currentBlock.id) : null;
      if (!currentBlock || !element) return;
      element.focus();
      setCaretOffset(element, Math.min(caretOffset, getDisplayText(currentBlock.kind, currentBlock.source).length));
    });
  }

  private focusBlock(index: number, offset: number) {
    requestAnimationFrame(() => {
      const block = this.blocks[index];
      const element = block ? this.elements.get(block.id) : null;
      if (!block || !element) return;
      element.focus();
      if (this.editingBlockId === block.id) {
        setCaretOffset(element, mapSourceOffsetToDisplay(block.kind, block.source, offset));
      } else {
        setCaretOffset(element, Math.min(offset, getDisplayText(block.kind, block.source).length));
      }
    });
  }

  private getBlockIndex(id: string) {
    return this.blocks.findIndex((block) => block.id === id);
  }
}
