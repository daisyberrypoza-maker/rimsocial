// A fresh id for one send. The server returns the message it already made if the same id comes back (Send_Direct_Image step 2).
export const newClientId = () => crypto.randomUUID().replace(/-/g, '');
