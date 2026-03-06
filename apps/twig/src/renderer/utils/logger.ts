import log from "electron-log/renderer";

log.transports.console.level = "debug";

export const logger = log;
