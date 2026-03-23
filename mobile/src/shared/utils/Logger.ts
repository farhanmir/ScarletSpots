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

  private async appendToFile(logLine: string) {
    try {
      const info = await FileSystem.getInfoAsync(LOG_FILE_PATH);
      if (!info.exists) {
        await FileSystem.writeAsStringAsync(LOG_FILE_PATH, logLine, {
          encoding: 'utf8',
        });
      } else {
        if (info.size > MAX_LOG_SIZE_BYTES) {
          // If file gets too big, clear it or rotate. For simplicity, clear and start fresh.
          await FileSystem.writeAsStringAsync(LOG_FILE_PATH, "=== Log Rotated ===\n" + logLine, {
            encoding: 'utf8',
          });
        } else {
          // Append to existing file
          const currentContent = await FileSystem.readAsStringAsync(LOG_FILE_PATH, {
            encoding: 'utf8',
          });
          await FileSystem.writeAsStringAsync(LOG_FILE_PATH, currentContent + logLine, {
            encoding: 'utf8',
          });
        }
      }
    } catch (e) {
      console.error("[BackgroundLogger] Failed to write to log file", e);
    }
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
