import { Transform } from "node:stream";
import { parse, TNode, ParseOptions } from "./tXml.js";

/**
 * Create a Node.js Transform stream that parses XML chunks
 * @param offset - Starting offset or string whose length is the offset
 * @param parseOptions - Options for the XML parser
 * @returns Transform stream that emits parsed XML nodes
 */
export function transformStream(
  offset: number | string = 0,
  parseOptions: ParseOptions = {},
): Transform {
  let position = typeof offset === "string" ? offset.length : offset;
  let data = "";

  return new Transform({
    objectMode: true,

    transform(chunk: Buffer | string, _encoding: string, callback: () => void) {
      data += chunk;
      let lastPos = 0;

      while (true) {
        position = data.indexOf("<", position) + 1;

        if (!position) {
          position = lastPos;
          callback();
          return;
        }

        // Skip close tags
        if (data[position] === "/") {
          position++;
          lastPos = position;
          continue;
        }

        // Handle comments
        if (data[position] === "!" && data[position + 1] === "-" && data[position + 2] === "-") {
          const commentEnd = data.indexOf("-->", position + 3);
          if (commentEnd === -1) {
            data = data.slice(lastPos);
            position = 0;
            callback();
            return;
          }

          if (parseOptions.keepComments) {
            this.push(data.substring(position - 1, commentEnd + 3));
          }

          position = commentEnd + 1;
          lastPos = commentEnd;
          continue;
        }

        // Parse node
        const res = parse(data, {
          ...parseOptions,
          pos: position - 1,
          parseNode: true,
          setPos: true,
        }) as unknown as TNode & { pos: number };

        position = res.pos;

        if (position > data.length - 1 || position < lastPos) {
          data = data.slice(lastPos);
          position = 0;
          callback();
          return;
        }

        this.push(res);
        lastPos = position;
      }
    },
  });
}

/**
 * Create a Web Streams API TransformStream that parses XML chunks
 * Compatible with browsers, Deno, Bun, and modern Node.js
 * @param offset - Starting offset or string whose length is the offset
 * @param parseOptions - Options for the XML parser
 * @returns Web TransformStream that emits parsed XML nodes
 */
export function transformWebStream(
  offset: number | string = 0,
  parseOptions: ParseOptions = {},
): TransformStream<string, TNode | string> {
  let position = typeof offset === "string" ? offset.length : offset;
  let data = "";

  return new TransformStream({
    transform(chunk: string, controller: TransformStreamDefaultController<TNode | string>) {
      data += chunk;
      let lastPos = 0;

      while (true) {
        position = data.indexOf("<", position) + 1;

        if (!position) {
          position = lastPos;
          return;
        }

        // Skip close tags
        if (data[position] === "/") {
          position++;
          lastPos = position;
          continue;
        }

        // Handle comments
        if (data[position] === "!" && data[position + 1] === "-" && data[position + 2] === "-") {
          const commentEnd = data.indexOf("-->", position + 3);
          if (commentEnd === -1) {
            data = data.slice(lastPos);
            position = 0;
            return;
          }

          if (parseOptions.keepComments) {
            controller.enqueue(data.substring(position - 1, commentEnd + 3));
          }

          position = commentEnd + 1;
          lastPos = commentEnd;
          continue;
        }

        // Parse node
        const res = parse(data, {
          ...parseOptions,
          pos: position - 1,
          parseNode: true,
          setPos: true,
        }) as unknown as TNode & { pos: number };

        position = res.pos;

        if (position > data.length - 1 || position < lastPos) {
          data = data.slice(lastPos);
          position = 0;
          return;
        }

        controller.enqueue(res);
        lastPos = position;
      }
    },
  });
}
