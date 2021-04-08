import fastify, { FastifyReply, FastifyRequest } from "fastify";
import { RouteGenericInterface } from "fastify/types/route";
import { IncomingMessage, Server, ServerResponse } from "node:http";
import { HttpManager } from "./file-manager/http-server";
import { Render } from "./render";
import { HtmlParser } from "./render/html";

type Request = FastifyRequest<RouteGenericInterface, Server, IncomingMessage>;

type Reply = FastifyReply<Server, IncomingMessage, ServerResponse, RouteGenericInterface, unknown>;

(async () => {
  try {
    const render = await Render.Boot({
      fileManager: HttpManager,
      cacheStrategy: "in-memory",
      host: "localhost:5000",
    });

    await render.cacheAll();

    const server = fastify({ caseSensitive: true });

    const getApp = (request: Request, reply: Reply): any => {
      const x: { app: string; version: string } = request.params as any;
      const hasApp = render.hasApp(x.app, x.version);
      if (!hasApp) {
        reply.status(404);
        return reply.send({ status: "NotFound" });
      }
      const file = render.getApp(x.app, x.version);
      reply.type(file.type);
      const ssg = HtmlParser.SSG(file.content, {
        params: request.params as never,
        headers: request.headers as never,
      });
      return reply.send(ssg);
    };

    server.get("/libs/*", (request, reply): any => {
      const file = render.hasFile(request.url);
      if (file === false) {
        return reply.status(500);
      }
      const x = render.getFile(request.url);
      reply.status(200);
      reply.type(x.type);
      return reply.send(x.content);
    });

    server.get("/:app/:version", getApp);
    server.get("/:app", getApp);

    server.get("/:app/:version/*", (request, reply): any => {
      const hasFile = render.hasFile(request.url);
      if (!hasFile) {
        reply.status(404);
        return reply.send({ status: "NotFound" });
      }
      const file = render.getFile(request.url);
      if (request.url.endsWith(".css")) {
        reply.type("text/css");
      } else if (request.url.endsWith(".js")) {
        reply.type("text/javascript");
      } else {
        reply.type(file.type);
      }
      return reply.send(file.content);
    });

    server.listen(3000, (err, address) => {
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
