import { minify } from "html-minifier";
import { HTMLElement, parse } from "node-html-parser";
import { Render } from ".";
import { FileManager } from "../file-manager";
import { Strings } from "../lib/strings";
import { RenderCache } from "./cache";

export const VENDOR_FILE = /vendor\/(?<package>(@[a-z-]+)?[a-z-]+)(?<version>_([0-9]+)\.([0-9]+)\.([0-9]+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+)?)?/;

export namespace Html {
  type RemapUrl = (path: string) => string;

  type Params = {
    app: Render.App;
    dom: HTMLElement;
    fileManager: FileManager;
    cache: RenderCache.Operations;
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

  export const DependencyPath = "/@node_modules";

  export const FirstParse = (html: string): HTMLElement => parse(html, { comment: false, lowerCaseTagName: true });

  export const Parse = (html: string): HTMLElement => parse(html, { comment: true, lowerCaseTagName: false });

  const QuerySelectorAll = (dom: HTMLElement, query: string): HTMLElement[] => [...dom.querySelectorAll(query)];

  export const InsertBefore = (dom: HTMLElement, template: string) => dom.insertAdjacentHTML("afterbegin", template);

  export const IsHtml = (name: string): boolean => /\.html$/.test(name);

  export const IsVendorJs = (name: string): boolean => /\.js$/.test(name) && VENDOR_FILE.test(name);

  const ImageExtensions = ["svg", "png", "jpg", "jpeg"];

  export const IsImageOrgSvg = (str: string) => ImageExtensions.some((x) => str.endsWith(x));

  export const VendorNameVersion = (name: string): { package: string; version: string } =>
    VENDOR_FILE.exec(name)?.groups! as never;

  export const ContentType = {
    Html: "text/html",
    Js: "text/javascript",
    Css: "text/css",
  };

  export type TemplateFunction = (path: string) => <T extends object>(data: T) => string;

  export const CreateURLVendorReplacer = (app: Render.App) => {
    const regex = new RegExp(`/${app.name}/${app.version}/@vendor/`, "gm");
    return (val: string) => {
      const thirdPartyPath = `${Html.DependencyPath}/`;
      return val.replace(regex, thirdPartyPath).replace(/\.\/@vendor\//gm, thirdPartyPath);
    };
  };

  const editUrlProperty = async (x: Params & { property: string }): Promise<void> => {
    const attr = x.dom.getAttribute?.(x.property);
    if (attr === undefined) return;
    const value = attr.replace(/^\.\//, "");
    const url = x.mapPathToServer(value);
    const response = await x.fileManager.get(url);
    const val = Strings.removeTrailingPath("/" + x.mapPathToCache(value));
    const replacedVendorUrl = x.vendorReplacer(val);
    const content = x.vendorReplacer(response.content);
    x.dom.setAttribute(x.property, replacedVendorUrl);
    x.cache.set(replacedVendorUrl, { ...response, content });
    const sha256 = `sha256-${Strings.sha256(content)}`;
    x.dom.setAttribute("integrity", sha256);
    tagFunc[x.dom.tagName]?.(x.dom, { sha256 });
  };

  export const RenderTransform: RemapAndCache = async (params) => {
    try {
      const head = params.dom.querySelector("head");
      // const body = params.dom.querySelector("body");
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
      throw error;
    }
  };

  export const Minify = (html: HTMLElement) =>
    minify(html.toString(), {
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

  export const AddScript = (x: {
    filename: string;
    app: Render.App;
    content: string;
    cache: RenderCache.Operations;
  }) => {
    const url = "/" + Strings.joinUrl(x.app.name, x.app.version, x.filename);
    x.cache.set(url, {
      content: x.content,
      sha256: Strings.sha256(x.content),
      type: "application/javascript",
    });
    return Parse(`<script src="${url}"></script>`);
  };

  export const SSG = async (html: string, ssgParams: SSGParams) => {
    const nonce = Strings.nonce();
    const dom = Parse(html);
    const head = dom.querySelector("head");
    const csp = dom.querySelector(`meta[http-equiv="Content-Security-Policy"]`);
    if (csp === null) {
      head.appendChild(Parse(`<meta http-equiv="Content-Security-Policy" content="script-src 'nonce-${nonce}'">`));
    }
    QuerySelectorAll(dom, "script,link").map((x) => x.setAttribute("nonce", nonce));
    const ref = { ...ssgParams, user: Strings.nonce() };
    const variables: Array<keyof typeof ref> = Object.keys(ref) as never;
    return variables.reduce((acc, el) => {
      const regex = new RegExp(`\\{\\|\\s${el}\\s\\|\\}`, "g");
      return acc.replace(regex, ref[el] as never);
    }, dom.toString());
  };
}
