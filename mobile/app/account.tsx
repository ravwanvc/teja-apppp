import { useState } from "react";
import { Alert, Linking, Share, Appearance } from "react-native";
import { router } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { api, base, clearSession } from "../src/api";
import { Screen, Button, Message } from "../src/ui";
export default function Account() {
  const [msg, M] = useState("");
  async function remove() {
    try {
      await api("/api/account", { confirm: "DELETE" });
      await clearSession();
      router.replace("/auth");
    } catch (e) {
      M(String(e));
    }
  }
  return (
    <Screen title="Hisobim / Аккаунт">
      <Button
        title="O‘zbek / Русский"
        onPress={async () => {
          const old = await SecureStore.getItemAsync("teja-lang");
          await SecureStore.setItemAsync(
            "teja-lang",
            old === "ru" ? "uz" : "ru",
          );
          M("Til saqlandi / Язык сохранён");
        }}
      />
      <Button
        title="Mavzu / Тема"
        onPress={async () => {
          const next =
            Appearance.getColorScheme() === "dark" ? "light" : "dark";
          Appearance.setColorScheme(next);
          await SecureStore.setItemAsync("teja-theme", next);
        }}
      />
      <Button
        title="Eksport JSON / Экспорт JSON"
        onPress={async () => {
          try {
            await Share.share({
              message: JSON.stringify(await api("/api/account"), null, 2),
            });
          } catch (e) {
            M(String(e));
          }
        }}
      />
      {["privacy", "offer", "terms", "refunds", "help", "how", "faq"].map(
        (slug) => (
          <Button
            key={slug}
            title={slug}
            onPress={() => {
              void Linking.openURL(base + "/legal/" + slug);
            }}
          />
        ),
      )}
      <Button
        title="Hisobni o‘chirish / Удалить аккаунт"
        onPress={() =>
          Alert.alert(
            "Hisob o‘chirilsinmi? / Удалить аккаунт?",
            "Faol buyurtmalar tugashi kerak / Завершите активные заказы",
            [
              { text: "Bekor / Отмена", style: "cancel" },
              {
                text: "O‘chirish / Удалить",
                style: "destructive",
                onPress: remove,
              },
            ],
          )
        }
      />
      <Button
        title="Chiqish / Выход"
        onPress={async () => {
          try {
            await api("/api/auth", { action: "logout" });
            await clearSession();
            router.replace("/auth");
          } catch (e) {
            M(String(e));
          }
        }}
      />
      <Message text={msg} />
    </Screen>
  );
}
