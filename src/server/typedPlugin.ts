import fastifyPlugin from 'fastify-plugin';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { FastifyPluginOptions } from 'fastify';

export default function typedPlugin(
  plugin: FastifyPluginAsyncZod,
  opts?: FastifyPluginOptions & { name?: string },
) {
  return fastifyPlugin(plugin as any, opts);
}
