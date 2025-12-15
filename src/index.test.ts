import { test, expect, describe } from "bun:test";
import * as tXml from "./index.js";
import type { TNode } from "./index.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import fs from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const files = {
  commented: join(__dirname, "../assets/commented.svg"),
  commentOnly: join(__dirname, "../assets/commentOnly.svg"),
  twoComments: join(__dirname, "../assets/twocomments.svg"),
  tagesschauRSS: join(__dirname, "../assets/tagesschau.rss"),
  wordpadDocxDocument: join(__dirname, "../assets/wordpad.docx.document.xml"),
};

describe("tXml basic parsing", () => {
  test("tXml is available", () => {
    expect(tXml).toBeTruthy();
  });

  test("empty string returns empty array", () => {
    expect(Array.isArray(tXml.parse(""))).toBe(true);
  });

  test("simplest parsing test", () => {
    expect(tXml.parse("<test>")).toEqual([{ tagName: "test", attributes: {}, children: [] }]);
  });

  test("single attribute", () => {
    expect(tXml.parse('<test att="v">')).toEqual([
      { tagName: "test", attributes: { att: "v" }, children: [] },
    ]);
  });

  test("multiple attributes", () => {
    expect(tXml.parse('<test att="v" att2="two">')).toEqual([
      { tagName: "test", attributes: { att: "v", att2: "two" }, children: [] },
    ]);
  });

  test("single text node", () => {
    expect(tXml.parse("childTest")).toEqual(["childTest"]);
  });

  test("single child text", () => {
    expect(tXml.parse("<test>childTest")).toEqual([
      { tagName: "test", attributes: {}, children: ["childTest"] },
    ]);
  });

  test("simple closing tag", () => {
    expect(tXml.parse("<test></test>")).toEqual([
      { tagName: "test", attributes: {}, children: [] },
    ]);
  });

  test("two child nodes", () => {
    expect(tXml.parse("<test><cc></cc><cc></cc></test>")).toEqual([
      {
        tagName: "test",
        attributes: {},
        children: [
          { tagName: "cc", attributes: {}, children: [] },
          { tagName: "cc", attributes: {}, children: [] },
        ],
      },
    ]);
  });

  test("ignore comments by default", () => {
    expect(
      tXml.parse(
        '<!-- some comment --><test><cc c="d"><!-- some comment --></cc><!-- some comment --><cc>value<!-- some comment --></cc></test>',
      ),
    ).toEqual([
      {
        tagName: "test",
        attributes: {},
        children: [
          { tagName: "cc", children: [], attributes: { c: "d" } },
          { tagName: "cc", attributes: {}, children: ["value"] },
        ],
      },
    ]);
  });

  test("ignore doctype declaration", () => {
    expect(tXml.parse("<!DOCTYPE html><test><cc></cc><cc></cc></test>")).toEqual([
      "!DOCTYPE html",
      {
        tagName: "test",
        attributes: {},
        children: [
          { tagName: "cc", attributes: {}, children: [] },
          { tagName: "cc", attributes: {}, children: [] },
        ],
      },
    ]);
  });

  test("filter option", () => {
    expect(
      tXml.parse("<test><cc></cc><cc></cc></test>", {
        filter: (element) => element.tagName.toLowerCase() === "cc",
      }),
    ).toEqual([
      { tagName: "cc", attributes: {}, children: [] },
      { tagName: "cc", attributes: {}, children: [] },
    ]);
  });

  test("simplify", () => {
    expect(
      JSON.stringify(
        tXml.simplify(
          tXml.parse(
            '<test><cc>one</cc>test<cc f="test"><sub>3</sub>two</cc><dd></dd></test>',
          ) as TNode[],
        ),
      ),
    ).toBe(
      JSON.stringify({
        test: { cc: ["one", { sub: "3", _attributes: { f: "test" } }], dd: "" },
      }),
    );
  });

  test("CSS with tag as comment", () => {
    expect(tXml.parse("<test><style>*{some:10px;}/* <tag> comment */</style></test>")).toEqual([
      {
        tagName: "test",
        attributes: {},
        children: [
          {
            tagName: "style",
            attributes: {},
            children: ["*{some:10px;}/* <tag> comment */"],
          },
        ],
      },
    ]);
  });

  test("do not cut off last character in style", () => {
    expect(tXml.parse('<style>p { color: "red" }</style>')).toEqual([
      {
        tagName: "style",
        attributes: {},
        children: ['p { color: "red" }'],
      },
    ]);
  });

  test("JavaScript creating tags in script", () => {
    expect(tXml.parse('<test><script>$("<div>")</script></test>')).toEqual([
      {
        tagName: "test",
        attributes: {},
        children: [
          {
            tagName: "script",
            attributes: {},
            children: ['$("<div>")'],
          },
        ],
      },
    ]);
  });

  test("stringify keeps optimal XML the same", () => {
    const x = `<test a="value"><child a='g"g'>text</child></test>`;
    expect(tXml.stringify(tXml.parse(x))).toBe(x);
  });

  test("getElementsByClassName", () => {
    const xShould = [
      {
        tagName: "h1",
        attributes: { class: "test package-name other-class test2" },
        children: [],
      },
    ];
    const x = tXml.getElementsByClassName(
      '<html><head></head><body><h1 class="test package-name other-class test2"></h1></body></html>',
      "package-name",
    );
    expect(x).toEqual(xShould);
  });

  test("attribute without value", () => {
    const s = "<test><something flag></something></test>";
    expect(tXml.stringify(tXml.parse(s))).toBe(s);
  });

  test("stringify ignores undefined", () => {
    expect(tXml.stringify(undefined as unknown as TNode)).toBe("");
  });

  test("toContentString", () => {
    expect(tXml.toContentString(tXml.parse('<test>f<case number="2">f</case>f</test>'))).toBe(
      "f f  f",
    );
  });

  test("getElementById", () => {
    expect(tXml.getElementById('<test><child id="theId">found</child></test>', "theId")).toEqual({
      tagName: "child",
      attributes: { id: "theId" },
      children: ["found"],
    });
  });

  test("CDATA", () => {
    expect(tXml.parse("<xml><![CDATA[some data]]></xml>")).toEqual([
      { tagName: "xml", attributes: {}, children: ["some data"] },
    ]);
  });

  test("parse standalone CDATA", () => {
    expect(tXml.parse("<![CDATA[nothing]]>")).toEqual(["nothing"]);
  });

  test("parse unclosed CDATA", () => {
    expect(tXml.parse("<![CDATA[nothing")).toEqual(["nothing"]);
  });

  test("keepComments option", () => {
    expect(tXml.parse("<test><!-- test --></test>", { keepComments: true })).toEqual([
      { tagName: "test", attributes: {}, children: ["<!-- test -->"] },
    ]);
  });

  test("keep two comments", () => {
    expect(
      tXml.parse("<test><!-- test --><!-- test2 --></test>", {
        keepComments: true,
      }),
    ).toEqual([
      {
        tagName: "test",
        attributes: {},
        children: ["<!-- test -->", "<!-- test2 -->"],
      },
    ]);
  });

  test("throw on wrong close tag", () => {
    expect(() => {
      tXml.parse("<user><name>robert</firstName><user>");
    }).toThrow();
  });

  test("simplifyLostLess empty nodes", () => {
    expect(tXml.simplifyLostLess([])).toEqual({});
  });

  test("simplifyLostLess string list", () => {
    expect(tXml.simplifyLostLess(["3"] as unknown as TNode[])).toBe(
      "3" as unknown as Record<string, unknown>,
    );
  });

  test("simplifyLostLess ignores non-objects", () => {
    expect(tXml.simplifyLostLess(["1", 2] as unknown as TNode[])).toEqual({});
  });

  test("filter allows nodes without children", () => {
    expect(tXml.filter([{} as unknown as TNode | string], () => true)).toEqual([
      {} as unknown as TNode,
    ]);
  });

  test("simplify option with parse", () => {
    tXml.parse('<?xml version="1.0"?><methodCall>TEST</methodCall>', {
      simplify: true,
    });
    expect(true).toBe(true);
  });

  test("SVG with comment", () => {
    const svgWithCommentString = fs.readFileSync(files.commented).toString();
    expect(tXml.parse(svgWithCommentString)).toEqual([
      {
        tagName: "svg",
        attributes: { height: "200", width: "500" },
        children: [
          {
            tagName: "polyline",
            attributes: {
              points: "20,20 40,25 60,40 80,120 120,140 200,180",
              style: "fill:none;stroke:black;stroke-width:3",
            },
            children: [],
          },
        ],
      },
    ]);
  });

  test("keepWhitespace option", () => {
    const wordpadDoc = fs.readFileSync(files.wordpadDocxDocument).toString();
    const filtered = tXml.filter(
      tXml.parse(wordpadDoc, { keepWhitespace: true }),
      (n) => n.tagName === "w:t",
    );
    expect(filtered[1].children[0]).toBe("    ");
  });
});

