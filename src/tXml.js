/**
 * @author: Tobias Nickel
 * @created: 06.04.2015
 * I needed a small xmlparser that can be used in a worker.
 */

// Character codes for faster parsing
const OPEN_BRACKET = 60;    // <
const CLOSE_BRACKET = 62;   // >
const SLASH = 47;           // /
const EXCLAMATION = 33;     // !
const MINUS = 45;           // -
const SINGLE_QUOTE = 39;    // '
const DOUBLE_QUOTE = 34;    // "
const OPEN_SQUARE = 91;     // [
const CLOSE_SQUARE = 93;    // ]
const NAME_END_CHARS = '\r\n\t>/= ';

const DEFAULT_SELF_CLOSING = ['img', 'br', 'input', 'meta', 'link', 'hr'];

/**
 * parseXML / html into a DOM Object. with no validation and some failure tolerance
 * @param {string} S your XML to parse
 * @param {import('./tXml.d.ts').ParseOptions} [options] all other options:
 * @return {(import('./tXml.d.ts').TNode | string)[] | any}
 */
export function parse(S, options = {}) {
    "txml";
    
    let pos = options.pos || 0;
    const keepComments = !!options.keepComments;
    const keepWhitespace = !!options.keepWhitespace;
    const selfClosingTags = options.selfClosingTags || options.noChildNodes || DEFAULT_SELF_CLOSING;

    /**
     * parsing a list of entries
     * @param {string} tagName
     * @returns {(import('./tXml.d.ts').TNode | string)[]}
     */
    function parseChildren(tagName) {
        /** @type {(import('./tXml.d.ts').TNode | string)[]} */
        const children = [];
        
        while (S[pos]) {
            if (S.charCodeAt(pos) === OPEN_BRACKET) {
                if (S.charCodeAt(pos + 1) === SLASH) {
                    // Close tag
                    const closeStart = pos + 2;
                    pos = S.indexOf('>', pos);
                    const closeTag = S.substring(closeStart, pos);
                    
                    if (!closeTag.includes(tagName)) {
                        const lines = S.substring(0, pos).split('\n');
                        throw new Error(
                            `Unexpected close tag\nLine: ${lines.length - 1}\nColumn: ${lines[lines.length - 1].length + 1}\nChar: ${S[pos]}`
                        );
                    }
                    if (pos + 1) pos++;
                    return children;
                }
                
                if (S.charCodeAt(pos + 1) === EXCLAMATION) {
                    if (S.charCodeAt(pos + 2) === MINUS) {
                        // Comment
                        const startCommentPos = pos;
                        while (pos !== -1 && !(S.charCodeAt(pos) === CLOSE_BRACKET && S.charCodeAt(pos - 1) === MINUS && S.charCodeAt(pos - 2) === MINUS)) {
                            pos = S.indexOf('>', pos + 1);
                        }
                        if (pos === -1) pos = S.length;
                        if (keepComments) {
                            children.push(S.substring(startCommentPos, pos + 1));
                        }
                    } else if (
                        S.charCodeAt(pos + 2) === OPEN_SQUARE &&
                        S.charCodeAt(pos + 8) === OPEN_SQUARE &&
                        S.substring(pos + 3, pos + 8).toLowerCase() === 'cdata'
                    ) {
                        // CDATA
                        const cdataEndIndex = S.indexOf(']]>', pos);
                        if (cdataEndIndex === -1) {
                            children.push(S.substring(pos + 9));
                            pos = S.length;
                        } else {
                            children.push(S.substring(pos + 9, cdataEndIndex));
                            pos = cdataEndIndex + 3;
                        }
                        continue;
                    } else {
                        // DOCTYPE
                        const startDoctype = pos + 1;
                        pos += 2;
                        let encapsulated = false;
                        while ((S.charCodeAt(pos) !== CLOSE_BRACKET || encapsulated) && S[pos]) {
                            if (S.charCodeAt(pos) === OPEN_SQUARE) {
                                encapsulated = true;
                            } else if (encapsulated && S.charCodeAt(pos) === CLOSE_SQUARE) {
                                encapsulated = false;
                            }
                            pos++;
                        }
                        children.push(S.substring(startDoctype, pos));
                    }
                    pos++;
                    continue;
                }
                
                const node = parseNode();
                children.push(node);
                if (node.tagName[0] === '?') {
                    children.push(...node.children);
                    node.children = [];
                }
            } else {
                const text = parseText();
                if (keepWhitespace) {
                    if (text.length > 0) children.push(text);
                } else {
                    const trimmed = text.trim();
                    if (trimmed.length > 0) children.push(trimmed);
                }
                pos++;
            }
        }
        return children;
    }

    /** Returns text until the first '<' */
    function parseText() {
        const start = pos;
        pos = S.indexOf('<', pos) - 1;
        if (pos === -2) pos = S.length;
        return S.slice(start, pos + 1);
    }

    /** Returns tag/attribute name */
    function parseName() {
        const start = pos;
        while (!NAME_END_CHARS.includes(S[pos]) && S[pos]) {
            pos++;
        }
        return S.slice(start, pos);
    }

    /** Parses attribute value string */
    function parseString() {
        const quote = S[pos];
        const start = pos + 1;
        pos = S.indexOf(quote, start);
        return S.slice(start, pos);
    }

    /**
     * Parses a node including tagName, attributes and children
     * @returns {import('./tXml.d.ts').TNode}
     */
    function parseNode() {
        pos++;
        const tagName = parseName();
        /** @type {Record<string, string | null>} */
        const attributes = {};
        /** @type {(import('./tXml.d.ts').TNode | string)[]} */
        let children = [];

        // Parse attributes
        while (S.charCodeAt(pos) !== CLOSE_BRACKET && S[pos]) {
            const c = S.charCodeAt(pos);
            // Check if letter (A-Z: 65-90, a-z: 97-122)
            if ((c > 64 && c < 91) || (c > 96 && c < 123)) {
                const name = parseName();
                let code = S.charCodeAt(pos);
                
                // Skip to quote or end
                while (code && code !== SINGLE_QUOTE && code !== DOUBLE_QUOTE && 
                       !((code > 64 && code < 91) || (code > 96 && code < 123)) && 
                       code !== CLOSE_BRACKET) {
                    pos++;
                    code = S.charCodeAt(pos);
                }
                
                /** @type {string | null} */
                let value;
                if (code === SINGLE_QUOTE || code === DOUBLE_QUOTE) {
                    value = parseString();
                    if (pos === -1) {
                        return { tagName, attributes, children };
                    }
                } else {
                    value = null;
                    pos--;
                }
                attributes[name] = value;
            }
            pos++;
        }

        // Parse children
        if (S.charCodeAt(pos - 1) !== SLASH) {
            if (tagName === 'script') {
                const start = pos + 1;
                pos = S.indexOf('</script>', pos);
                children = [S.slice(start, pos)];
                pos += 9;
            } else if (tagName === 'style') {
                const start = pos + 1;
                pos = S.indexOf('</style>', pos);
                children = [S.slice(start, pos)];
                pos += 8;
            } else if (!selfClosingTags.includes(tagName)) {
                pos++;
                children = parseChildren(tagName);
            } else {
                pos++;
            }
        } else {
            pos++;
        }

        return { tagName, attributes, children };
    }

    /** Find elements by attribute using regex */
    function findElements() {
        if (!options.attrName || !options.attrValue) return -1;
        const r = new RegExp(`\\s${options.attrName}\\s*=['"]${options.attrValue}['"]`).exec(S);
        return r ? r.index : -1;
    }

    // Main parsing logic
    /** @type {(import('./tXml.d.ts').TNode | string)[] | import('./tXml.d.ts').TNode} */
    let out;
    
    if (options.attrValue !== undefined) {
        options.attrName = options.attrName || 'id';
        out = [];
        while ((pos = findElements()) !== -1) {
            pos = S.lastIndexOf('<', pos);
            if (pos !== -1) {
                out.push(parseNode());
            }
            S = S.substring(pos);
            pos = 0;
        }
    } else if (options.parseNode) {
        out = parseNode();
    } else {
        out = parseChildren('');
    }

    if (options.filter && Array.isArray(out)) {
        out = filter(out, options.filter);
    }

    if (options.simplify) {
        // @ts-ignore - simplify returns different type structure
        return simplify(Array.isArray(out) ? out : [out]);
    }

    if (options.setPos && typeof out === 'object' && !Array.isArray(out)) {
        // @ts-ignore - adding pos property dynamically
        out.pos = pos;
    }

    // @ts-ignore - return type varies based on options
    return out;
}

