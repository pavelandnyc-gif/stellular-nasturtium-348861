// Genera el par de claves VAPID para Web Push.  Uso: npm run vapid
import webpush from "web-push";
const k = webpush.generateVAPIDKeys();
console.log("Copia estas dos líneas en tus variables de entorno:\n");
console.log(`VAPID_PUBLIC_KEY=${k.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${k.privateKey}`);
console.log("\n(La privada es secreta: no la subas al repositorio ni la compartas.)");
