import { IFileManager } from ".";
import { httpClient } from "../lib/http-client";
import { Strings } from "../lib/strings";

const BASE = "http://localhost:9801";

export const HttpManager: IFileManager = async () => ({
  fetchVersions: async () => {
    const response = await httpClient.get(`${BASE}/versions.json`);
    return response.data;
  },
  formatPath: (p) => Strings.joinUrl(BASE, p),
  baseUrl: BASE,
  get: async (path) => {
    const href = Strings.joinUrl(BASE, path.replace(/^\.\//, "/"));
    const response = await httpClient.get(href);
    const content = response.data;
    return {
      content,
      sha256: Strings.sha256(content),
      type: response.headers["content-type"],
    };
  },
  getAllAppFiles: async (app, version) => {
    const href = Strings.joinUrl(BASE, app, version, "all__files.json");
    const response = await httpClient.get(href);
    return response.data;
  },
});
