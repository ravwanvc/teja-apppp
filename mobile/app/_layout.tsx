import { useEffect } from "react";
import { Appearance } from "react-native";
import * as SecureStore from "expo-secure-store";
import { Stack } from "expo-router";
export default function Layout() {
  useEffect(() => {
    SecureStore.getItemAsync("teja-theme")
      .then((v) => {
        if (v === "dark" || v === "light") Appearance.setColorScheme(v);
      })
      .catch(() => {});
  }, []);
  return <Stack screenOptions={{ headerShown: false }} />;
}