/**
 * Transform DOM to simplified object (like PHP's SimpleXML)
 * Note: Original XML cannot be reproduced, element order is not preserved
 * @param {(import('./tXml.d.ts').TNode | string)[]} children
 * @returns {Record<string, any> | string}
 */
export function simplify(children) {
    if (!children.length) return '';
    if (children.length === 1 && typeof children[0] === 'string') {
        return children[0];
    }
    
    /** @type {Record<string, any>} */
    const out = {};
    
    for (const child of children) {
        if (typeof child !== 'object') continue;
        
        if (!out[child.tagName]) out[child.tagName] = [];
        const kids = simplify(child.children);
        out[child.tagName].push(kids);
        
        if (Object.keys(child.attributes).length && typeof kids === 'object' && !Array.isArray(kids)) {
            kids._attributes = child.attributes;
        }
    }

    for (const key in out) {
        if (out[key].length === 1) out[key] = out[key][0];
    }

    return out;
}

/**
 * Similar to simplify, but preserves more information
 * @param {(import('./tXml.d.ts').TNode | string)[]} children
 * @param {Record<string, string | null>} [parentAttributes]
 * @returns {Record<string, any> | string | {_attributes: Record<string, string | null>, value: string}}
 */
export function simplifyLostLess(children, parentAttributes = {}) {
    if (!children.length) return {};
    
    if (children.length === 1 && typeof children[0] === 'string') {
        return Object.keys(parentAttributes).length 
            ? { _attributes: parentAttributes, value: children[0] }
            : children[0];
    }
    
    /** @type {Record<string, any>} */
    const out = {};
    
    for (const child of children) {
        if (typeof child !== 'object') continue;
        
        if (!out[child.tagName]) out[child.tagName] = [];
        const kids = simplifyLostLess(child.children || [], child.attributes);
        out[child.tagName].push(kids);
        
        if (Object.keys(child.attributes).length && typeof kids === 'object' && !Array.isArray(kids)) {
            kids._attributes = child.attributes;
        }
    }

    return out;
}

