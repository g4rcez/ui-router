import fastify from "fastify";
import { HttpManager } from "./file-manager/http-server";
import { Proxy } from "./proxies";
import { PostmonProxy } from "./proxies/postmon";
import { Render } from "./render";
import { Html } from "./render/html";
import { Request, Response } from "./server.types";

type Params = {
  app: string;
  version: string;
};

(async () => {
  try {
    const render = await Render.Init({ fileManager: HttpManager, cacheStrategy: "in-memory" });

    await render.cacheAll();

    const server = fastify({ exposeHeadRoutes: false, onConstructorPoisoning: "error" });

    server.register((srv, _, done) => {
      const registerProxies = (...proxy: Proxy.Config[]) => proxy.map((x) => srv.all(x.register, x.handler));
      registerProxies(PostmonProxy);
      done();
    });

    const appEntryPoint = async (name: string, request: Request, response: Response) => {
      const app = render.getApp(name);
      if (app === undefined) {
        return response.status(404).send({ notFound: true });
      }
      const ssg = await Html.SSG(app.content, {
        params: request.params as never,
        headers: request.headers as never,
      });
      response.type(app.type);
      return response.send(ssg);
    };

    const getApp = (request: Request, response: Response): any => {
      const x: Params = request.params as any;
      const hasApp = render.hasApp(x.app, x.version);
      if (!hasApp) {
        response.status(404);
        return response.send({ status: "NotFound" });
      }
      return appEntryPoint(x.app, request, response);
    };

    server.get(`${Html.DependencyPath}/*`, (request, response): any => {
      const file = render.hasFile(request.url);
      if (file === false) {
        return response.status(500);
      }
      const x = render.getFile(request.url);
      if (x === undefined) {
        return response.status(404).send({ notFound: true });
      }
      response.header("Cache-Control", "public, max-age=31536000");
      response.type(x.type);
      return response.send(x.content);
    });

    server.get("/:app/:version", getApp);
    server.get("/:app", getApp);

    server.get("/:app/:version/*", (request, response): any => {
      const hasFile = render.hasFile(request.url);
      if (!hasFile) {
        response.status(404);
        const x: Params = request.params as any;
        return appEntryPoint(x.app, request, response);
      }
      const file = render.getFile(request.url);
      if (file === undefined) {
        return response.status(404).send({ notFound: true });
      }
      response.header("Cache-Control", "public, max-age=31536000");
      response.type(file.type);
      return response.send(file.content);
    });

    server.listen(5000, (err, address) => {
      if (err) {
        server.log.error(err);
        process.exit(1);
      }
      console.log("Now server is up", address);
      server.log.info(`Server listening on ${address}`);
    });
  } catch (error) {
    console.error(error);
  }
})();
