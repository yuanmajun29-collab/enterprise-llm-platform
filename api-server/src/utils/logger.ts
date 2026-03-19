import winston from 'winston';

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  defaultMeta: { service: 'enterprise-llm-platform-api' },
  transports: [
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      maxsize: 52428800, // 50MB
      maxFiles: 3,
    }),
    new winston.transports.File({
      filename: 'logs/combined.log',
      maxsize: 52428800,
      maxFiles: 3,
    }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),
  ],
});

export class RequestLogger {
  private static log(level: string, message: string, meta?: any) {
    if (meta) {
      logger.log(level, message, meta);
    } else {
      logger.log(level, message);
    }
  }

  static info(message: string, meta?: any) {
    this.log('info', message, meta);
  }

  static error(message: string, meta?: any) {
    this.log('error', message, meta);
  }

  static warn(message: string, meta?: any) {
    this.log('warn', message, meta);
  }

  static debug(message: string, meta?: any) {
    this.log('debug', message, meta);
  }
}
