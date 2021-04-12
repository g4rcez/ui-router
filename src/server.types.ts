import { FastifyRequest, FastifyReply } from "fastify";
import { RouteGenericInterface } from "fastify/types/route";
import { Server, IncomingMessage, ServerResponse } from "node:http";

export type Request = FastifyRequest<RouteGenericInterface, Server, IncomingMessage>;
export type Response = FastifyReply<Server, IncomingMessage, ServerResponse, RouteGenericInterface, unknown>;
