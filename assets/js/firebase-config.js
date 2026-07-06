// Config del proyecto de Firebase "mesas examenes finales"
const firebaseConfig = {
  apiKey: "AIzaSyA9Og8Dy05Aq7EkGoVnEY14ivT9-9Z08tI",
  authDomain: "mesas-examenes-finales.firebaseapp.com",
  projectId: "mesas-examenes-finales",
  storageBucket: "mesas-examenes-finales.firebasestorage.app",
  messagingSenderId: "821906749416",
  appId: "1:821906749416:web:99ccf03fee4260e166165d"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
const FIREBASE_CONFIGURADO = firebaseConfig.apiKey !== "TU_API_KEY";
