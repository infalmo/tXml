/**
 * @author: Tobias Nickel
 * @created: 06.04.2015
 * I needed a small xmlparser that can be used in a worker.
 */

// Character codes for faster parsing
const OPEN_BRACKET = 60; // <
const CLOSE_BRACKET = 62; // >
const SLASH = 47; // /
const EXCLAMATION = 33; // !
const MINUS = 45; // -
const SINGLE_QUOTE = 39; // '
const DOUBLE_QUOTE = 34; // "
const OPEN_SQUARE = 91; // [
const CLOSE_SQUARE = 93; // ]
const NAME_END_CHARS = "\r\n\t>/= ";

const DEFAULT_SELF_CLOSING = ["img", "br", "input", "meta", "link", "hr"];

/**
 * A parsed XML node
 */
export interface TNode {
  tagName: string;
  /**
   * Element attributes. Values can be:
   * - string: attribute with a value (e.g., `<div id="test">` → `{id: "test"}`)
   * - null: attribute without a value (e.g., `<input disabled>` → `{disabled: null}`)
   * - empty string: attribute with empty value (e.g., `<input value="">` → `{value: ""}`)
   */
  attributes: Record<string, string | null>;
  children: (TNode | string)[];
}

/**
 * Options for stringifying XML
 */
export interface StringifyOptions {
  /**
   * Regular expression to match tag names that should be skipped entirely.
   * Matching tags and their children will not appear in the output.
   * @example /^(script|style)$/ - Skip script and style tags
   */
  skipTags?: RegExp;

  /**
   * Regular expression to match attribute names that should be stripped.
   * Matching attributes will not appear in the output.
   * @example /^(data-|on)/ - Strip data-* and event handler attributes
   */
  stripParams?: RegExp;

  /**
   * Regular expression to match tag names that should be rendered compactly.
   * Compact tags have no indentation for children - entire content on a single line.
   * @example /^(span|b|i|a)$/ - Render inline elements compactly
   */
  compactTags?: RegExp;

  /**
   * Number of spaces for each indentation level.
   * Set to 0 (default) for no indentation/formatting.
   * @default 0
   * @example 2 - Use 2 spaces per indent level
   */
  indentSpaces?: number;
}

/**
 * Options for parsing XML
 */
export interface ParseOptions {
  /** Starting position in the string */
  pos?: number;
  /**
   * Array of tag names that are self-closing (void elements) and don't need closing tags.
   * Default: ['img', 'br', 'input', 'meta', 'link', 'hr']
   * @deprecated Use selfClosingTags instead
   */
  noChildNodes?: string[];
  /**
   * Array of tag names that are self-closing (void elements) and don't need closing tags.
   * Default: ['img', 'br', 'input', 'meta', 'link', 'hr']
   */
  selfClosingTags?: string[];
  /** If true, the returned object will have a pos property indicating where parsing stopped */
  setPos?: boolean;
  /** Keep XML comments in the output */
  keepComments?: boolean;
  /** Keep whitespace text nodes */
  keepWhitespace?: boolean;
  /** Automatically simplify the output */
  simplify?: boolean;
  /** Parse a single node instead of a list of nodes */
  parseNode?: boolean;
  /** Attribute name to search for (used with attrValue) */
  attrName?: string;
  /** Attribute value to search for (regex pattern) */
  attrValue?: string;
  /** Filter function to apply to nodes */
  filter?: (node: TNode, index: number, depth: number, path: string) => boolean;
}

/**
 * Parse XML/HTML into a DOM Object with minimal validation and fault tolerance
 * @param S - The XML string to parse
 * @param options - Parsing options
 * @returns Array of parsed nodes and text content
 */
