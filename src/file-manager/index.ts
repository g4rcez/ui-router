import { RenderCache } from "../render/cache";
import { Render } from "../render";

export type FileManager = {
  baseUrl: string;
  fetchVersions: () => Promise<Render.Apps>;
  get: (path: string) => Promise<RenderCache.CacheFile>;
  getAllAppFiles: (app: string, version: string) => Promise<string[]>;
  formatPath: (file: string) => string;
};

export type IFileManager = () => Promise<FileManager>;
