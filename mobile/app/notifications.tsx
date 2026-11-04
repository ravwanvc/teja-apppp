import * as LocalNotifications from "expo-notifications";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { api } from "../src/api";
import { Screen, Button, Message } from "../src/ui";
type Notification = {
  id: string;
  kind: string;
  created: number;
  read_at: number | null;
};
export default function Notifications() {
  const [items, I] = useState<Notification[]>([]),
    [msg, M] = useState("");
  async function load() {
    try {
      const d = await api<{ notifications: Notification[] }>(
        "/api/notifications",
      );
      I(d.notifications);
    } catch (e) {
      M(String(e));
    }
  }
  useEffect(() => {
    load();
  }, []);
  return (
    <Screen title="Bildirishnomalar / Уведомления">
      <Text>Mock push · FCM/APNs ulanmagan / не подключены</Text>
      <Button title="Yangilash / Обновить" onPress={load} />
      <Button
        title="Sinov push / Тестовое уведомление"
        onPress={async () => {
          try {
            const permission =
              await LocalNotifications.requestPermissionsAsync();
            if (permission.status !== "granted")
              throw Error("Ruxsat berilmadi / Нет разрешения");
            await LocalNotifications.scheduleNotificationAsync({
              content: {
                title: "TEJA — SINOV / ТЕСТ",
                body: "Ilova ichidagi sinov bildirishnomasi / Локальное тестовое уведомление",
              },
              trigger: null,
            });
          } catch (e) {
            M(String(e));
          }
        }}
      />
      {items.map((n) => (
        <View key={n.id}>
          <Text>
            {n.read_at ? "" : "● "}
            {n.kind} · {new Date(n.created).toLocaleString()}
          </Text>
          <Button
            title="O‘qildi / Прочитано"
            onPress={async () => {
              await api("/api/notifications", { id: n.id });
              load();
            }}
          />
        </View>
      ))}
      {!items.length && <Text>Hozircha yo‘q / Пока пусто</Text>}
      <Message text={msg} />
    </Screen>
  );
}
