import { IFileManager } from "../file-manager";
import { Strings } from "../lib/strings";
import { RenderCache } from "./cache";
import { Html } from "./html";

export namespace Render {
  export type App = {
    location: string;
    name: string;
    version: string;
    entryPoint: string;
    type: "html" | "javascript";
  };

  export type Apps = Array<App>;

  export type Constructor = {
    fileManager: IFileManager;
    cacheStrategy: string;
  };

  export type AppsMap = Record<string, App>;

  const reduceApps = async (apps: Apps) => apps.reduce<AppsMap>((acc, el) => ({ ...acc, [el.name]: el }), {});

  export const Init = async (constructor: Constructor) => {
    const fileManager = await constructor.fileManager();
    const apps = await fileManager.fetchVersions();
    const appsMap = await reduceApps(apps);
    const cache = RenderCache.getCacheStrategy("in-memory");

    const cacheApp = async (app: App) => {
      if (app.type === "javascript") {
        const jsFile = await fileManager.get(Strings.appVersion(app.name, app.version));
        cache.set(app.entryPoint, jsFile);
        return Promise.resolve();
      }

      const appBase = Strings.joinUrl(app.location, app.version);
      const allFiles = await fileManager.getAllAppFiles(app.location, app.version);
      const appRoot = Strings.joinUrl(app.name, app.version);

      const pages = allFiles.filter((x) => Html.IsHtml(x));
      const assets = allFiles.filter((x) => !Html.IsHtml(x));

      const mapPathToCache = (file: string) => {
        if (file.includes(appRoot)) return file;
        return Strings.joinUrl(appRoot, file);
      };

      const mapPathToServer = (file: string) => {
        if (file.includes(appBase)) return file;
        return Strings.joinUrl(appBase, file);
      };

      const vendorReplacer = Html.CreateURLVendorReplacer(app);

      await Promise.allSettled(
        assets.map(async (file) => {
          const fileUrl = Strings.joinUrl(appBase, file);
          const response = await fileManager.get(fileUrl);
          const newContent = vendorReplacer(response.content);
          const sha256 = Strings.sha256(newContent);
          if (Html.IsVendorJs(file)) {
            const vendor = Html.VendorNameVersion(file);
            const url = Strings.joinUrl(Html.DependencyPath, `${vendor.package}${vendor.version}.js`);
            return cache.set(url, { content: newContent, type: Html.ContentType.Js, sha256 });
          }
          const url = Strings.removeTrailingPath("/" + mapPathToCache(file));
          return cache.set(url, { content: newContent, type: response.type, sha256 });
        })
      );

      await Promise.allSettled(
        pages.map(async (x) => {
          const fileUrl = Strings.joinUrl(appBase, x);
          const response = await fileManager.get(fileUrl);
          const dom = Html.FirstParse(response.content);
          try {
            const DOM = await Html.RenderTransform({
              app,
              dom,
              cache,
              fileManager,
              mapPathToServer,
              mapPathToCache,
              vendorReplacer,
            });
            const content = Html.Minify(DOM);
            cache.set(appRoot, { content, type: Html.ContentType.Html, sha256: Strings.sha256(content) });
          } catch (error) {
            console.error("ERROR", error.name, error.message);
          }
        })
      );
    };

    const cacheAll = async () => {
      console.time("CACHEALL");
      try {
        await Promise.all(apps.map(cacheApp));
      } catch (error) {
        console.error("Error", error);
      } finally {
        console.timeEnd("CACHEALL");
      }
    };

    const hasApp = (name: string, version?: string) => {
      const app = appsMap[name];
      return cache.has(Strings.joinUrl(name, version ?? app.version));
    };

    const getApp = (name: string, version?: string) => {
      const app = appsMap[name];
      return cache.get(Strings.joinUrl(name, version ?? app.version));
    };

    return {
      cacheAll,
      hasApp,
      getApp,
      getFile: (key: string) => cache.get(key),
      hasFile: (key: string) => cache.has(key),
    };
  };
}
