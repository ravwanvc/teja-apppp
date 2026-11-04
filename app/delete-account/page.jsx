import Link from "next/link";
export default function DeleteAccount() {
  return (
    <main className="dashboard">
      <Link href="/login">Kirish / Вход</Link>
      <h1>Hisobni o‘chirish / Удаление аккаунта</h1>
      <p>
        Hisobingizga kiring. Faol buyurtma va qaytarishlarni yakunlang. So‘ng
        o‘chirishni tasdiqlang. / Войдите, завершите активные заказы и возвраты,
        затем подтвердите удаление.
      </p>
    </main>
  );
}
