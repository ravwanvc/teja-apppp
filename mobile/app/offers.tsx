import { useEffect, useState } from "react";
import { Image, Text, View } from "react-native";
import { Link, router } from "expo-router";
import * as Location from "expo-location";
import MapView, { Marker } from "react-native-maps";
import { api, imageUrl } from "../src/api";
import { Screen, Button, Field, Message, styles } from "../src/ui";
import type { Product } from "../../packages/shared";
type Page = { products: Product[]; page: number; pages: number };
export default function Offers() {
  const [data, D] = useState<Page>({ products: [], page: 1, pages: 1 }),
    [query, Q] = useState(""),
    [page, P] = useState(1),
    [map, M] = useState(false),
    [msg, E] = useState(""),
    [near, N] = useState<{ latitude: number; longitude: number } | null>(null),
    [favorites, F] = useState<string[]>([]),
    [only, O] = useState(false);
  async function load() {
    try {
      D(
        await api<Page>(
          "/api/products?" +
            new URLSearchParams({ q: query, page: String(page) }),
        ),
      );
      E("");
    } catch (e) {
      E(String(e));
    }
  }
  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [query, page]);
  async function locate() {
    try {
      const p = await Location.requestForegroundPermissionsAsync();
      if (!p.granted)
        throw Error("Joylashuv ruxsati kerak / Разрешите геолокацию");
      const l = await Location.getCurrentPositionAsync({});
      N(l.coords);
      M(true);
    } catch (e) {
      E(String(e));
    }
  }
  const products = data.products
    .filter((p) => !only || favorites.includes(p.id))
    .sort((a, b) =>
      near
        ? Math.hypot(a.lat - near.latitude, a.lng - near.longitude) -
          Math.hypot(b.lat - near.latitude, b.lng - near.longitude)
        : 0,
    );
  return (
    <Screen title="Takliflar / Предложения">
      <Field
        label="Qidirish / Поиск"
        value={query}
        onChange={(s) => {
          Q(s);
          P(1);
        }}
      />
      <Button title="Yaqinimdagilar / Рядом" onPress={locate} />
      <Button
        title={map ? "Ro‘yxat / Список" : "Xarita / Карта"}
        onPress={() => M(!map)}
      />
      <Button
        title="Sevimlilar / Избранное"
        onPress={async () => {
          try {
            const d = await api<{ favorites: string[] }>("/api/data");
            F(d.favorites);
            O(!only);
          } catch (e) {
            E(String(e));
          }
        }}
      />
      {map ? (
        <MapView
          style={{ height: 360 }}
          initialRegion={{
            latitude: near?.latitude || 41.3111,
            longitude: near?.longitude || 69.2797,
            latitudeDelta: 0.12,
            longitudeDelta: 0.12,
          }}
        >
          {products.map((p) => (
            <Marker
              key={p.id}
              coordinate={{ latitude: p.lat, longitude: p.lng }}
              title={p.title}
              description={p.price + " UZS"}
              onCalloutPress={() =>
                router.push({ pathname: "/product", params: { id: p.id } })
              }
            />
          ))}
        </MapView>
      ) : (
        products.map((p) => (
          <View key={p.id} style={styles.card}>
            <Image source={{ uri: imageUrl(p.image) }} style={styles.photo} />
            <Link href={{ pathname: "/product", params: { id: p.id } }}>
              {p.title}
            </Link>
            <Text>
              {p.shop} · {p.price} UZS
            </Text>
            <Button
              title="♡"
              onPress={async () => {
                try {
                  const saved = !favorites.includes(p.id);
                  await api("/api/data", {
                    action: "favorite",
                    id: p.id,
                    saved,
                  });
                  F(
                    saved
                      ? [...favorites, p.id]
                      : favorites.filter((x) => x !== p.id),
                  );
                } catch (e) {
                  E(String(e));
                }
              }}
            />
          </View>
        ))
      )}
      {!products.length && <Text>Taklif topilmadi / Нет предложений</Text>}
      <Text>
        {page}/{data.pages || 1}
      </Text>
      <Button title="←" disabled={page === 1} onPress={() => P(page - 1)} />
      <Button
        title="→"
        disabled={page >= data.pages}
        onPress={() => P(page + 1)}
      />
      <Button title="Qayta urinish / Повторить" onPress={load} />
      <Message text={msg} />
    </Screen>
  );
}
