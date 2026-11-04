import { useState } from "react";
import { Text } from "react-native";
import { router } from "expo-router";
import { api, saveSession } from "../src/api";
import { Screen, Button, Field, Message } from "../src/ui";
import type { Session } from "../../packages/shared";
export default function Auth() {
  const [phone, P] = useState("+998"),
    [name, N] = useState(""),
    [password, W] = useState(""),
    [code, C] = useState(""),
    [action, A] = useState("otpLogin"),
    [role, R] = useState("member"),
    [msg, M] = useState(""),
    [mock, K] = useState(""),
    [busy, B] = useState(false);
  async function run(send = false) {
    B(true);
    M("");
    try {
      if (send) {
        const d = await api<{ mockCode?: string }>("/api/phone", {
          action: "send",
          phone,
          purpose:
            action === "register"
              ? "register"
              : action === "reset"
                ? "reset"
                : "login",
        });
        K(d.mockCode || "");
      } else {
        const s = await api<Session>("/api/auth", {
          action,
          phone,
          password,
          name,
          code,
          role,
        });
        await saveSession(s);
        router.replace("/offers");
      }
    } catch (e) {
      M(String(e instanceof Error ? e.message : e));
    } finally {
      B(false);
    }
  }
  return (
    <Screen title="Kirish / Вход">
      {["otpLogin", "login", "register", "reset"].map((a) => (
        <Button
          key={a}
          title={
            {
              otpLogin: "SMS",
              login: "Parol + SMS / Пароль + SMS",
              register: "Ro‘yxatdan o‘tish / Регистрация",
              reset: "Parolni tiklash / Сброс пароля",
            }[a] || a
          }
          onPress={() => A(a)}
        />
      ))}
      <Field label="Telefon / Телефон" value={phone} onChange={P} />
      {action === "register" && (
        <>
          <Field label="Ism / Имя" value={name} onChange={N} />
          <Button
            title={
              role === "member" ? "Xaridor / Покупатель" : "Sotuvchi / Продавец"
            }
            onPress={() => R(role === "member" ? "seller" : "member")}
          />
        </>
      )}
      {action !== "otpLogin" && (
        <Field label="Parol / Пароль" value={password} onChange={W} secret />
      )}
      <Button
        title="SMS yuborish / Отправить SMS"
        disabled={busy}
        onPress={() => run(true)}
      />
      {mock && <Text>SINOV SMS / ТЕСТ SMS: {mock} (123456)</Text>}
      <Field label="SMS kodi / Код SMS" value={code} onChange={C} numeric />
      <Button
        title="Tasdiqlash / Подтвердить"
        disabled={busy}
        onPress={() => run()}
      />
      <Message text={msg} />
    </Screen>
  );
}
