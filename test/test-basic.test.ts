import { test, expect, describe } from "bun:test";
import * as tXml from "../src/index.js";
import type { TNode } from "../src/tXml.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import fs from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const files = {
  commented: join(__dirname, "examples/commented.svg"),
  commentOnly: join(__dirname, "examples/commentOnly.svg"),
  twoComments: join(__dirname, "examples/twocomments.svg"),
  tagesschauRSS: join(__dirname, "examples/tagesschau.rss"),
  wordpadDocxDocument: join(__dirname, "examples/wordpad.docx.document.xml"),
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