describe("Type guards", () => {
  test("isTextNode type guard", () => {
    const xml = "<div>Hello <span>World</span>!</div>";
    const [div] = tXml.parse(xml);

    expect(tXml.isTextNode("Hello")).toBe(true);
    expect(tXml.isTextNode((div as TNode).children[0])).toBe(true);
    expect(tXml.isTextNode(div)).toBe(false);
    expect(tXml.isTextNode((div as TNode).children[1])).toBe(false);

    const textNodes = (div as TNode).children.filter(tXml.isTextNode);
    expect(textNodes.length).toBe(2);
    expect(textNodes[0]).toBe("Hello");
    expect(textNodes[1]).toBe("!");
  });

  test("isElementNode type guard", () => {
    const xml = "<div>Hello <span>World</span>!</div>";
    const [div] = tXml.parse(xml);

    expect(tXml.isElementNode(div)).toBe(true);
    expect(tXml.isElementNode((div as TNode).children[1])).toBe(true);
    expect(tXml.isElementNode("Hello")).toBe(false);
    expect(tXml.isElementNode((div as TNode).children[0])).toBe(false);
    expect(tXml.isElementNode(null as unknown as TNode | string)).toBe(false);
    expect(tXml.isElementNode(undefined as unknown as TNode | string)).toBe(false);

    const elementNodes = (div as TNode).children.filter(tXml.isElementNode);
    expect(elementNodes.length).toBe(1);
    expect(elementNodes[0].tagName).toBe("span");
  });
});

