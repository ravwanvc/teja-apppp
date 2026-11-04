import type { ExpoConfig } from "expo/config";
const config: ExpoConfig = {
  name: "TEJA",
  slug: "teja",
  scheme: "teja",
  version: "0.1.0",
  orientation: "portrait",
  userInterfaceStyle: "automatic",
  icon: "./assets/icon.png",
  ios: {
    bundleIdentifier: "uz.teja.app",
    buildNumber: "1",
    supportsTablet: true,
    config: { usesNonExemptEncryption: false },
  },
  android: {
    package: "uz.teja.app",
    versionCode: 1,
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#174d38",
    },
    blockedPermissions: ["android.permission.RECORD_AUDIO"],
  },
  plugins: [
    "expo-router",
    "expo-secure-store",
    [
      "expo-splash-screen",
      {
        image: "./assets/splash.png",
        backgroundColor: "#174d38",
        imageWidth: 200,
      },
    ],
    [
      "expo-location",
      {
        locationWhenInUsePermission:
          "Yaqin takliflarni ko‘rsatish / Показывать предложения рядом",
      },
    ],
    [
      "expo-image-picker",
      {
        photosPermission: "Mahsulot rasmini tanlash / Выбрать фото товара",
        cameraPermission: "Mahsulotni suratga olish / Сфотографировать товар",
        microphonePermission: false,
      },
    ],
    [
      "expo-camera",
      {
        cameraPermission:
          "Topshirish QR kodini skanerlash / Сканировать QR-код получения",
        recordAudioAndroid: false,
      },
    ],
    "expo-notifications",
  ],
  extra: { apiUrl: process.env.EXPO_PUBLIC_API_URL || "http://localhost:5173" },
};
export default config;
