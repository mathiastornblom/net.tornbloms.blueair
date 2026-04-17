import { getLogBuffer, clearLogBuffer } from './lib/diagnostics';

module.exports = {
  async getLogs() {
    return getLogBuffer();
  },

  async clearLogs() {
    clearLogBuffer();
    return { ok: true };
  },
};
