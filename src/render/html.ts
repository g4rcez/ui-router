import { minify } from "html-minifier";
import { HTMLElement, parse } from "node-html-parser";
import { Render } from ".";
import { FileManager } from "../file-manager";
import { Strings } from "../lib/strings";
import { RenderCache } from "./cache";

export const VENDOR_FILE = /vendor\/(?<package>(@[a-z-]+)?[a-z-]+)(?<version>_([0-9]+)\.([0-9]+)\.([0-9]+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+)?)?/;
export const IMPORT_VENDOR_FILE = /from"(.\/)(?<package>(@[a-z-]+)?[a-z-]+)(?<version>_([0-9]+)\.([0-9]+)\.([0-9]+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+)?)?.js"/g;

export namespace HtmlParser {
  export const FirstParse = (html: string): HTMLElement => parse(html, { comment: false, lowerCaseTagName: true });

  export const Parse = (html: string): HTMLElement => parse(html, { comment: true, lowerCaseTagName: false });

  type RemapUrl = (path: string) => string;

  type Params = {
    app: Render.App;
    dom: HTMLElement;
    fileManager: FileManager;
    cache: RenderCache.Cacher;
    mapPathToServer: RemapUrl;
    mapPathToCache: RemapUrl;
    vendorReplacer: (file: string) => string;
  };

  type RemapAndCache = (x: Params) => Promise<HTMLElement>;

  type TagFunction = (dom: HTMLElement, y: { sha256: string }) => void;

  type TagFunc = Record<string, TagFunction>;

  const tagFuncBase: TagFunction = (x, params) => {
    x.setAttribute("async", "true");
    x.setAttribute("defer", "true");
    x.setAttribute("integrity", params.sha256);
  };

  const tagFunc: TagFunc = { SCRIPT: tagFuncBase, LINK: tagFuncBase };

  export const CreateURLVendorReplacer = (app: Render.App) => {
    const regex = new RegExp(`/${app.name}/${app.version}/@vendor/`, "gm");

    return (val: string) => {
      const replaced = val.replace(regex, "/libs/").replace(/\.\/@vendor\//gm, "/libs/");
      if (app.name === "xablau" && val.length <= 3000) {
        console.warn({ regex, val, r: replaced });
      }
      return replaced;
    };
  };

  const editUrlProperty = async (x: Params & { property: string }): Promise<void> => {
    const value = x.dom.getAttribute(x.property).replace(/^\.\//, "");
    const url = x.mapPathToServer(value);
    const response = await x.fileManager.get(url);
    const val = Strings.removeTrailingPath("/" + x.mapPathToCache(value));
    const replacedVendorUrl = x.vendorReplacer(val);
    const content = x.vendorReplacer(response.content);
    x.dom.setAttribute(x.property, replacedVendorUrl);
    x.cache.set(replacedVendorUrl, { ...response, content });
    const integrity = `sha256-${Strings.sha256(content)}`;
    x.dom.setAttribute("integrity", integrity);
    const func = tagFunc[x.dom.tagName];
    if (func) {
      func(x.dom, { sha256: integrity });
    }
  };

  const QuerySelectorAll = (dom: HTMLElement, query: string): HTMLElement[] => [...dom.querySelectorAll(query)];

  export const InsertBefore = (dom: HTMLElement, template: string) => dom.insertAdjacentHTML("afterbegin", template);

  export const RenderTransform: RemapAndCache = async (params) => {
    try {
      const head = params.dom.querySelector("head");
      const body = params.dom.querySelector("body");
      head.appendChild(Parse(`<meta http-equiv="x-dns-prefetch-control" content="on"/>`));
      const scriptsImages = QuerySelectorAll(params.dom, "script[src],img[src]").map((dom) =>
        editUrlProperty({ ...params, dom, property: "src" })
      );

      const links = QuerySelectorAll(params.dom, "link[href]").map((dom) =>
        editUrlProperty({ ...params, dom, property: "href" })
      );

      await Promise.all([...scriptsImages, ...links]);
      return params.dom;
    } catch (error) {
      console.error(error);
    }
  };

  export const IsHtml = (name: string): boolean => /\.html$/.test(name);

  export const IsJS = (name: string): boolean => /\.js$/.test(name);

  export const IsVendorJs = (name: string): boolean => /\.js$/.test(name) && VENDOR_FILE.test(name);

  export const VendorNameVersion = (name: string): { package: string; version: string } =>
    VENDOR_FILE.exec(name)?.groups! as never;

  export const ReplaceVendorImport = (name: string): string => name.replace(IMPORT_VENDOR_FILE, '"/vendor/$2$4/"');

  export const Minify = (html: string) =>
    minify(html, {
      html5: true,
      collapseBooleanAttributes: true,
      collapseInlineTagWhitespace: true,
      removeAttributeQuotes: true,
      removeComments: true,
      keepClosingSlash: true,
      collapseWhitespace: false,
    });

  type SSGParams = {
    headers: Record<string, string>;
    params: Record<string, string>;
  };

  export const AddScript = (x: { filename: string; app: Render.App; content: string; cache: RenderCache.Cacher }) => {
    const url = "/" + Strings.joinUrl(x.app.name, x.app.version, x.filename);
    x.cache.set(url, {
      content: x.content,
      sha256: Strings.sha256(x.content),
      type: "application/javascript",
    });
    return Parse(`<script src="${url}"></di>`);
  };

  export const SSG = (html: string, _: SSGParams) => {
    const uid = Strings.nonce();
    const dom = Parse(html);
    const head = dom.querySelector("head");
    const csp = dom.querySelector(`meta[http-equiv="Content-Security-Policy"]`);
    if (csp !== null) {
      head.appendChild(
        Parse(
          `<meta http-equiv="Content-Security-Policy" content="'nonce-${uid}' 'self' cdn.split.io https://www.google-analytics.com/analytics.js">`
        )
      );
    }
    [...QuerySelectorAll(dom, "script"), ...QuerySelectorAll(dom, "link")].map((x) => {
      return x.setAttribute("nonce", uid);
    });
    return dom.toString();
  };
}
