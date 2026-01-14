import pino from 'pino';
import { config } from './env.js';

/**
 * Pino logger configuration
 */
export const logger = pino({
  level: config.logLevel,
  ...(config.logPretty
    ? {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss Z',
            ignore: 'pid,hostname',
          },
        },
      }
    : {}),
  serializers: {
    req: (req) => ({
      method: req.method,
      url: req.url,
      headers: {
        host: req.headers.host,
        'user-agent': req.headers['user-agent'],
      },
      remoteAddress: req.ip,
    }),
    res: (res) => ({
      statusCode: res.statusCode,
    }),
    err: pino.stdSerializers.err,
  },
});
