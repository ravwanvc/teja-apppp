import { Link } from "expo-router";
import { Text } from "react-native";
import { Screen } from "../src/ui";
export default function Home() {
  return (
    <Screen title="TEJA">
      <Text>Mahallangizdan tejamkor xarid / Выгодные покупки рядом</Text>
      {[
        ["/onboarding", "Boshlash / Начать"],
        ["/auth", "Kirish / Вход"],
        ["/offers", "Takliflar / Предложения"],
        ["/orders", "Buyurtmalar / Заказы"],
        ["/seller", "Sotuvchi / Продавец"],
        ["/notifications", "Bildirishnomalar / Уведомления"],
        ["/account", "Hisobim / Аккаунт"],
      ].map(([href, title]) => (
        <Link
          key={href}
          href={href as "/auth"}
          style={{ fontSize: 20, padding: 12 }}
        >
          {title}
        </Link>
      ))}
    </Screen>
  );
}
