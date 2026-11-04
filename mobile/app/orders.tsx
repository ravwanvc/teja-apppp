import { useEffect, useState } from "react";
import { Text, View, Linking, Share } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { api } from "../src/api";
import { Screen, Button, Message, styles } from "../src/ui";
import type { Order } from "../../packages/shared";
export default function Orders() {
  const [orders, O] = useState<Order[]>([]),
    [msg, M] = useState("");
  async function load() {
    try {
      const d = await api<{ orders: Order[]; me: { id: string } }>("/api/data");
      O(d.orders.filter((o) => o.buyer === d.me.id));
      M("");
    } catch (e) {
      M(String(e));
    }
  }
  useEffect(() => {
    load();
  }, []);
  async function act(body: unknown) {
    try {
      await api("/api/data", body);
      await load();
    } catch (e) {
      M(String(e));
    }
  }
  return (
    <Screen title="Buyurtmalar / Заказы">
      <Button title="Yangilash / Обновить" onPress={load} />
      {orders.map((o) => (
        <View key={o.id} style={styles.card}>
          <Text>
            {o.title} · {o.qty}
          </Text>
          <Text>
            {o.status} · {o.payment_state}
          </Text>
          {!!o.is_mock && (
            <Text>SINOV — pul olinmagan / ТЕСТ — деньги не списаны</Text>
          )}
          <Text>
            Chek / Чек #{o.receipt_no || "—"} · 10% {o.deposit} UZS · 90%{" "}
            {o.price * o.qty - o.deposit} UZS
          </Text>
          {o.code && o.status === "reserved" && (
            <>
              <Text selectable>{o.code}</Text>
              <QRCode value={o.code} size={180} />
            </>
          )}
          <Text>
            {o.pickup_at ? new Date(o.pickup_at).toLocaleString() : ""}
          </Text>
          {o.status === "reserved" &&
            !o.pickup_selected &&
            [5, 15, 30, 60].map((minutes) => (
              <Button
                key={minutes}
                title={minutes + " daqiqa / минут"}
                disabled={
                  Date.now() + minutes * 60000 >
                  Math.min(o.until, o.paid_at + 7200000)
                }
                onPress={() =>
                  act({
                    action: "schedule",
                    id: o.id,
                    pickupAt: Date.now() + minutes * 60000,
                  })
                }
              />
            ))}
          <Button
            title="Yo‘nalish / Маршрут"
            onPress={() => {
              void Linking.openURL(
                "https://www.google.com/maps/dir/?api=1&destination=" +
                  o.lat +
                  "," +
                  o.lng,
              );
            }}
          />
          <Button
            title="Chekni ulashish / Поделиться чеком"
            onPress={() => {
              void Share.share({
                message: `TEJA ${o.is_mock ? "SINOV / ТЕСТ" : ""}\n#${o.receipt_no}\n${o.title} × ${o.qty}\n10% ${o.deposit} UZS\n90% ${o.price * o.qty - o.deposit} UZS`,
              });
            }}
          />
          {["reserved", "pending_payment"].includes(o.status) && (
            <Button
              title="Bekor qilish / Отменить"
              onPress={() => act({ action: "cancel", id: o.id })}
            />
          )}{" "}
          {o.status === "collected" && (
            <Button
              title="★ 5 · Baho / Отзыв"
              onPress={() =>
                act({
                  action: "review",
                  id: o.id,
                  rating: 5,
                  comment: "Rahmat / Спасибо",
                })
              }
            />
          )}
        </View>
      ))}
      {!orders.length && <Text>Hozircha yo‘q / Пока пусто</Text>}
      <Message text={msg} />
    </Screen>
  );
}
