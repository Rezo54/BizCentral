importScripts('https://www.gstatic.com/firebasejs/12.2.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.2.1/firebase-messaging-compat.js');

firebase.initializeApp({
 apiKey:'__FIREBASE_API_KEY__',
 authDomain:'__FIREBASE_AUTH_DOMAIN__',
 projectId:'__FIREBASE_PROJECT_ID__',
 storageBucket:'__FIREBASE_STORAGE_BUCKET__',
 messagingSenderId:'__FIREBASE_MESSAGING_SENDER_ID__',
 appId:'__FIREBASE_APP_ID__'
});

// This file is configured at build/runtime by BizCentral before production push is enabled.
// The placeholders deliberately prevent committing Firebase client configuration twice.
const messaging=firebase.messaging();
messaging.onBackgroundMessage(payload=>{
 const notification=payload.notification||{};
 self.registration.showNotification(notification.title||'BizCentral',{body:notification.body||'You have a new notification.',icon:'/favicon.ico',badge:'/favicon.ico',data:{url:payload.data?.url||'/dashboard'}});
});
self.addEventListener('notificationclick',event=>{event.notification.close();const url=event.notification.data?.url||'/dashboard';event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{for(const client of list){if('focus'in client){client.navigate(url);return client.focus()}}return clients.openWindow?clients.openWindow(url):undefined}))});
