import { useState } from "react";
import { Text } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { api } from "../src/api";
import { Screen, Button, Message } from "../src/ui";
export default function Gateway() {
  const { id } = useLocalSearchParams<{ id: string }>(),
    [busy, B] = useState(false),
    [msg, M] = useState("");
  async function pay(outcome: string) {
    B(true);
    try {
      await api("/api/payments/mock", { id, outcome });
      router.replace("/orders");
    } catch (e) {
      M(String(e));
    } finally {
      B(false);
    }
  }
  return (
    <Screen title="SINOV / ТЕСТ">
      <Text>Pul olinmagan / Деньги не списаны</Text>
      {["pay", "reject", "expire"].map((v, i) => (
        <Button
          key={v}
          title={
            [
              "To‘lash / Оплатить",
              "Rad etish / Отказ",
              "Muddati tugadi / Истёк срок",
            ][i]
          }
          disabled={busy}
          onPress={() => pay(v)}
        />
      ))}
      <Message text={msg} />
    </Screen>
  );
}
