import { createHash, randomBytes } from "crypto";

export namespace Strings {
  export const joinUrl = (base: string, ...uris: string[]) =>
    uris.reduce((url, uri) => url + "/" + uri.replace(/^\/+/, ""), base.replace(/\/+$/, ""));

  export const appName = (app: string, version: string) => joinUrl(app, version);

  export const sha256 = (content: string) => createHash("sha256").update(content).digest("base64");

  export const uid = () => Math.random().toString(36).substring(2, 16);

  export const removeTrailingPath = (path: string) => path.replace(/^\/+/, "/").replace(/\/+$/, "/");

  export const nonce = () => randomBytes(16).toString("base64");
}
