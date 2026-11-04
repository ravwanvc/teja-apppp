import { useState } from "react";
import { Text } from "react-native";
import { router } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { Screen, Button } from "../src/ui";
const slides = {
  uz: [
    [
      "Yaxshi ovqat, kamroq isrof",
      "Yaqin do‘konlardagi chegirmali mahsulotlarni toping.",
    ],
    [
      "10% hozir, 90% olib ketishda",
      "Telefonni tasdiqlang va buyurtma bering.",
    ],
    [
      "Kod bilan olib keting",
      "Vaqtni tanlang. Do‘konda 8 belgili kodni ko‘rsating.",
    ],
  ],
  ru: [
    ["Хорошая еда, меньше отходов", "Находите продукты со скидкой рядом."],
    ["10% сейчас, 90% при получении", "Подтвердите телефон и оформите заказ."],
    ["Заберите по коду", "Выберите время и покажите 8-значный код в магазине."],
  ],
};
export default function Onboarding() {
  const [lang, L] = useState<"uz" | "ru">("uz"),
    [step, S] = useState(0);
  return (
    <Screen title={slides[lang][step][0]}>
      <Button
        title={lang === "uz" ? "Русский" : "O‘zbek"}
        onPress={() => {
          const next = lang === "uz" ? "ru" : "uz";
          L(next);
          void SecureStore.setItemAsync("teja-lang", next);
        }}
      />
      <Text>{slides[lang][step][1]}</Text>
      <Text>{step + 1}/3</Text>
      <Button
        title={lang === "uz" ? "Davom etish" : "Продолжить"}
        onPress={() => (step < 2 ? S(step + 1) : router.replace("/auth"))}
      />
    </Screen>
  );
}
