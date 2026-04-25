import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

const LOG_FILE_PATH = FileSystem.documentDirectory + "autopark_debug.log";
const MAX_LOG_SIZE_BYTES = 1024 * 1024 * 5; // 5 MB

class Logger {
  private formatMessage(level: string, message: string, data?: any): string {
    const timestamp = new Date().toISOString();
    let msg = `[${timestamp}] [${level}] ${message}`;
    if (data !== undefined) {
      msg += ` | Data: ${JSON.stringify(data)}`;
    }
    return msg + "\n";
  }

  private isWriting = false;
  private queue: string[] = [];
  private readonly flushBatchSize = 32;

  private appendToFile(logLine: string) {
    this.queue.push(logLine);
    void this.processQueue();
  }

  private async processQueue() {
    if (this.isWriting || this.queue.length === 0) return;
    this.isWriting = true;

    while (this.queue.length > 0) {
      const batch = this.queue.splice(0, this.flushBatchSize);
      const payload = batch.join("");
      if (!payload) continue;

      try {
        const info = await FileSystem.getInfoAsync(LOG_FILE_PATH);
        if (!info.exists) {
          await FileSystem.writeAsStringAsync(LOG_FILE_PATH, payload, {
            encoding: "utf8",
          });
        } else {
          if (info.size + payload.length > MAX_LOG_SIZE_BYTES) {
            await FileSystem.writeAsStringAsync(
              LOG_FILE_PATH,
              "=== Log Rotated ===\n" + payload,
              { encoding: "utf8" }
            );
          } else {
            await FileSystem.writeAsStringAsync(
              LOG_FILE_PATH,
              payload,
              { encoding: "utf8", append: true }
            );
          }
        }
      } catch (e) {
        console.error("[BackgroundLogger] Failed to write to log file", e);
      }
    }

    this.isWriting = false;
  }

  public log(message: string, data?: any) {
    console.log(message, data);
    this.appendToFile(this.formatMessage("LOG", message, data));
  }

  public info(message: string, data?: any) {
    console.info(message, data);
    this.appendToFile(this.formatMessage("INFO", message, data));
  }

  public warn(message: string, data?: any) {
    console.warn(message, data);
    this.appendToFile(this.formatMessage("WARN", message, data));
  }

  public error(message: string, data?: any) {
    console.error(message, data);
    this.appendToFile(this.formatMessage("ERROR", message, data));
  }

  public async exportLogs() {
    try {
      const info = await FileSystem.getInfoAsync(LOG_FILE_PATH);
      if (!info.exists) {
        alert("No logs found yet.");
        return;
      }
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(LOG_FILE_PATH, { dialogTitle: "Export Auto-Park Logs" });
      } else {
        alert("Sharing not available on this device.");
      }
    } catch (e) {
      console.error("[BackgroundLogger] Share failed", e);
      alert("Failed to export logs.");
    }
  }

  public async clearLogs() {
    try {
      const info = await FileSystem.getInfoAsync(LOG_FILE_PATH);
      if (info.exists) {
        await FileSystem.deleteAsync(LOG_FILE_PATH);
        alert("Logs cleared.");
      } else {
        alert("No logs to clear.");
      }
    } catch (e) {
      console.error("[BackgroundLogger] Clear failed", e);
    }
  }
}

export const BackgroundLogger = new Logger();