export function parse(S: string, options: ParseOptions = {}): (TNode | string)[] {
  "txml";

  let pos = options.pos || 0;
  const keepComments = !!options.keepComments;
  const keepWhitespace = !!options.keepWhitespace;
  const selfClosingTags = options.selfClosingTags || options.noChildNodes || DEFAULT_SELF_CLOSING;

  /**
   * parsing a list of entries
   */
  function parseChildren(tagName: string): (TNode | string)[] {
    const children: (TNode | string)[] = [];

    while (S[pos]) {
      if (S.charCodeAt(pos) === OPEN_BRACKET) {
        if (S.charCodeAt(pos + 1) === SLASH) {
          // Close tag
          const closeStart = pos + 2;
          pos = S.indexOf(">", pos);
          const closeTag = S.substring(closeStart, pos);

          if (!closeTag.includes(tagName)) {
            const lines = S.substring(0, pos).split("\n");
            throw new Error(
              `Unexpected close tag\nLine: ${lines.length - 1}\nColumn: ${lines[lines.length - 1].length + 1}\nChar: ${S[pos]}`,
            );
          }
          if (pos + 1) pos++;
          return children;
        }

        if (S.charCodeAt(pos + 1) === EXCLAMATION) {
          if (S.charCodeAt(pos + 2) === MINUS) {
            // Comment
            const startCommentPos = pos;
            while (
              pos !== -1 &&
              !(
                S.charCodeAt(pos) === CLOSE_BRACKET &&
                S.charCodeAt(pos - 1) === MINUS &&
                S.charCodeAt(pos - 2) === MINUS
              )
            ) {
              pos = S.indexOf(">", pos + 1);
            }
            if (pos === -1) pos = S.length;
            if (keepComments) {
              children.push(S.substring(startCommentPos, pos + 1));
            }
          } else if (
            S.charCodeAt(pos + 2) === OPEN_SQUARE &&
            S.charCodeAt(pos + 8) === OPEN_SQUARE &&
            S.substring(pos + 3, pos + 8).toLowerCase() === "cdata"
          ) {
            // CDATA
            const cdataEndIndex = S.indexOf("]]>", pos);
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
        if (node.tagName[0] === "?") {
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
  function parseText(): string {
    const start = pos;
    pos = S.indexOf("<", pos) - 1;
    if (pos === -2) pos = S.length;
    return S.slice(start, pos + 1);
  }

  /** Returns tag/attribute name */
  function parseName(): string {
    const start = pos;
    while (!NAME_END_CHARS.includes(S[pos]) && S[pos]) {
      pos++;
    }
    return S.slice(start, pos);
  }

  /** Parses attribute value string */
  function parseString(): string {
    const quote = S[pos];
    const start = pos + 1;
    pos = S.indexOf(quote, start);
    return S.slice(start, pos);
  }

  /**
   * Parses a node including tagName, attributes and children
   */
  function parseNode(): TNode {
    pos++;
    const tagName = parseName();
    const attributes: Record<string, string | null> = {};
    let children: (TNode | string)[] = [];

    // Parse attributes
    while (S.charCodeAt(pos) !== CLOSE_BRACKET && S[pos]) {
      const c = S.charCodeAt(pos);
      // Check if letter (A-Z: 65-90, a-z: 97-122)
      if ((c > 64 && c < 91) || (c > 96 && c < 123)) {
        const name = parseName();
        let code = S.charCodeAt(pos);

        // Skip to quote or end
        while (
          code &&
          code !== SINGLE_QUOTE &&
          code !== DOUBLE_QUOTE &&
          !((code > 64 && code < 91) || (code > 96 && code < 123)) &&
          code !== CLOSE_BRACKET
        ) {
          pos++;
          code = S.charCodeAt(pos);
        }

        let value: string | null;
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
      if (tagName === "script") {
        const start = pos + 1;
        pos = S.indexOf("</script>", pos);
        children = [S.slice(start, pos)];
        pos += 9;
      } else if (tagName === "style") {
        const start = pos + 1;
        pos = S.indexOf("</style>", pos);
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
  function findElements(): number {
    if (!options.attrName || !options.attrValue) return -1;
    const r = new RegExp(`\\s${options.attrName}\\s*=['"]${options.attrValue}['"]`).exec(S);
    return r ? r.index : -1;
  }

  // Main parsing logic
  let out: (TNode | string)[] | TNode;

  if (options.attrValue !== undefined) {
    options.attrName = options.attrName || "id";
    out = [];
    while ((pos = findElements()) !== -1) {
      pos = S.lastIndexOf("<", pos);
      if (pos !== -1) {
        out.push(parseNode());
      }
      S = S.substring(pos);
      pos = 0;
    }
  } else if (options.parseNode) {
    out = parseNode();
  } else {
    out = parseChildren("");
  }

  if (options.filter && Array.isArray(out)) {
    out = filter(out, options.filter);
  }

  if (options.simplify) {
    return simplify(Array.isArray(out) ? out : [out]) as any;
  }

  if (options.setPos && typeof out === "object" && !Array.isArray(out)) {
    (out as any).pos = pos;
  }

  return out as any;
}

/**
 * Transform DOM to simplified object (like PHP's SimpleXML)
 * Note: Original XML cannot be reproduced, element order is not preserved
 */
export function simplify(children: (TNode | string)[]): Record<string, any> | string {
  if (!children.length) return "";
  if (children.length === 1 && typeof children[0] === "string") {
    return children[0];
  }

  const out: Record<string, any> = {};

  for (const child of children) {
    if (typeof child !== "object") continue;

    if (!out[child.tagName]) out[child.tagName] = [];
    const kids = simplify(child.children);
    out[child.tagName].push(kids);

    if (Object.keys(child.attributes).length && typeof kids === "object" && !Array.isArray(kids)) {
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
 */
export function simplifyLostLess(
  children: (TNode | string)[],
  parentAttributes: Record<string, string | null> = {},
): Record<string, any> | string | { _attributes: Record<string, string | null>; value: string } {
  if (!children.length) return {};

  if (children.length === 1 && typeof children[0] === "string") {
    return Object.keys(parentAttributes).length
      ? { _attributes: parentAttributes, value: children[0] }
      : children[0];
  }

  const out: Record<string, any> = {};

  for (const child of children) {
    if (typeof child !== "object") continue;

    if (!out[child.tagName]) out[child.tagName] = [];
    const kids = simplifyLostLess(child.children || [], child.attributes);
    out[child.tagName].push(kids);

    if (Object.keys(child.attributes).length && typeof kids === "object" && !Array.isArray(kids)) {
      kids._attributes = child.attributes;
    }
  }

  return out;
}

/**
 * Filter nodes recursively
 */
export function filter(
  children: (TNode | string)[],
  f: (node: TNode, index: number, depth: number, path: string) => boolean,
  depth: number = 0,
  path: string = "",
): TNode[] {
  let out: TNode[] = [];

  children.forEach((child, i) => {
    if (typeof child === "object" && f(child, i, depth, path)) {
      out.push(child);
    }
    if (typeof child === "object" && child.children) {
      const newPath = `${path ? path + "." : ""}${i}.${child.tagName}`;
      out = out.concat(filter(child.children, f, depth + 1, newPath));
    }
  });

  return out;
}

/**
 * Stringify parsed nodes back to XML
 */
export function stringify(
  O: TNode | (TNode | string)[] | undefined,
  options?: StringifyOptions,
): string {
  if (!O) return "";

  const nodes = Array.isArray(O) ? O : [O];
  const { skipTags, stripParams, compactTags, indentSpaces } = options || {};
  const indent = indentSpaces && indentSpaces > 0 ? " ".repeat(indentSpaces) : "";
  let out = "";

  const write = (nodes: (TNode | string)[], depth: number, compact: boolean): void => {
    for (const node of nodes) {
      if (typeof node === "string") {
        const t = node.trim();
        if (t) out += !compact && indent ? "\n" + indent.repeat(depth) + t : t;
      } else if (node) {
        if (skipTags?.test(node.tagName)) continue;
        const isCompact = compact || compactTags?.test(node.tagName);
        if (!compact && indent) out += "\n" + indent.repeat(depth);
        out += "<" + node.tagName;
        for (const k in node.attributes) {
          if (stripParams?.test(k)) continue;
          const v = node.attributes[k];
          out +=
            v === null ? " " + k : v.includes('"') ? ` ${k}='${v.trim()}'` : ` ${k}="${v.trim()}"`;
        }
        if (node.tagName[0] === "?") {
          out += "?>";
          continue;
        }
        out += ">";
        const hasEl = node.children.some((c) => typeof c === "object");
        write(node.children, depth + 1, isCompact || false);
        if (!isCompact && indent && hasEl) out += "\n" + indent.repeat(depth);
        out += "</" + node.tagName + ">";
      }
    }
  };

  write(nodes, 0, false);
  return out[0] === "\n" ? out.slice(1) : out;
}

/**
 * Extract text content from nodes (for mixed content)
 */
export function toContentString(tDom: TNode | (TNode | string)[] | string): string {
  if (Array.isArray(tDom)) {
    return tDom
      .map((e) => toContentString(e))
      .join(" ")
      .trim();
  }
  if (typeof tDom === "object" && tDom !== null) {
    return toContentString(tDom.children);
  }
  return ` ${tDom}`;
}

/**
 * Find element by ID
 */
export function getElementById(
  S: string,
  id: string,
  simplified?: boolean,
): TNode | Record<string, any> | string | undefined {
  const out = parse(S, { attrValue: id });
  return simplified ? simplify(out) : out[0];
}

/**
 * Find elements by class name
 */
export function getElementsByClassName(
  S: string,
  classname: string,
  simplified?: boolean,
): (TNode | string)[] | Record<string, any> | string {
  const out = parse(S, {
    attrName: "class",
    attrValue: `[a-zA-Z0-9- ]*${classname}[a-zA-Z0-9- ]*`,
  });
  return simplified ? simplify(out) : out;
}

/**
 * Type guard: check if node is text (string)
 */
export function isTextNode(node: TNode | string): node is string {
  return typeof node === "string";
}

/**
 * Type guard: check if node is element (TNode)
 */
export function isElementNode(node: TNode | string): node is TNode {
  return typeof node === "object" && node !== null && "tagName" in node;
}
