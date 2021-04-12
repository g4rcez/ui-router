import { IFileManager } from ".";
import axios from "axios";
import { Strings } from "../lib/strings";

const BASE = "http://localhost:9801";

export const HttpManager: IFileManager = async () => ({
  formatPath: (p) => Strings.joinUrl(BASE, p),
  fetchVersions: async () => {
    const response = await axios.get(`${BASE}/versions.json`);
    return response.data;
  },
  baseUrl: BASE,
  get: async (path) => {
    const href = Strings.joinUrl(BASE, path.replace(/^\.\//, "/"));
    const response = await axios.get(href);
    const content = response.data;
    return {
      content,
      sha256: Strings.sha256(content),
      type: response.headers["content-type"],
    };
  },
  getAllAppFiles: async (app, version) => {
    const href = Strings.joinUrl(BASE, app, version, "all__files.json");
    const response = await axios.get(href);
    return response.data;
  },
});
