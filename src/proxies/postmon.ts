import { Proxy } from ".";

export const PostmonProxy = Proxy.Create({
  host: "api.postmon.com.br",
  route: "/api/postmon",
  interceptRequest: (req) => {
    req.headers.host = "";
    return req;
  },
});
