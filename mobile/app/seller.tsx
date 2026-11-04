import { useEffect, useState } from "react";
import { Image, Text, View, Linking } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { CameraView, useCameraPermissions } from "expo-camera";
import { randomUUID } from "expo-crypto";
import MapView, { Marker } from "react-native-maps";
import { api, imageUrl } from "../src/api";
import { Screen, Button, Field, Message, styles } from "../src/ui";
import type { Product, Order } from "../../packages/shared";
export default function Seller() {
  const [products, P] = useState<Product[]>([]),
    [orders, O] = useState<Order[]>([]),
    [report, R] = useState(""),
    [form, F] = useState({
      title: "",
      shop: "",
      price: "",
      original: "",
      stock: "1",
      address: "",
      allergens: "",
      storage: "",
      city: "Toshkent",
    }),
    [point, G] = useState({ latitude: 41.3111, longitude: 69.2797 }),
    [images, I] = useState<string[]>([]),
    [msg, M] = useState(""),
    [busy, B] = useState(false),
    [code, C] = useState(""),
    [scan, S] = useState<string | null>(null),
    [permission, requestPermission] = useCameraPermissions();
  async function load() {
    try {
      const d = await api<{
        products: Product[];
        orders: Order[];
        report: unknown;
        me: { id: string; role: string };
      }>("/api/data");
      if (d.me.role !== "seller")
        throw Error("Sotuvchi hisobi kerak / Нужен аккаунт продавца");
      P(d.products.filter((p) => p.owner === d.me.id));
      O(d.orders.filter((o) => o.owner === d.me.id));
      R(JSON.stringify(d.report));
    } catch (e) {
      M(String(e));
    }
  }
  useEffect(() => {
    load();
  }, []);
  async function photo(camera = false) {
    B(true);
    try {
      if (images.length === 3) throw Error("3 tagacha / До 3 фото");
      const permission = camera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted)
        throw Error("Ruxsat kerak / Требуется разрешение");
      const result = camera
        ? await ImagePicker.launchCameraAsync({ quality: 0.7 })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ["images"],
            quality: 0.7,
          });
      if (result.canceled) return;
      const a = result.assets[0],
        body = new FormData();
      body.append("file", {
        uri: a.uri,
        name: "product.jpg",
        type: a.mimeType || "image/jpeg",
      } as unknown as Blob);
      const d = await api<{ url: string }>("/api/image", body);
      I([...images, d.url]);
    } catch (e) {
      M(String(e));
    } finally {
      B(false);
    }
  }
  async function act(body: unknown) {
    B(true);
    try {
      await api("/api/data", body);
      M("Saqlandi / Сохранено");
      await load();
    } catch (e) {
      M(String(e));
    } finally {
      B(false);
    }
  }
  return (
    <Screen title="Sotuvchi / Продавец">
      <Button title="Yangilash / Обновить" onPress={load} />
      <Text>{report}</Text>
      {Object.entries(form).map(([key, value]) => (
        <Field
          key={key}
          label={key}
          value={value}
          onChange={(value) => F({ ...form, [key]: value })}
        />
      ))}
      <Button
        title="Kamera / Камера"
        disabled={busy}
        onPress={() => photo(true)}
      />
      <Button
        title="Galereya / Галерея"
        disabled={busy}
        onPress={() => photo()}
      />
      {images.map((src) => (
        <Image key={src} source={{ uri: imageUrl(src) }} style={styles.photo} />
      ))}
      <MapView
        style={{ height: 240 }}
        initialRegion={{ ...point, latitudeDelta: 0.1, longitudeDelta: 0.1 }}
        onPress={(e) => G(e.nativeEvent.coordinate)}
      >
        <Marker coordinate={point} />
      </MapView>
      <Button
        title="Joylashuvim / Моё местоположение"
        onPress={async () => {
          try {
            if (!(await Location.requestForegroundPermissionsAsync()).granted)
              throw Error("Ruxsat kerak");
            G((await Location.getCurrentPositionAsync({})).coords);
          } catch (e) {
            M(String(e));
          }
        }}
      />
      <Button
        title="24 soatga joylash / Опубликовать на 24 часа"
        disabled={busy || !images.length}
        onPress={() =>
          act({
            action: "create",
            requestId: randomUUID(),
            product: {
              ...form,
              price: Number(form.price),
              original: Number(form.original),
              stock: Number(form.stock),
              image: images[0],
              images,
              lat: point.latitude,
              lng: point.longitude,
              until: Date.now() + 86400000,
              category: "Boshqa",
            },
          })
        }
      />
      {products.map((p) => (
        <View key={p.id} style={styles.card}>
          <Text>
            {p.title} · {p.stock}
          </Text>
          <Button
            title="Qoldiq +1 / Остаток +1"
            onPress={() =>
              act({
                action: "restock",
                id: p.id,
                qty: 1,
                requestId: randomUUID(),
              })
            }
          />
          <Button
            title="Nusxa / Копировать"
            onPress={() => {
              F({
                title: p.title,
                shop: p.shop,
                price: String(p.price),
                original: String(p.original),
                stock: "1",
                address: p.address,
                allergens: p.allergens,
                storage: p.storage,
                city: p.city,
              });
              I([p.image]);
              G({ latitude: p.lat, longitude: p.lng });
            }}
          />
          <Button
            title="Yoqish / O‘chirish · Видимость"
            onPress={() => act({ action: "toggle", id: p.id })}
          />
        </View>
      ))}
      <Field
        label="Topshirish kodi / Код получения"
        value={code}
        onChange={C}
      />
      {orders.map((o) => (
        <View key={o.id} style={styles.card}>
          <Text>
            {o.title} · {o.status}
          </Text>
          {o.buyerPhone && (
            <Button
              title={o.buyerPhone}
              onPress={() => {
                void Linking.openURL("tel:" + o.buyerPhone);
              }}
            />
          )}
          {o.status === "reserved" && (
            <>
              <Button
                title="Topshirish / Выдать"
                onPress={() => act({ action: "collect", id: o.id, code })}
              />
              <Button
                title="QR skaner / Сканер QR"
                onPress={async () => {
                  if (
                    permission?.granted ||
                    (await requestPermission()).granted
                  )
                    S(o.id);
                }}
              />
              <Button
                title="Bekor qilish / Отменить"
                onPress={() => act({ action: "cancel", id: o.id })}
              />
            </>
          )}
        </View>
      ))}
      {scan && (
        <>
          <CameraView
            style={{ height: 300 }}
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onBarcodeScanned={({ data }) => {
              C(data);
              S(null);
              M("Kod olindi. Topshirishni tasdiqlang / Подтвердите выдачу");
            }}
          />
          <Button title="Yopish / Закрыть" onPress={() => S(null)} />
        </>
      )}
      <Message text={msg} />
    </Screen>
  );
}
