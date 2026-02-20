import { Mark, markInputRule, markPasteRule } from '@tiptap/core';

export interface ColoredTextOptions {
    HTMLAttributes: Record<string, unknown>;
}

declare module '@tiptap/core' {
    interface Commands<ReturnType> {
        coloredText: {
            /**
             * Set colored text
             */
            setColoredText: (color: string) => ReturnType;
            /**
             * Toggle colored text
             */
            toggleColoredText: (color: string) => ReturnType;
            /**
             * Unset colored text
             */
            unsetColoredText: () => ReturnType;
        };
    }
}

const colors: Record<string, string> = {
    orange: '#F38020',
    // Can add more color names here
};

/**
 * ColoredText extension that supports markdown-style colored text
 * Syntax: <orange>text</orange> or <color=#hex>text</color>
 */
export const ColoredText = Mark.create<ColoredTextOptions>({
    name: 'coloredText',

    addOptions() {
        return {
            HTMLAttributes: {},
        };
    },

    addAttributes() {
        return {
            color: {
                default: null,
                parseHTML: (element) => element.style.color || element.getAttribute('data-color'),
                renderHTML: (attributes) => {
                    if (!attributes.color) {
                        return {};
                    }
                    return {
                        style: `color: ${attributes.color}`,
                        'data-color': attributes.color,
                    };
                },
            },
        };
    },

    parseHTML() {
        return [
            {
                tag: 'span[data-color]',
            },
            {
                tag: 'span[style*="color"]',
                getAttrs: (element) => {
                    const color = (element as HTMLElement).style.color;
                    return color ? { color } : false;
                },
            },
        ];
    },

    renderHTML({ HTMLAttributes }) {
        return ['span', { ...this.options.HTMLAttributes, ...HTMLAttributes }, 0];
    },

    addCommands() {
        return {
            setColoredText:
                (color: string) =>
                    ({ commands }) => {
                        return commands.setMark(this.name, { color });
                    },
            toggleColoredText:
                (color: string) =>
                    ({ commands }) => {
                        return commands.toggleMark(this.name, { color });
                    },
            unsetColoredText:
                () =>
                    ({ commands }) => {
                        return commands.unsetMark(this.name);
                    },
        };
    },

    addInputRules() {
        return [
            // Match <orange>text</orange> - needs trailing space
            markInputRule({
                find: /<(orange)>([^<]+)<\/\1>\s$/,
                type: this.type,
                getAttributes: (match) => {
                    const colorName = match[1];
                    return { color: colors[colorName] || colorName };
                },
            }),
            // Match <color=#hex>text</color> - needs trailing space
            markInputRule({
                find: /<color=(#[0-9a-fA-F]{3,6})>([^<]+)<\/color>\s$/,
                type: this.type,
                getAttributes: (match) => {
                    return { color: match[1] };
                },
            }),
        ];
    },

    addPasteRules() {
        return [
            // Match <orange>text</orange> - for pasting
            markPasteRule({
                find: /<(orange)>([^<]+)<\/\1>/g,
                type: this.type,
                getAttributes: (match) => {
                    const colorName = match[1];
                    return { color: colors[colorName] || colorName };
                },
            }),
            // Match <color=#hex>text</color> - for pasting
            markPasteRule({
                find: /<color=(#[0-9a-fA-F]{3,6})>([^<]+)<\/color>/g,
                type: this.type,
                getAttributes: (match) => {
                    return { color: match[1] };
                },
            }),
        ];
    },
});
