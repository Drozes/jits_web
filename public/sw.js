// Service Worker for Web Push notifications
self.addEventListener("push", (event) => {
  const data = event.data?.json();
  if (!data) return;

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      data: data.data,
      icon: "/icon-192.png",
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const { type, id } = event.notification.data ?? {};
  let url = "/";

  if (type === "challenge") url = "/match/pending";
  if (type === "chat_message") url = `/messages/${id}`;
  if (type === "match_update") url = `/match/${id}/live`;

  event.waitUntil(clients.openWindow(url));
});
