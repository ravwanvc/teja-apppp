import { base } from "./api";
import React from "react";
import {
  ScrollView,
  Text,
  Pressable,
  TextInput,
  StyleSheet,
  useColorScheme,
  View,
} from "react-native";
import { Link } from "expo-router";
export function Screen({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const dark = useColorScheme() === "dark";
  const [mock, Mock] = React.useState(false);
  React.useEffect(() => {
    let active = true;
    fetch(base + "/api/payments")
      .then((r) => r.json())
      .then((d) => {
        if (active) Mock(!!d.demo);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: dark ? "#14251e" : "#f5f5ed" }}
      contentContainerStyle={{ padding: 22, gap: 16, paddingBottom: 70 }}
      keyboardShouldPersistTaps="handled"
    >
      <Link
        href="/"
        style={{ color: dark ? "#d5e6b3" : "#174d38", fontSize: 23 }}
      >
        teja.
      </Link>
      <Text
        accessibilityRole="header"
        style={{
          fontSize: 28,
          fontWeight: "700",
          color: dark ? "#fff" : "#174d38",
        }}
      >
        {title}
      </Text>
      <View style={styles.panel}>
        {mock && (
          <Text
            style={{
              backgroundColor: "#edf5cd",
              padding: 10,
              color: "#174d38",
            }}
          >
            SINOV — pul olinmagan / ТЕСТ — деньги не списаны
          </Text>
        )}
        {children}
      </View>
    </ScrollView>
  );
}
export function Button({
  title,
  onPress,
  disabled = false,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, { opacity: disabled ? 0.5 : 1 }]}
    >
      <Text style={{ color: "#fff", fontWeight: "600" }}>{title}</Text>
    </Pressable>
  );
}
export function Field({
  label,
  value,
  onChange,
  secret = false,
  numeric = false,
}: {
  label: string;
  value: string;
  onChange: (s: string) => void;
  secret?: boolean;
  numeric?: boolean;
}) {
  return (
    <View style={{ gap: 4 }}>
      <Text>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        secureTextEntry={secret}
        keyboardType={numeric ? "number-pad" : "default"}
        autoCapitalize="none"
        style={styles.input}
      />
    </View>
  );
}
export function Message({ text }: { text: string }) {
  return text ? (
    <Text accessibilityRole="alert" style={{ padding: 10, color: "#803322" }}>
      {text}
    </Text>
  ) : null;
}
export const styles = StyleSheet.create({
  panel: { gap: 14, backgroundColor: "#fff", padding: 16, borderRadius: 16 },
  button: {
    backgroundColor: "#174d38",
    padding: 15,
    borderRadius: 10,
    alignItems: "center",
  },
  input: {
    borderColor: "#88988d",
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    color: "#14251e",
    backgroundColor: "#fff",
  },
  photo: { height: 210, width: "100%", borderRadius: 12 },
  card: {
    gap: 8,
    borderColor: "#ddd",
    borderWidth: 1,
    padding: 12,
    borderRadius: 12,
  },
});
