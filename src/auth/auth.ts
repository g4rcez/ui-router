import { HookHandlerDoneFunction } from "fastify";
import { Request, Response } from "../server.types";

let AuthRegexp = /^\/(api|app)/;

export namespace Auth {
  export const Middleware = (req: Request, res: Response, done: HookHandlerDoneFunction) => {
    const isAuthRoute = AuthRegexp.test(req.url);
    const isAuthorized = req.cookies.Authorized;
    if (isAuthRoute && isAuthorized !== "ok") {
      res.setCookie("Authorized", "ok");
      return res.send({ authorized: false });
    }
    console.log(req.url);
    done();
  };

  export const onRebuild = (apps: string[]) => {
    AuthRegexp = new RegExp(`^/(api|${apps.join("|")})`);
    console.log({ AuthRegexp });
  };
}
