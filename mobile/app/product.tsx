import { randomUUID } from "expo-crypto";
import { useEffect, useState } from "react";
import { Image, Text, Share, Linking } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { api, imageUrl, base } from "../src/api";
import { Screen, Button, Field, Message, styles } from "../src/ui";
import { splitTotal, type Product } from "../../packages/shared";
export default function ProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>(),
    [product, P] = useState<Product | null>(null),
    [qty, Q] = useState("1"),
    [accept, A] = useState(false),
    [msg, M] = useState(""),
    [busy, B] = useState(false);
  useEffect(() => {
    api<{ product: Product }>("/api/product?id=" + encodeURIComponent(id))
      .then((d) => P(d.product))
      .catch((e) => M(String(e)));
  }, [id]);
  async function checkout(provider: string) {
    if (!product) return;
    B(true);
    try {
      let cardId;
      if (provider === "card") {
        const cards = await api<{ cards: { id: string }[] }>("/api/cards");
        if (!cards.cards.length) {
          await api("/api/cards", {
            action: "add",
            brand: "visa",
            last4: "4242",
            expiry: "12/30",
          });
          const again = await api<{ cards: { id: string }[] }>("/api/cards");
          cardId = again.cards[0].id;
        } else cardId = cards.cards[0].id;
      }
      const d = await api<{ id: string; redirect: string }>("/api/data", {
        action: "checkout",
        id: product.id,
        qty: Number(qty),
        requestId: randomUUID(),
        provider,
        cardId,
        acceptTerms: accept,
      });
      if (d.redirect.startsWith("/mock-payment"))
        router.push({ pathname: "/gateway", params: { id: d.id } });
      else await Linking.openURL(d.redirect);
    } catch (e) {
      M(String(e));
    } finally {
      B(false);
    }
  }
  return (
    <Screen title={product?.title || "Yuklanmoqda / Загрузка"}>
      {product && (
        <>
          {[
            ...new Set([product.image, ...JSON.parse(product.images || "[]")]),
          ].map((src: string) => (
            <Image
              key={src}
              source={{ uri: imageUrl(src) }}
              style={styles.photo}
            />
          ))}
          <Text>
            {product.shop} · {product.address}
          </Text>
          <Text>
            {product.allergens} · {product.storage}
          </Text>
          <Text>{product.price} UZS</Text>
          <Button
            title="Ulashish / Поделиться"
            onPress={() => {
              void Share.share({
                message: base + "/p/" + id,
                url: base + "/p/" + id,
              });
            }}
          />
          <Field label="Miqdor / Количество" numeric value={qty} onChange={Q} />
          <Text>10%: {splitTotal(product.price, Number(qty)).deposit} UZS</Text>
          <Button
            title={
              (accept ? "✓ " : "") + "Shartlarga roziman / Принимаю условия"
            }
            onPress={() => A(!accept)}
          />
          <Button
            title="Shartlar / Условия"
            onPress={() => {
              void Linking.openURL(base + "/legal/offer");
            }}
          />
          {["click", "payme", "card"].map((p) => (
            <Button
              key={p}
              title={p}
              disabled={
                busy ||
                !accept ||
                !Number.isSafeInteger(Number(qty)) ||
                Number(qty) < 1
              }
              onPress={() => checkout(p)}
            />
          ))}
        </>
      )}
      <Message text={msg} />
    </Screen>
  );
}
