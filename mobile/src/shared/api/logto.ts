import { LogtoConfig } from "@logto/rn";
import Constants from "expo-constants";

export const logtoConfig: LogtoConfig = {
  endpoint: process.env.EXPO_PUBLIC_LOGTO_ENDPOINT || "https://scarletspots.duckdns.org",
  appId: process.env.EXPO_PUBLIC_LOGTO_APP_ID || "mobile-native-app",
};