describe("Attribute handling", () => {
  test("attribute values: null vs empty string vs value", () => {
    const xml = '<input disabled required="" value="test" checked>';
    const [input] = tXml.parse(xml);

    expect((input as TNode).attributes.disabled).toBe(null);
    expect((input as TNode).attributes.checked).toBe(null);
    expect((input as TNode).attributes.required).toBe("");
    expect((input as TNode).attributes.value).toBe("test");
  });
});

describe("Stringify options", () => {
  test("skipTags: skip script tags", () => {
    const xml = '<root><script>alert("hi")</script><div>content</div></root>';
    const parsed = tXml.parse(xml);
    const result = tXml.stringify(parsed, { skipTags: /^script$/ });
    expect(result).toBe("<root><div>content</div></root>");
  });

  test("skipTags: skip multiple tag types", () => {
    const xml = "<root><script>js</script><style>css</style><div>content</div></root>";
    const parsed = tXml.parse(xml);
    const result = tXml.stringify(parsed, { skipTags: /^(script|style)$/ });
    expect(result).toBe("<root><div>content</div></root>");
  });

  test("skipTags: regex pattern works", () => {
    const xml = "<root><script>js</script><div>content</div></root>";
    const parsed = tXml.parse(xml);
    const result = tXml.stringify(parsed, { skipTags: /^script$/ });
    expect(result).toBe("<root><div>content</div></root>");
  });

  test("stripParams: strip data-* attributes", () => {
    const xml = '<div data-id="123" data-test="abc" class="main">content</div>';
    const parsed = tXml.parse(xml);
    const result = tXml.stringify(parsed, { stripParams: /^data-/ });
    expect(result).toBe('<div class="main">content</div>');
  });

  test("stripParams: strip multiple attribute patterns", () => {
    const xml = '<button onclick="click()" onmouseover="hover()" class="btn">click</button>';
    const parsed = tXml.parse(xml);
    const result = tXml.stringify(parsed, { stripParams: /^on/ });
    expect(result).toBe('<button class="btn">click</button>');
  });

  test("stripParams: regex pattern works", () => {
    const xml = '<div data-id="123" class="main">content</div>';
    const parsed = tXml.parse(xml);
    const result = tXml.stringify(parsed, { stripParams: /^data-/ });
    expect(result).toBe('<div class="main">content</div>');
  });

  test("indentSpaces: format with 2-space indentation", () => {
    const xml = "<root><child><nested>text</nested></child></root>";
    const parsed = tXml.parse(xml);
    const result = tXml.stringify(parsed, { indentSpaces: 2 });
    // Text-only content stays inline with its closing tag
    expect(result).toBe(
      "<root>\n  <child>\n    <nested>\n      text</nested>\n  </child>\n</root>",
    );
  });

  test("indentSpaces: format with 4-space indentation", () => {
    const xml = "<root><child>text</child></root>";
    const parsed = tXml.parse(xml);
    const result = tXml.stringify(parsed, { indentSpaces: 4 });
    // Text-only content stays inline with its closing tag
    expect(result).toBe("<root>\n    <child>\n        text</child>\n</root>");
  });

  test("indentSpaces: 0 means no indentation (default behavior)", () => {
    const xml = "<root><child>text</child></root>";
    const parsed = tXml.parse(xml);
    const result = tXml.stringify(parsed, { indentSpaces: 0 });
    expect(result).toBe("<root><child>text</child></root>");
  });

  test("compactTags: render inline elements compactly", () => {
    const xml = "<root><p><span><b>bold</b></span> text</p></root>";
    const parsed = tXml.parse(xml);
    const result = tXml.stringify(parsed, {
      indentSpaces: 2,
      compactTags: /^(span|b|i|a)$/,
    });
    expect(result).toBe("<root>\n  <p>\n    <span><b>bold</b></span>\n    text\n  </p>\n</root>");
  });

  test("compactTags: regex pattern works", () => {
    const xml = "<root><span><b>text</b></span></root>";
    const parsed = tXml.parse(xml);
    const result = tXml.stringify(parsed, {
      indentSpaces: 2,
      compactTags: /^span$/,
    });
    expect(result).toBe("<root>\n  <span><b>text</b></span>\n</root>");
  });

  test("combined options: skip, strip, compact, and indent", () => {
    const xml =
      '<html><head><script>js</script></head><body data-page="1"><div class="main"><span>hello</span></div></body></html>';
    const parsed = tXml.parse(xml);
    const result = tXml.stringify(parsed, {
      skipTags: /^(script|head)$/,
      stripParams: /^data-/,
      compactTags: /^span$/,
      indentSpaces: 2,
    });
    expect(result).toBe(
      '<html>\n  <body>\n    <div class="main">\n      <span>hello</span>\n    </div>\n  </body>\n</html>',
    );
  });

  test("stringify without options maintains backward compatibility", () => {
    const xml = '<root><child attr="value">text</child></root>';
    const parsed = tXml.parse(xml);
    const result = tXml.stringify(parsed);
    expect(result).toBe('<root><child attr="value">text</child></root>');
  });

  test("empty options object maintains default behavior", () => {
    const xml = "<root><child>text</child></root>";
    const parsed = tXml.parse(xml);
    const result = tXml.stringify(parsed, {});
    expect(result).toBe("<root><child>text</child></root>");
  });

  test("skipTags: skips nested children of skipped tags", () => {
    const xml = "<root><script><inner>should not appear</inner></script><div>visible</div></root>";
    const parsed = tXml.parse(xml);
    const result = tXml.stringify(parsed, { skipTags: /^script$/ });
    expect(result).toBe("<root><div>visible</div></root>");
  });

  test("indentSpaces: handles multiple root elements", () => {
    const xml = "<item>one</item><item>two</item>";
    const parsed = tXml.parse(xml);
    const result = tXml.stringify(parsed, { indentSpaces: 2 });
    // Text-only content stays inline with its closing tag
    expect(result).toBe("<item>\n  one</item>\n<item>\n  two</item>");
  });

  test("stripParams: preserves attributes that don't match", () => {
    const xml = '<div id="main" data-test="1" class="container">content</div>';
    const parsed = tXml.parse(xml);
    const result = tXml.stringify(parsed, { stripParams: /^data-/ });
    expect(result).toBe('<div id="main" class="container">content</div>');
  });

  // Complex tests
  test("complex: deeply nested structure with indentation", () => {
    const xml = "<a><b><c><d><e>deep</e></d></c></b></a>";
    const parsed = tXml.parse(xml);
    const result = tXml.stringify(parsed, { indentSpaces: 2 });
    expect(result).toBe(
      "<a>\n  <b>\n    <c>\n      <d>\n        <e>\n          deep</e>\n      </d>\n    </c>\n  </b>\n</a>",
    );
  });

  test("complex: skip deeply nested tags", () => {
    const xml =
      "<root><keep><skip><deep>hidden</deep></skip><visible>shown</visible></keep></root>";
    const parsed = tXml.parse(xml);
    const result = tXml.stringify(parsed, { skipTags: /^skip$/ });
    expect(result).toBe("<root><keep><visible>shown</visible></keep></root>");
  });

  test("complex: mixed content with compact inline elements", () => {
    const xml = "<article><p>Start <em>emphasized <strong>bold</strong></em> end</p></article>";
    const parsed = tXml.parse(xml);
    const result = tXml.stringify(parsed, {
      indentSpaces: 2,
      compactTags: /^(em|strong|span|b|i)$/,
    });
    expect(result).toBe(
      "<article>\n  <p>\n    Start\n    <em>emphasized<strong>bold</strong></em>\n    end\n  </p>\n</article>",
    );
  });

  test("complex: strip multiple attribute patterns in nested tags", () => {
    const xml =
      '<div data-id="1" onclick="click()" class="main"><span data-ref="2" onhover="h()" id="s1">text</span></div>';
    const parsed = tXml.parse(xml);
    const result = tXml.stringify(parsed, { stripParams: /^(data-|on)/ });
    expect(result).toBe('<div class="main"><span id="s1">text</span></div>');
  });

  test("complex: all options combined on real HTML-like structure", () => {
    const xml = `<html><head><meta charset="utf-8"><script>alert(1)</script><style>.x{}</style></head><body data-page="home" onclick="track()"><header class="top"><nav><a href="/">Home</a></nav></header><main><article><p>Hello <b>world</b>!</p></article></main></body></html>`;
    const parsed = tXml.parse(xml);
    const result = tXml.stringify(parsed, {
      skipTags: /^(script|style|meta)$/,
      stripParams: /^(data-|on)/,
      compactTags: /^(a|b|i|span)$/,
      indentSpaces: 2,
    });
    // Empty <head> gets closing tag on new line due to having had element children (before skip)
    expect(result).toBe(
      '<html>\n  <head>\n  </head>\n  <body>\n    <header class="top">\n      <nav>\n        <a href="/">Home</a>\n      </nav>\n    </header>\n    <main>\n      <article>\n        <p>\n          Hello\n          <b>world</b>\n          !\n        </p>\n      </article>\n    </main>\n  </body>\n</html>',
    );
  });

  test("complex: siblings with mixed skip and keep", () => {
    const xml = "<ul><li>one</li><script>x</script><li>two</li><style>y</style><li>three</li></ul>";
    const parsed = tXml.parse(xml);
    const result = tXml.stringify(parsed, {
      skipTags: /^(script|style)$/,
      indentSpaces: 2,
    });
    expect(result).toBe(
      "<ul>\n  <li>\n    one</li>\n  <li>\n    two</li>\n  <li>\n    three</li>\n</ul>",
    );
  });

  test("complex: preserve processing instruction with options", () => {
    const xml = '<?xml version="1.0"?><root data-x="1"><child>text</child></root>';
    const parsed = tXml.parse(xml);
    const result = tXml.stringify(parsed, {
      stripParams: /^data-/,
      indentSpaces: 2,
    });
    expect(result).toBe('<?xml version="1.0"?>\n<root>\n  <child>\n    text</child>\n</root>');
  });

  test("complex: attributes with quotes and special chars", () => {
    const xml = `<div title='He said "hello"' data-json='{"a":1}' class="normal">text</div>`;
    const parsed = tXml.parse(xml);
    const result = tXml.stringify(parsed, { stripParams: /^data-/ });
    expect(result).toBe(`<div title='He said "hello"' class="normal">text</div>`);
  });

  test("complex: empty elements at various depths", () => {
    const xml = "<root><empty1/><level1><empty2/><level2><empty3/></level2></level1></root>";
    const parsed = tXml.parse(xml);
    const result = tXml.stringify(parsed, { indentSpaces: 2 });
    expect(result).toBe(
      "<root>\n  <empty1></empty1>\n  <level1>\n    <empty2></empty2>\n    <level2>\n      <empty3></empty3>\n    </level2>\n  </level1>\n</root>",
    );
  });

  test("complex: compact parent affects all descendants", () => {
    const xml =
      "<root><compact><a><b><c>deep</c></b></a></compact><normal><x>text</x></normal></root>";
    const parsed = tXml.parse(xml);
    const result = tXml.stringify(parsed, {
      indentSpaces: 2,
      compactTags: /^compact$/,
    });
    expect(result).toBe(
      "<root>\n  <compact><a><b><c>deep</c></b></a></compact>\n  <normal>\n    <x>\n      text</x>\n  </normal>\n</root>",
    );
  });
});
