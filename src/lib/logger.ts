type LogLevel = 'info' | 'warn' | 'error';

function emit(level: LogLevel, message: string, fields?: Record<string, unknown>): void {
  const entry = { timestamp: new Date().toISOString(), level, message, ...fields };
  const json = JSON.stringify(entry);
  if (level === 'error') console.error(json);
  else if (level === 'warn') console.warn(json);
  else console.log(json);
}

export const logger = {
  info: (msg: string, fields?: Record<string, unknown>) => emit('info', msg, fields),
  warn: (msg: string, fields?: Record<string, unknown>) => emit('warn', msg, fields),
  error: (msg: string, fields?: Record<string, unknown>) => emit('error', msg, fields),
};