/**
 * Filter nodes recursively
 * @param {(import('./tXml.d.ts').TNode | string)[]} children
 * @param {(node: import('./tXml.d.ts').TNode, index: number, depth: number, path: string) => boolean} f
 * @param {number} [depth]
 * @param {string} [path]
 * @returns {import('./tXml.d.ts').TNode[]}
 */
export function filter(children, f, depth = 0, path = '') {
    /** @type {import('./tXml.d.ts').TNode[]} */
    let out = [];
    
    children.forEach((child, i) => {
        if (typeof child === 'object' && f(child, i, depth, path)) {
            out.push(child);
        }
        if (typeof child === 'object' && child.children) {
            const newPath = `${path ? path + '.' : ''}${i}.${child.tagName}`;
            out = out.concat(filter(child.children, f, depth + 1, newPath));
        }
    });
    
    return out;
}

/**
 * Stringify parsed nodes back to XML
 * @param {import('./tXml.d.ts').TNode | (import('./tXml.d.ts').TNode | string)[] | undefined} O
 * @param {import('./tXml.d.ts').StringifyOptions} [options] - Stringify options
 * @returns {string}
 */
export function stringify(O, options) {
    if (!O) return '';
    
    const nodes = Array.isArray(O) ? O : [O];
    const { skipTags, stripParams, compactTags, indentSpaces } = options || {};
    const indent = indentSpaces > 0 ? ' '.repeat(indentSpaces) : '';
    let out = '';

    const write = (nodes, depth, compact) => {
        for (const node of nodes) {
            if (typeof node === 'string') {
                const t = node.trim();
                if (t) out += (!compact && indent) ? '\n' + indent.repeat(depth) + t : t;
            } else if (node) {
                if (skipTags?.test(node.tagName)) continue;
                const isCompact = compact || compactTags?.test(node.tagName);
                if (!compact && indent) out += '\n' + indent.repeat(depth);
                out += '<' + node.tagName;
                for (const k in node.attributes) {
                    if (stripParams?.test(k)) continue;
                    const v = node.attributes[k];
                    out += v === null ? ' ' + k : v.includes('"') ? ` ${k}='${v.trim()}'` : ` ${k}="${v.trim()}"`;
                }
                if (node.tagName[0] === '?') { out += '?>'; continue; }
                out += '>';
                const hasEl = node.children.some(c => typeof c === 'object');
                write(node.children, depth + 1, isCompact);
                if (!isCompact && indent && hasEl) out += '\n' + indent.repeat(depth);
                out += '</' + node.tagName + '>';
            }
        }
    };
    
    write(nodes, 0, false);
    return out[0] === '\n' ? out.slice(1) : out;
}

/**
 * Extract text content from nodes (for mixed content)
 * @param {import('./tXml.d.ts').TNode | (import('./tXml.d.ts').TNode | string)[] | string} tDom
 * @return {string}
 */
export function toContentString(tDom) {
    if (Array.isArray(tDom)) {
        return tDom.map(e => toContentString(e)).join(' ').trim();
    }
    if (typeof tDom === 'object' && tDom !== null) {
        return toContentString(tDom.children);
    }
    return ` ${tDom}`;
}

/**
 * Find element by ID
 * @param {string} S
 * @param {string} id
 * @param {boolean} [simplified]
 * @returns {import('./tXml.d.ts').TNode | Record<string, any> | string | undefined}
 */
export function getElementById(S, id, simplified) {
    const out = parse(S, { attrValue: id });
    return simplified ? simplify(out) : out[0];
}

/**
 * Find elements by class name
 * @param {string} S
 * @param {string} classname
 * @param {boolean} [simplified]
 * @returns {(import('./tXml.d.ts').TNode | string)[] | Record<string, any> | string}
 */
export function getElementsByClassName(S, classname, simplified) {
    const out = parse(S, {
        attrName: 'class',
        attrValue: `[a-zA-Z0-9- ]*${classname}[a-zA-Z0-9- ]*`
    });
    return simplified ? simplify(out) : out;
}

/**
 * Type guard: check if node is text (string)
 * @param {import('./tXml.d.ts').TNode | string} node
 * @returns {node is string}
 */
export function isTextNode(node) {
    return typeof node === 'string';
}

/**
 * Type guard: check if node is element (TNode)
 * @param {import('./tXml.d.ts').TNode | string} node
 * @returns {node is import('./tXml.d.ts').TNode}
 */
export function isElementNode(node) {
    return typeof node === 'object' && node !== null && 'tagName' in node;
}
