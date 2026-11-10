import 'react-native-url-polyfill/auto';
import * as SecureStore from 'expo-secure-store';
import { createClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const isSupabaseConfigured = Boolean(url && key);
const secureSessionStorage = {
  async getItem(key: string) {
    const countValue = await SecureStore.getItemAsync(`${key}.count`);
    if (!countValue) return null;
    const chunks = await Promise.all(Array.from({ length: Number(countValue) }, (_, i) => SecureStore.getItemAsync(`${key}.${i}`)));
    return chunks.some(chunk => chunk === null) ? null : chunks.join('');
  },
  async setItem(key: string, value: string) {
    const chunks = value.match(/.{1,1500}/g) ?? [''];
    const oldCount = Number(await SecureStore.getItemAsync(`${key}.count`) ?? 0);
    await Promise.all(chunks.map((chunk, i) => SecureStore.setItemAsync(`${key}.${i}`, chunk)));
    for (let i = chunks.length; i < oldCount; i++) await SecureStore.deleteItemAsync(`${key}.${i}`);
    await SecureStore.setItemAsync(`${key}.count`, String(chunks.length));
  },
  async removeItem(key: string) {
    const count = Number(await SecureStore.getItemAsync(`${key}.count`) ?? 0);
    await Promise.all(Array.from({ length: count }, (_, i) => SecureStore.deleteItemAsync(`${key}.${i}`)));
    await SecureStore.deleteItemAsync(`${key}.count`);
  },
};

export const supabase = isSupabaseConfigured
  ? createClient(url!, key!, {
      auth: {
        storage: secureSessionStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : null;
