import { IFileManager } from "../file-manager";
import { Strings } from "../lib/strings";
import { RenderCache } from "./cache";
import { HtmlParser } from "./html";

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
    host: string;
    cacheStrategy: string;
  };

  export type AppsMap = Record<string, App>;

  const reduceApps = async (apps: Apps) => apps.reduce<AppsMap>((acc, el) => ({ ...acc, [el.name]: el }), {});

  export const Boot = async (constructor: Constructor) => {
    const fileManager = await constructor.fileManager();
    const apps = await fileManager.fetchVersions();
    const appsMap = await reduceApps(apps);
    const cache = RenderCache.InMemory();

    const cacheApp = async (app: App) => {
      if (app.type === "javascript") {
        const jsFile = await fileManager.get(Strings.appName(app.name, app.version));
        cache.set(app.entryPoint, jsFile);
        return Promise.resolve();
      }

      const appBase = Strings.joinUrl(app.location, app.version);
      const allFiles = await fileManager.getAllAppFiles(app.location, app.version);
      const appRoot = Strings.joinUrl(app.name, app.version);

      const HTMLs = allFiles.filter((x) => HtmlParser.IsHtml(x));
      const assets = allFiles.filter((x) => !HtmlParser.IsHtml(x));

      const mapPathToCache = (file: string) => {
        if (file.includes(appRoot)) return file;
        return Strings.joinUrl(appRoot, file);
      };

      const mapPathToServer = (file: string) => {
        if (file.includes(appBase)) return file;
        return Strings.joinUrl(appBase, file);
      };
      const vendorReplacer = HtmlParser.CreateURLVendorReplacer(app);

      await Promise.allSettled(
        assets.map(async (file) => {
          const fileUrl = Strings.joinUrl(appBase, file);
          const response = await fileManager.get(fileUrl);
          const newContent = vendorReplacer(response.content);

          if (HtmlParser.IsVendorJs(file)) {
            const vendor = HtmlParser.VendorNameVersion(file);
            const url = Strings.joinUrl("/libs", `${vendor.package}${vendor.version}.js`);
            return cache.set(url, {
              content: newContent,
              type: "text/html",
              sha256: Strings.sha256(newContent),
            });
          }
          const url = Strings.removeTrailingPath("/" + mapPathToCache(file));
          return cache.set(url, {
            content: newContent,
            type: response.type,
            sha256: Strings.sha256(newContent),
          });
        })
      );

      await Promise.allSettled(
        HTMLs.map(async (x) => {
          const fileUrl = Strings.joinUrl(appBase, x);
          const response = await fileManager.get(fileUrl);

          const dom = HtmlParser.FirstParse(response.content);
          try {
            await HtmlParser.RenderTransform({
              app,
              dom,
              cache,
              fileManager,
              mapPathToServer,
              mapPathToCache,
              vendorReplacer,
            });
            const minifyHtml = HtmlParser.Minify(dom.toString());
            cache.set(appRoot, {
              content: minifyHtml,
              type: "text/html",
              sha256: Strings.sha256(minifyHtml),
            });
          } catch (error) {
            console.error(error.name, error.message);
          }
          return;
        })
      );
    };

    const cacheAll = async () => {
      console.time("CACHEALL");
      try {
        await Promise.all(apps.map(cacheApp));
        console.error(cache.allKeys());
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
      getFile: (url: string) => cache.get(url),
      hasFile: (url: string) => cache.has(url),
    };
  };
}
