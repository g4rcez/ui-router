import axios, { AxiosRequestConfig } from "axios";
import { Strings } from "../lib/strings";
import { Request, Response } from "../server.types";

export namespace Proxy {
  type ProxyOptions = {
    host: string;
    route: string;
    protocol?: "https" | "http";
    interceptRequest?: (req: Request, proxyTransform: string) => Request;
  };

  export type Config = {
    register: string;
    handler: (req: Request, res: Response) => Promise<any>;
  };

  const defaultInterceptor = (req: Request) => req;

  export const Create = (params: ProxyOptions): Config => {
    const base = Strings.removeTrailingPath(params.route).replace(/\*/g, "");
    const protocol = params.protocol ?? "https";
    const requestInterceptor = params.interceptRequest ?? defaultInterceptor;
    return {
      register: Strings.removeTrailingPath(params.route) + "*",
      handler: async (serverRequest: Request, res: Response) => {
        const proxyPath = serverRequest.url.replace(new RegExp(base, ""), "");
        const req = requestInterceptor(serverRequest, proxyPath);
        const url = protocol + "://" + Strings.joinUrl(params.host, proxyPath);
        try {
          const apiResponse = await axios(<AxiosRequestConfig>{
            method: req.method.toLowerCase(),
            params: req.query,
            headers: req.headers,
            body: req.body,
            url,
          });
          res.headers(apiResponse.headers);
          res.status(apiResponse.status);
          res.type(apiResponse.headers["content-type"]);
          return res.send(apiResponse.data);
        } catch (error) {
          throw error;
        }
      },
    };
  };
}
